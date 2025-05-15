from flask import Blueprint, request, jsonify
from models import db, Game, PlayerStats, GameAnalysis, Move
import chess
import chess.engine
import chess.pgn
import platform
from flask import current_app
from io import StringIO

chess_bp = Blueprint('chess', __name__)

# Helper to get Stockfish path from app config or platform
def get_stockfish_path():
    if hasattr(current_app, 'config') and 'STOCKFISH_PATH' in current_app.config:
        return current_app.config['STOCKFISH_PATH']
    if platform.system() == "Darwin":
        return "./static/stockfish/stockfish-macos"
    elif platform.system() == "Windows":
        return "./static/stockfish/stockfish.exe"
    elif platform.system() == "Linux":
        return "./static/stockfish/stockfish-linux"
    else:
        raise OSError("Unsupported operating system")

@chess_bp.route('/get_ai_move', methods=['POST'])
def get_ai_move():
    data = request.json
    fen = data.get('fen')
    difficulty = data.get('difficulty', 'medium')

    if not fen:
        return jsonify({'error': 'FEN not provided'}), 400

    difficulty_settings = {
        'easy': {'skill_level': 1, 'depth': 10},
        'medium': {'skill_level': 10, 'depth': 12},
        'hard': {'skill_level': 20, 'depth': 20}
    }
    settings = difficulty_settings.get(difficulty, difficulty_settings['medium'])

    try:
        board = chess.Board(fen)

        if board.is_game_over():
            return jsonify({
                'move': None,
                'evaluation': None,
                'game_over': True,
                'result': board.result()
            })

        with chess.engine.SimpleEngine.popen_uci(get_stockfish_path()) as engine:
            engine.configure({'Skill Level': settings['skill_level']})
            result = engine.play(board, chess.engine.Limit(depth=settings['depth'], time=1))

            move = result.move.uci() if result.move else None
            game_over = result.move is None
            evaluation = None
            try:
                info = engine.analyse(board, chess.engine.Limit(depth=settings['depth']))
                score_obj = info['score'].white()
                if isinstance(score_obj, chess.engine.Cp):
                    evaluation = score_obj.score()
                elif isinstance(score_obj, chess.engine.Mate):
                    mate_val = score_obj.mate()
                    evaluation = 100000 if mate_val > 0 else -100000
            except Exception:
                evaluation = None

            return jsonify({
                'move': move,
                'evaluation': evaluation,
                'game_over': game_over
            })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@chess_bp.route('/get_evaluation', methods=['POST'])
def get_evaluation():
    data = request.json
    fen = data.get('fen')
    difficulty = data.get('difficulty', 'medium')

    if not fen:
        return jsonify({'error': 'FEN not provided'}), 400

    difficulty_settings = {
        'easy': {'skill_level': 1, 'depth': 10},
        'medium': {'skill_level': 10, 'depth': 12},
        'hard': {'skill_level': 20, 'depth': 20}
    }
    settings = difficulty_settings.get(difficulty, difficulty_settings['medium'])

    try:
        with chess.engine.SimpleEngine.popen_uci(get_stockfish_path()) as engine:
            board = chess.Board(fen)
            engine.configure({'Skill Level': settings['skill_level']})

            info = engine.analyse(board, chess.engine.Limit(depth=settings['depth']))
            evaluation = None

            if 'score' in info:
                score = info['score'].white()
                if isinstance(score, chess.engine.Mate):
                    evaluation = 10000 if score.mate() > 0 else -10000
                elif isinstance(score, chess.engine.Cp):
                    evaluation = score.score()

            return jsonify({'evaluation': evaluation})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@chess_bp.route('/evaluate_move', methods=['POST'])
def evaluate_move():
    data = request.json
    fen_before = data.get('fen_before')
    move_uci = data.get('move')

    if not fen_before or not move_uci:
        return jsonify({'error': 'Missing FEN or move'}), 400

    try:
        board_before = chess.Board(fen_before)
        try:
            move = chess.Move.from_uci(move_uci)
        except Exception:
            return jsonify({'error': 'Invalid move format'}), 400

        if move not in board_before.legal_moves:
            return jsonify({'error': 'Illegal move'}), 400

        board_after = board_before.copy()
        board_after.push(move)

        with chess.engine.SimpleEngine.popen_uci(get_stockfish_path()) as engine:
            # Check if the player checkmated the AI
            if board_after.is_checkmate():
                return jsonify({
                    'cpl': 0,
                    'score': 10,
                    'feedback': "Checkmate! You won the game."
                })

            info_before = engine.analyse(board_before, chess.engine.Limit(depth=15))
            info_after = engine.analyse(board_after, chess.engine.Limit(depth=15))

            score_before = info_before['score'].white()
            score_after = info_after['score'].white()

            def score_to_cp(score_obj):
                if isinstance(score_obj, chess.engine.Cp):
                    return score_obj.score()
                elif isinstance(score_obj, chess.engine.Mate):
                    mate_val = score_obj.mate()
                    return 100000 if mate_val > 0 else -100000
                else:
                    return 0

            eval_before = score_to_cp(score_before)
            eval_after = score_to_cp(score_after)

            cpl = abs(eval_before - eval_after)

            if score_after.is_mate():
                mate_val = score_after.mate()
                if mate_val > 0:
                    feedback = f"You're delivering mate in {mate_val}"
                    score_value = 10
                else:
                    feedback = f"Opponent has mate in {abs(mate_val)}"
                    score_value = 0
            elif score_before.is_mate():
                mate_val = score_before.mate()
                if mate_val > 0:
                    feedback = f"You were delivering mate in {mate_val}, don't miss it!"
                    score_value = 5
                else:
                    feedback = f"Opponent was mating in {abs(mate_val)}, stay alert!"
                    score_value = 1
            else:
                if cpl == 0:
                    feedback = "Best move!"
                    score_value = 10
                elif cpl < 50:
                    feedback = "Good move."
                    score_value = 8
                elif cpl < 150:
                    feedback = "Inaccuracy."
                    score_value = 5
                elif cpl < 400:
                    feedback = "Mistake."
                    score_value = 3
                else:
                    feedback = "Blunder!"
                    score_value = 0

            return jsonify({
                'cpl': cpl,
                'score': score_value,
                'feedback': feedback
            })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@chess_bp.route('/save_game', methods=['POST'])
def save_game():
    data = request.json
    pgn = data.get('pgn')
    white = data.get('white')
    black = data.get('black')
    result = data.get('result')
    user_id = data.get('user_id')

    if not pgn or not white or not black or not result:
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        game = Game(
            pgn=pgn,
            white_player=white,
            black_player=black,
            result=result,
            user_id=user_id,
            date_played=None
        )
        db.session.add(game)
        db.session.commit()

        pgn = StringIO(data.get('pgn'))
        chess_game = chess.pgn.read_game(pgn)

        if not chess_game:
            return jsonify({'error': 'Invalid PGN'}), 400
        
        board = chess.Board()
        move_number = 1

        for move in chess_game.mainline_moves():
            try:
                san = board.san(move)
                board.push(move)
                move_entry = Move(
                    game_id=game.id,
                    move_number=move_number,
                    san=san,
                    uci=move.uci(),
                    fen=board.fen(),
                    score=None
                )
                db.session.add(move_entry)
                move_number += 1
            except Exception as e:
                return jsonify({'error': f'Invalid move in PGN: {move}'}), 400

        db.session.commit()

        update_stats(user_id, result, game.id, white)

        return jsonify({'status': 'success', 'game_id': game.id})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@chess_bp.route('/player_stats/<player_name>')
def get_player_stats_by_name(player_name):
    stats = PlayerStats.query.join(Game, PlayerStats.last_game_id == Game.id, isouter=True) \
        .join(GameAnalysis, Game.id == GameAnalysis.game_id, isouter=True) \
        .join(Game, PlayerStats.user_id == Game.user_id, isouter=True) \
        .filter(Game.white_player == player_name).first()
    if not stats:
        return jsonify({'error': 'Player not found'}), 404
    return jsonify({
        'wins': stats.wins,
        'losses': stats.losses,
        'draws': stats.draws,
        'rating': stats.rating,
        'last_game_id': stats.last_game_id
    })

@chess_bp.route('/api/player_stats/<int:user_id>')
def get_player_stats_by_id(user_id):
    stats = PlayerStats.query.filter_by(user_id=user_id).first_or_404()
    return jsonify({
        'wins': stats.wins,
        'losses': stats.losses,
        'draws': stats.draws,
        'rating': stats.rating,
        'best_move': stats.best_move if hasattr(stats, 'best_move') else None,
        'best_move_score': stats.best_move_score if hasattr(stats, 'best_move_score') else None,
        'worst_move': stats.worst_move if hasattr(stats, 'worst_move') else None,
        'worst_move_score': stats.worst_move_score if hasattr(stats, 'worst_move_score') else None,
        'average_score': stats.average_score if hasattr(stats, 'average_score') else None,
        'last_game_id': stats.last_game_id
    })

@chess_bp.route('/api/game_analysis/<int:game_id>')
def get_game_analysis(game_id):
    analysis = GameAnalysis.query.filter_by(game_id=game_id).order_by(GameAnalysis.move_number).all()
    return jsonify([{
        'move_number': a.move_number,
        'score': a.score,
        'comment': a.comment
    } for a in analysis])

def update_stats(user_id, result, game_id, white):
    player_stats = PlayerStats.query.filter_by(user_id=user_id).first()
    if not player_stats:
        player_stats = PlayerStats(user_id=user_id, wins=0, losses=0, draws=0, rating=1000, highest_rating=1000, last_game_id=None)
        db.session.add(player_stats)

    if white == 'Player':
        if result == '1-0':
            player_stats.wins += 1
        elif result == '0-1':
            player_stats.losses += 1
        else:
            player_stats.draws += 1
    elif white == 'AI':
        if result == '1-0':
            player_stats.losses += 1
        elif result == '0-1':
            player_stats.wins += 1
        else:
            player_stats.draws += 1
    else:
        raise ValueError(f"User with ID {user_id} did not participate in game {game_id}.")
    
    player_stats.last_game_id = game_id

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise ValueError(f"Failed to update player stats: {e}")
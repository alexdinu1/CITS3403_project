from flask import Blueprint, request, jsonify
from models import db, Game, PlayerStats, Move
import chess
import chess.engine
import platform
from flask import current_app

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
            if board_after.is_checkmate():
                return jsonify({
                    'score': 10,
                    'is_blunder': False,
                    'is_brilliant': True,
                    'comment': "Checkmate! You won the game."
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

            # Determine if move is a blunder or brilliant
            is_blunder = cpl > 200  # More than 2 pawns lost
            is_brilliant = cpl > 300 and eval_after > eval_before  # Gained more than 3 pawns

            return jsonify({
                'score': eval_after,
                'is_blunder': is_blunder,
                'is_brilliant': is_brilliant,
                'comment': generate_comment(eval_after)
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
    user_id = data.get('user_id')  # Get user_id sent from frontend

    if not pgn or not white or not black or not result:
        return jsonify({'error': 'Missing required fields'}), 400
        
    if not user_id:
        # If user_id is missing, just save the game without updating stats
        try:
            game = Game(
                pgn=pgn,
                white_player=white,
                black_player=black,
                result=result
            )
            db.session.add(game)
            db.session.commit()
            return jsonify({'status': 'success', 'game_id': game.id, 'warning': 'Game saved without user stats update'})
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    try:
        # Create and add the game first
        game = Game(
            pgn=pgn,
            white_player=white,
            black_player=black,
            result=result,
            user_id=user_id  # Set the user_id on the game
        )
        db.session.add(game)
        db.session.flush()  # This assigns an ID to the game without committing

        # Find or create player stats for this user
        stats = PlayerStats.query.filter_by(user_id=user_id).first()
        if not stats:
            stats = PlayerStats(user_id=user_id, wins=0, losses=0, draws=0, rating=1200, highest_rating=1200)
            db.session.add(stats)
        
        # Convert chess notation result to win/loss/draw status from the perspective of the current user
        is_player_white = (white == "Player")
        
        # Update stats based on game result
        if result == '1-0':  # White wins
            if is_player_white:
                stats.wins += 1
                stats.rating += 10
            else:
                stats.losses += 1
                stats.rating -= 8
        elif result == '0-1':  # Black wins
            if not is_player_white:
                stats.wins += 1
                stats.rating += 10
            else:
                stats.losses += 1
                stats.rating -= 8
        elif result == '1/2-1/2':  # Draw
            stats.draws += 1
            stats.rating += 2
            
        # Update highest rating if needed
        if stats.rating > stats.highest_rating:
            stats.highest_rating = stats.rating
        
        # Update last game reference
        stats.last_game_id = game.id

        db.session.commit()
        return jsonify({'game_status': 'success', 'game_id': game.id})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
    
@chess_bp.route('/update_game/<int:game_id>', methods=['POST'])
def update_game(game_id):
    data = request.json
    result = data.get('result')
    if not result:
        return jsonify({'error': 'Missing result'}), 400

    game = Game.query.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404

    game.result = result
    db.session.commit()
    return jsonify({'status': 'success', 'game_id': game.id})

@chess_bp.route('/player_stats/<player_name>')
def get_player_stats_by_name(player_name):
    stats = PlayerStats.query.join(Game, PlayerStats.last_game_id == Game.id, isouter=True) \
        .join(Move, Game.id == Move.game_id, isouter=True) \
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
    moves = Move.query.filter_by(game_id=game_id).order_by(Move.move_number).all()
    return jsonify([{
        'move_number': m.move_number,
        'score': m.score,
        'is_blunder': m.is_blunder,
        'is_brilliant': m.is_brilliant,
        'comment': m.comment
    } for m in moves])

def generate_comment(score):
    """Generate a comment based on the move's score."""
    if score > 300:
        return "Excellent tactical play."
    elif score > 100:
        return "Maintaining advantage."
    elif score > 0:
        return "Slightly better position."
    elif score > -100:
        return "Position is equal."
    elif score > -300:
        return "Slight disadvantage."
    else:
        return "Significant disadvantage."
    
@chess_bp.route('/api/record_moves_batch', methods=['POST'])
def record_moves_batch():
    data = request.json
    moves = data.get('moves', [])
    if not moves or not isinstance(moves, list):
        return jsonify({'error': 'No moves provided'}), 400
    try:
        move_objects = []
        for move in moves:
            move_obj = Move(
                game_id=move['game_id'],
                move_number=move['move_number'],
                game_state=move['game_state'],
                score=move.get('score',0),
                is_blunder=move.get('is_blunder',False),
                is_brilliant=move.get('is_brilliant',False),
                comment=move.get('comment','')
            )
            move_objects.append(move_obj)
        db.session.bulk_save_objects(move_objects)
        db.session.commit()
        return jsonify({'status': 'success', 'moves_saved': len(move_objects)})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
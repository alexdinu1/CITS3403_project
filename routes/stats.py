from flask import Blueprint, jsonify
from models import db, PlayerStats, GameAnalysis, Game, User, Move
from sqlalchemy import func
import math
import chess
import chess.pgn

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/api/player_stats/<int:user_id>')
def get_player_stats_by_id(user_id):
    if not user_id:
        app.logger.error('No user_id provided')
        return jsonify({'error': 'User ID required'}), 400
    
    try:
        # Verify user exists
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Get or create player stats
        stats = PlayerStats.query.filter_by(user_id=user_id).first()
        if not stats:
            stats = PlayerStats(user_id=user_id)
            db.session.add(stats)
            db.session.commit()

        # Calculate average score for all analyzed games
        avg_score_query = db.session.query(
            func.avg(GameAnalysis.score)
        ).join(Game, GameAnalysis.game_id == Game.id).filter(Game.user_id == user_id)
        
        avg_score = avg_score_query.scalar() or 0

        # Get the last game's analysis for best/worst moves
        last_game_analysis = []
        best_move = None
        worst_move = None
        
        if stats.last_game_id:
            last_game_analysis = GameAnalysis.query.filter_by(
                game_id=stats.last_game_id
            ).order_by(GameAnalysis.move_number).all()
            
            if last_game_analysis:
                best_move = max(last_game_analysis, key=lambda x: x.score)
                worst_move = min(last_game_analysis, key=lambda x: x.score)

        # Calculate move range averages
        average_scores = []
        if last_game_analysis:
            move_ranges = {}
            for analysis in last_game_analysis:
                range_start = math.floor((analysis.move_number - 1) / 5) * 5 + 1
                range_key = f"{range_start}-{range_start + 4}"
                if range_key not in move_ranges:
                    move_ranges[range_key] = []
                move_ranges[range_key].append(analysis.score)
            
            for range_key, scores in move_ranges.items():
                avg = sum(scores) / len(scores)
                average_scores.append(avg)
        
        highest_average = max(average_scores) if average_scores else 0
        lowest_average = min(average_scores) if average_scores else 0

        # Get win/loss/draw stats
        game_stats = db.session.query(
            func.count(Game.id).label('total'),
            func.sum(Game.result == 'win').label('wins'),
            func.sum(Game.result == 'loss').label('losses'),
            func.sum(Game.result == 'draw').label('draws')
        ).filter(Game.user_id == user_id).first()

        return jsonify({
            'wins': game_stats.wins if game_stats and game_stats.wins else stats.wins,
            'losses': game_stats.losses if game_stats and game_stats.losses else stats.losses,
            'draws': game_stats.draws if game_stats and game_stats.draws else stats.draws,
            'rating': stats.rating,
            'average_score': float(avg_score),
            'highest_average': float(highest_average),
            'lowest_average': float(lowest_average),
            'last_game_id': stats.last_game_id,
            'best_move': best_move.move_number if best_move else None,
            'best_move_score': best_move.score if best_move else None,
            'worst_move': worst_move.move_number if worst_move else None,
            'worst_move_score': worst_move.score if worst_move else None,
            'average_scores': average_scores
        })
    except Exception as e:
        print(f"Error in get_player_stats_by_id: {str(e)}")
        return jsonify({'error': str(e)}), 500

@stats_bp.route('/api/game_analysis/<int:game_id>')
def get_game_analysis(game_id):
    try:
        # First check if game exists and is analyzed
        game = Game.query.get(game_id)
        if not game:
            return jsonify({'error': 'Game not found'}), 404
            
        # Check if game has been analyzed
        if not game.analyzed:
            return jsonify({'error': 'Game not analyzed yet'}), 404
            
        # Get all analysis for this game, ordered by move number
        analysis = GameAnalysis.query.filter_by(game_id=game_id)\
                          .order_by(GameAnalysis.move_number)\
                          .all()
        
        if not analysis:
            return jsonify({'error': 'No analysis found for this game'}), 404
            
        # Format the analysis data for response
        analysis_data = [{
            'move_number': a.move_number,
            'score': a.score,
            'is_blunder': a.is_blunder,
            'is_brilliant': a.is_brilliant,
            'comment': a.comment,
            'fen': get_fen_for_move(game, a.move_number)  # Helper function to get FEN
        } for a in analysis]

        return jsonify(analysis_data)
        
    except Exception as e:
        print(f"Error in get_game_analysis: {str(e)}")
        return jsonify({'error': str(e)}), 500

def get_fen_for_move(game, move_number):
    """
    Helper function to get the FEN after a specific move number
    """
    try:
        # Get all moves up to the requested move number
        moves = Move.query.filter_by(game_id=game.id)\
                   .filter(Move.move_number <= move_number)\
                   .order_by(Move.move_number)\
                   .all()
        
        # Replay the moves to get the position
        board = chess.Board()
        for move in moves:
            chess_move = chess.Move.from_uci(move.uci)
            board.push(chess_move)
            
        return board.fen()
        
    except Exception as e:
        print(f"Error getting FEN for move {move_number}: {str(e)}")
        return None
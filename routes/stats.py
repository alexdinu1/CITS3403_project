from flask import Blueprint, jsonify
from models import db, PlayerStats, GameAnalysis
from sqlalchemy import func

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/api/player_stats/<int:user_id>')
def get_player_stats_by_id(user_id):
    try:
        # Get basic player stats
        stats = PlayerStats.query.filter_by(user_id=user_id).first_or_404()
        
        # Calculate average score for all analyzed games
        avg_score = db.session.query(
            func.avg(GameAnalysis.score)
        ).join(GameAnalysis.game).filter_by(user_id=user_id).scalar() or 0

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

        # Optionally, calculate highest/lowest averages (stubbed here)
        highest_average = 7  # Replace with real calculation if needed
        lowest_average = 4   # Replace with real calculation if needed

        return jsonify({
            'wins': stats.wins,
            'losses': stats.losses,
            'draws': stats.draws,
            'rating': stats.rating,
            'average_score': float(avg_score),
            'highest_average': highest_average,
            'lowest_average': lowest_average,
            'last_game_id': stats.last_game_id,
            'best_move': best_move.move_number if best_move else None,
            'best_move_score': best_move.score if best_move else None,
            'worst_move': worst_move.move_number if worst_move else None,
            'worst_move_score': worst_move.score if worst_move else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@stats_bp.route('/api/game_analysis/<int:game_id>')
def get_game_analysis(game_id):
    analysis = GameAnalysis.query.filter_by(game_id=game_id).order_by(GameAnalysis.move_number).all()
    return jsonify([{
        'move_number': a.move_number,
        'score': a.score,
        'comment': a.comment
    } for a in analysis])
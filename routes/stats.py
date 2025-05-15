from flask import Blueprint, request, jsonify
from models import db, PlayerStats, Game, User, Move
from sqlalchemy import func
import math
import chess
import chess.pgn

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/api/player_stats/<int:user_id>')
def get_player_stats_by_id(user_id):
    if not user_id:
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
    except Exception as e:
        print(f"Error in get_player_stats_by_id: {str(e)}")
        return jsonify({'error': str(e)}), 500

@stats_bp.route('/api/game_analysis/<int:game_id>')
def get_game_analysis(game_id):
    try:
        # First check if game exists
        game = Game.query.get(game_id)
        if not game:
            return jsonify({'error': 'Game not found'}), 404
            
        # Check if game has been analyzed
        if not game.analyzed:
            return jsonify({'error': 'Game not analyzed yet'}), 404
            
        # Get all moves with analysis for this game
        moves = Move.query.filter_by(game_id=game_id)\
                         .order_by(Move.move_number)\
                         .all()
        
        if not moves:
            return jsonify({'error': 'No moves found for this game'}), 404
            
        # Format the move data for response
        analysis_data = [{
            'move_number': m.move_number,
            'score': m.score,
            'is_blunder': m.is_blunder,
            'is_brilliant': m.is_brilliant,
            'comment': m.comment,
            'fen': m.game_state  # Use game_state instead of get_fen_for_move
        } for m in moves]

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

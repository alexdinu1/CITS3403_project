from flask import Blueprint, request, jsonify, render_template
from datetime import datetime
from models import db, Game, Move
from sqlalchemy import func

move_bp = Blueprint('move', __name__)

@move_bp.route('/record_move', methods=['POST'])
def record_move():
    """Record a move in the database."""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['game_id', 'move_number', 'game_state']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Create new move record
        new_move = Move(
            game_id=data['game_id'],
            move_number=data['move_number'],
            game_state=data['game_state']
        )
        
        db.session.add(new_move)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'move_id': new_move.id
        })
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@move_bp.route('/get_game_moves', methods=['GET'])
def get_game_moves():
    """Get all moves for a specific game."""
    try:
        game_id = request.args.get('game_id')
        if not game_id:
            return jsonify({'error': 'Missing game_id parameter'}), 400
            
        moves = Move.query.filter_by(game_id=game_id).order_by(Move.move_number).all()
        
        return jsonify({
            'success': True,
            'moves': [{
                'id': move.id,
                'move_number': move.move_number,
                'san': move.san,
                'uci': move.uci,
                'fen': move.fen,
                'score': move.score
            } for move in moves]
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
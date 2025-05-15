from flask import Blueprint, request, jsonify
from models import db, Game, Move, GameAnalysis
import chess
import chess.pgn

analysis_bp = Blueprint('analysis', __name__)

# Constants for score evaluation
BLUNDER_THRESHOLD = 3.0  # thresholds adjusted for the 0-10 scale
BRILLIANT_THRESHOLD = 8.0  # thresholds adjusted for the 0-10 scale

@analysis_bp.route('/analyze_game/<int:game_id>', methods=['POST'])
def analyze_game(game_id):
    """Analyze a game and save the analysis to the database"""
    try:
        # Get the game from the database
        game = Game.query.get(game_id)
        if not game:
            return jsonify({'error': 'Game not found'}), 404
            
        # Check if game is already analyzed
        if game.analyzed:
            # Return existing analysis
            existing_analysis = GameAnalysis.query.filter_by(game_id=game_id).all()
            if existing_analysis:
                return jsonify([{
                    'move_number': a.move_number,
                    'score': a.score,
                    'is_blunder': a.is_blunder,
                    'is_brilliant': a.is_brilliant,
                    'comment': a.comment
                } for a in existing_analysis]), 200
        
        # Parse the PGN
        chess_game = chess.pgn.read_game(chess.pgn.StringIO(game.pgn))
        if not chess_game:
            return jsonify({'error': 'Could not parse game PGN'}), 400
            
        # Initialize a board
        board = chess_game.board()
        
        # Track moves and analysis
        moves_analysis = []
        move_number = 1
        
        # Process each move in the game
        for node in chess_game.mainline():
            # Get the move
            move = node.move
            if move is None:
                continue
                
            # Get move in UCI format
            uci_move = move.uci()
            
            # Make the move on the board
            board.push(move)
            
            # Get FEN string for current position
            fen = board.fen()
            
            # Get the evaluation (simplified example - in a real app, use Stockfish here)
            score = generate_mock_score(move_number)
            
            # Determine if this is a blunder or brilliant move
            is_blunder = score < BLUNDER_THRESHOLD
            is_brilliant = score > BRILLIANT_THRESHOLD
            
            # Create a comment based on score
            comment = generate_comment(score)
            
            # Store move analysis
            moves_analysis.append({
                'move_number': move_number,
                'score': score,
                'is_blunder': is_blunder,
                'is_brilliant': is_brilliant,
                'comment': comment
            })
            
            # Increment move counter
            move_number += 1
        
        # Save analysis to database
        save_game_analysis(game_id, moves_analysis)
        
        # Mark game as analyzed
        game.analyzed = True
        db.session.commit()
        
        return jsonify(moves_analysis), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@analysis_bp.route('/get_game_analysis/<int:game_id>', methods=['GET'])
def get_game_analysis(game_id):
    """Get the analysis for a specific game"""
    try:
        # Get the game to check it exists
        game = Game.query.get(game_id)
        if not game:
            return jsonify({'error': 'Game not found'}), 404
            
        # If game exists but is not analyzed, analyze it first
        if not game.analyzed:
            return analyze_game(game_id)  # This will analyze and return the results
            
        # Get analysis from database
        analysis = GameAnalysis.query.filter_by(game_id=game_id).order_by(GameAnalysis.move_number).all()
        
        # Format results
        result = [{
            'move_number': a.move_number,
            'score': a.score,
            'is_blunder': a.is_blunder,
            'is_brilliant': a.is_brilliant,
            'comment': a.comment
        } for a in analysis]
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# API endpoint to get game analysis - using more RESTful naming
@analysis_bp.route('/api/game_analysis/<int:game_id>', methods=['GET'])
def api_game_analysis(game_id):
    """Get analysis for a specific game"""
    return get_game_analysis(game_id)

def save_game_analysis(game_id, moves_analysis):
    """Save analysis data for each move in a game"""
    try:
        # Delete any existing analysis for this game
        GameAnalysis.query.filter_by(game_id=game_id).delete()
        db.session.commit()
        
        # Insert new analysis data
        for analysis in moves_analysis:
            move_number = analysis.get('move_number')
            score = analysis.get('score')
            is_blunder = analysis.get('is_blunder', False)
            is_brilliant = analysis.get('is_brilliant', False)
            comment = analysis.get('comment', '')
            
            new_analysis = GameAnalysis(
                game_id=game_id,
                move_number=move_number,
                score=score,
                is_blunder=is_blunder,
                is_brilliant=is_brilliant,
                comment=comment
            )
            db.session.add(new_analysis)
        
        db.session.commit()
        return True
    except Exception as e:
        db.session.rollback()
        print(f"Error saving game analysis: {str(e)}")
        return False

def generate_mock_score(move_number):
    """Generate a mock score for demonstration purposes
    
    In a real application, this would be replaced with actual engine analysis
    """
    # Start with high scores that gradually decrease as the game progresses
    # This simulates how players typically make more mistakes as games go on
    base_score = max(10 - (move_number / 5), 1)
    
    # Add some randomness to make it more realistic
    random_factor = random.uniform(-1.0, 1.0)
    
    # Clamp the final score between 0 and 10
    final_score = max(0, min(10, base_score + random_factor))
    return round(final_score, 1)

def generate_comment(score):
    """Generate a comment based on the move score"""
    if score >= 9:
        return "Brilliant move!"
    elif score >= 8:
        return "Excellent move"
    elif score >= 7:
        return "Very good move"
    elif score >= 6:
        return "Good move"
    elif score >= 5:
        return "Solid move"
    elif score >= 4:
        return "Inaccuracy"
    elif score >= 3:
        return "Mistake"
    else:
        return "Blunder"
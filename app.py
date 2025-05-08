import os
import platform
import chess
import chess.engine
import json
from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from datetime import datetime
from flask_migrate import Migrate
from models import db, User, Game, Move, PlayerStats, Friendship, GameAnalysis

# May need to delete this
from werkzeug.security import generate_password_hash, check_password_hash
from pathlib import Path

app = Flask(__name__)

basedir = Path(__file__).parent
instance_path = Path(app.instance_path)
instance_path.mkdir(exist_ok=True)
db_path = instance_path / 'app.db'

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

migrate = Migrate(app, db)

# Determine the correct Stockfish binary based on the OS
if platform.system() == "Darwin":  # macOS
    STOCKFISH_PATH = "./static/stockfish/stockfish-macos"
elif platform.system() == "Windows":  # Windows
    STOCKFISH_PATH = "./static/stockfish/stockfish.exe"
elif platform.system() == "Linux":  # Linux
    STOCKFISH_PATH = "./static/stockfish/stockfish-linux"
else:
    raise OSError("Unsupported operating system")

# Initialize the database
@app.cli.command('init-db')
def init_db():
    with app.app_context():
        db.create_all()
    print('Initialized the database.')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/play')
def play():
    return render_template('play.html')

@app.route('/info')
def info():
    return render_template('info.html')

@app.route('/stats')
def stats():
    return render_template('stats.html')

@app.route('/friends')
def friends():
    return render_template('friends.html')

# Redirects for .html files
@app.route('/index.html')
def index_html_redirect():
    return redirect(url_for('index'))

@app.route('/play.html')
def play_html_redirect():
    return redirect(url_for('play'))

@app.route('/info.html')
def info_html_redirect():
    return redirect(url_for('info'))

@app.route('/stats.html')
def stats_html_redirect():
    return redirect(url_for('stats'))

@app.route('/friends.html')
def friends_html_redirect():
    return redirect(url_for('friends'))

@app.route('/get_ai_move', methods=['POST'])
def get_ai_move():
    data = request.json
    fen = data.get('fen')
    difficulty = data.get('difficulty', 'medium')

    if not fen:
        return jsonify({'error': 'FEN not provided'}), 400

    difficulty_settings = {
        'easy': {'skill_level': 1, 'depth': 10},
        'medium': {'skill_level': 10, 'depth': 12},
        'hard': {'skill_level': 20, 'depth': None}
    }
    settings = difficulty_settings.get(difficulty, difficulty_settings['medium'])

    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            board = chess.Board(fen)

            engine.configure({'Skill Level': settings['skill_level']})
            result = engine.play(board, chess.engine.Limit(depth=settings['depth']))

            info = engine.analyse(board, chess.engine.Limit(depth=settings['depth']))
            evaluation = None

            # Check if the score is available
            if 'score' in info:
                score = info['score'].white()
                if isinstance(score, chess.engine.Mate):
                    # Mate score: positive for AI winning, negative for opponent winning
                    evaluation = 10000 if score > 0 else -10000
                elif isinstance(score, chess.engine.Cp):
                    # Centipawn score
                    evaluation = score.score()

            return jsonify({
                'move': result.move.uci(),
                'evaluation': evaluation
            })

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/get_evaluation', methods=['POST'])
def get_evaluation():
    data = request.json
    fen = data.get('fen')
    difficulty = data.get('difficulty', 'medium')

    if not fen:
        return jsonify({'error': 'FEN not provided'}), 400

    difficulty_settings = {
        'easy': {'skill_level': 1, 'depth': 10},
        'medium': {'skill_level': 10, 'depth': 12},
        'hard': {'skill_level': 20, 'depth': None}
    }
    settings = difficulty_settings.get(difficulty, difficulty_settings['medium'])

    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            board = chess.Board(fen)
            engine.configure({'Skill Level': settings['skill_level']})

            info = engine.analyse(board, chess.engine.Limit(depth=settings['depth']))
            evaluation = None

            if 'score' in info:
                score = info['score'].white()
                if isinstance(score, chess.engine.Mate):
                    # Positive = white is mating, negative = black is mating
                    evaluation = 10000 if score.mate() > 0 else -10000
                elif isinstance(score, chess.engine.Cp):
                    evaluation = score.score()

            return jsonify({'evaluation': evaluation})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/evaluate_move', methods=['POST'])
def evaluate_move():
    data = request.json
    fen_before = data.get('fen_before')
    fen_after = data.get('fen_after')

    if not fen_before or not fen_after:
        return jsonify({'error': 'Missing FEN(s)'}), 400

    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            board_before = chess.Board(fen_before)
            board_after = chess.Board(fen_after)

            # Evaluate the position before the move
            info_before = engine.analyse(board_before, chess.engine.Limit(depth=15))
            eval_before = info_before['score'].white().score()

            # Evaluate the position after the move
            info_after = engine.analyse(board_after, chess.engine.Limit(depth=15))
            eval_after = info_after['score'].white().score()

            # Calculate Centipawn Loss (CPL)
            cpl = abs(eval_before - eval_after)

            # Map CPL to a score
            if cpl == 0:
                score = 10
                feedback = "Perfect move"
            elif cpl <= 20:
                score = 9
                feedback = "Excellent move"
            elif cpl <= 50:
                score = 7
                feedback = "Good move"
            elif cpl <= 100:
                score = 5
                feedback = "Average move"
            elif cpl <= 200:
                score = 3
                feedback = "Inaccuracy"
            elif cpl <= 500:
                score = 1
                feedback = "Mistake"
            else:
                score = 0
                feedback = "Blunder"

            return jsonify({
                'cpl': cpl,
                'score': score,
                'feedback': feedback
            })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)

@app.route('/save_game', methods=['POST'])
def save_game():
    data = request.get_json()
    
    game = Game(
        pgn=data['pgn'],
        white_player=data['white'],
        black_player=data['black'],
        result=data['result'],
        user_id=data['user_id']
    )
    
    db.session.add(game)
    db.session.commit()
    
    # Update stats
    update_stats(data['white'], data['black'], data['result'])
    
    return jsonify({"status": "success", "game_id": game.id})

def update_stats(white, black, result):
    # Get or create players
    white_stats = PlayerStats.query.filter_by(player_name=white).first()
    if not white_stats:
        white_stats = PlayerStats(player_name=white)
        db.session.add(white_stats)
    
    black_stats = PlayerStats.query.filter_by(player_name=black).first()
    if not black_stats:
        black_stats = PlayerStats(player_name=black)
        db.session.add(black_stats)
    
    # Update stats
    if result == '1-0':
        white_stats.wins += 1
        black_stats.losses += 1
    elif result == '0-1':
        black_stats.wins += 1
        white_stats.losses += 1
    else:
        white_stats.draws += 1
        black_stats.draws += 1
    
    db.session.commit()

@app.route('/player_stats/<player_name>')
def get_player_stats_by_name(player_name):
    stats = PlayerStats.query.filter_by(player_name=player_name).first()
    if stats:
        return jsonify({
            "wins": stats.wins,
            "losses": stats.losses,
            "draws": stats.draws,
            "rating": stats.rating
        })
    return jsonify({"error": "Player not found"}), 404

@app.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data received"}), 400
            
        user = User.query.filter((User.username == data.get('username')) | 
                               (User.email == data.get('username'))).first()
        
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        if not user or not check_password_hash(user.password_hash, data.get('password', '')):
            return jsonify({"error": "Invalid username or password"}), 401
            
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        # Create stats if missing
        if not user.stats:
            stats = PlayerStats(user_id=user.id)
            db.session.add(stats)
            db.session.commit()
        
        return jsonify({
            "status": "success",
            "user_id": user.id,
            "username": user.username
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data received"}), 400
            
        # Validate required fields
        required = ['username', 'email', 'password']
        if not all(field in data for field in required):
            return jsonify({"error": "Missing required fields"}), 400
            
        # Check for existing user
        if User.query.filter_by(username=data['username']).first():
            return jsonify({"error": "Username already exists"}), 400
        if User.query.filter_by(email=data['email']).first():
            return jsonify({"error": "Email already exists"}), 400
            
        user = User(
            username=data['username'],
            email=data['email'],
            password_hash=generate_password_hash(data['password'], method='pbkdf2:sha256'),
            last_login=datetime.now(),
            is_active=True
        )
        db.session.add(user)
        db.session.commit()
        
        # Create default stats
        stats = PlayerStats(
            user_id=user.id,
            wins=0,
            losses=0,
            draws=0,
            rating=1000,
            highest_rating=1000,
            last_game_id=None
        )
        db.session.add(stats)
        db.session.commit()
        
        return jsonify({
            "status": "success",
            "user_id": user.id,
            "username": user.username
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    
# Add these new routes

@app.route('/api/player_stats/<int:user_id>')
def get_player_stats_api(user_id):
    stats = PlayerStats.query.filter_by(user_id=user_id).first_or_404()
    return jsonify({
        'wins': stats.wins,
        'losses': stats.losses,
        'draws': stats.draws,
        'rating': stats.rating,
        'best_move': stats.best_move,
        'best_move_score': stats.best_move_score,
        'worst_move': stats.worst_move,
        'worst_move_score': stats.worst_move_score,
        'average_score': stats.average_score,
        'last_game_id': stats.last_game_id
    })

@app.route('/api/game_analysis/<int:game_id>')
def get_game_analysis(game_id):
    analysis = GameAnalysis.query.filter_by(game_id=game_id).order_by(GameAnalysis.move_number).all()
    return jsonify([{
        'move_number': a.move_number,
        'score': a.score,
        'comment': a.comment
    } for a in analysis])

@app.route('/api/friends/<int:user_id>')
def get_friends(user_id):
    friends = Friendship.query.filter(
        (Friendship.user_id == user_id) | (Friendship.friend_id == user_id),
        Friendship.status == 'accepted'
    ).all()
    
    friend_ids = []
    for f in friends:
        if f.user_id == user_id:
            friend_ids.append(f.friend_id)
        else:
            friend_ids.append(f.user_id)
    
    friends_data = User.query.filter(User.id.in_(friend_ids)).all()
    return jsonify([{
        'id': f.id,
        'username': f.username,
        'rating': f.stats.rating if f.stats else 1000,
        'last_active': f.last_login.isoformat() if f.last_login else None
    } for f in friends_data])

@app.route('/api/friend_requests/<int:user_id>')
def get_friend_requests(user_id):
    requests = Friendship.query.filter_by(
        friend_id=user_id,
        status='pending'
    ).all()
    
    requesters = User.query.filter(User.id.in_([r.user_id for r in requests])).all()
    return jsonify([{
        'id': r.id,
        'username': u.username,
        'request_date': r.created_at.isoformat(),
        'rating': u.stats.rating if u.stats else 1000
    } for r, u in zip(requests, requesters)])

@app.route('/api/friend_action', methods=['POST'])
def handle_friend_action():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
        
    action = data.get('action')
    
    if action == 'add':
        try:
            user_id = data.get('user_id')
            friend_id = data.get('friend_id')
            
            if not user_id or not friend_id:
                return jsonify({'error': 'Missing user_id or friend_id'}), 400
                
            # Check if friendship already exists
            existing = Friendship.query.filter(
                ((Friendship.user_id == user_id) & (Friendship.friend_id == friend_id)) |
                ((Friendship.user_id == friend_id) & (Friendship.friend_id == user_id))
            ).first()
            
            if existing:
                return jsonify({
                    'status': 'error',
                    'message': 'Friendship already exists or pending'
                }), 400
                
            # Create new friendship request
            friendship = Friendship(
                user_id=user_id,
                friend_id=friend_id,
                status='pending',
                created_at=datetime.utcnow()
            )
            db.session.add(friendship)
            db.session.commit()
            
            return jsonify({
                'status': 'success',
                'message': 'Friend request sent'
            })
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    
    # Existing actions (accept/reject/remove)
    friendship_id = data.get('friendship_id')
    if not friendship_id:
        return jsonify({'error': 'Missing friendship_id'}), 400
        
    friendship = Friendship.query.get(friendship_id)
    if not friendship:
        return jsonify({'error': 'Friendship not found'}), 404
    
    if action == 'accept':
        friendship.status = 'accepted'
    elif action == 'reject':
        friendship.status = 'rejected'
    elif action == 'remove':
        db.session.delete(friendship)
    else:
        return jsonify({'error': 'Invalid action'}), 400
    
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/player_stats/<int:user_id>')
def get_player_stats_by_id(user_id):
    try:
        # Get basic player stats
        stats = PlayerStats.query.filter_by(user_id=user_id).first_or_404()
        
        # Calculate additional statistics
        avg_score = db.session.query(
            func.avg(GameAnalysis.score)
            .filter(GameAnalysis.game.has(user_id=user_id))
            .scalar() or 0
        )
        
        # Get the last game's analysis for best/worst moves
        last_game_analysis = GameAnalysis.query.filter_by(
            game_id=stats.last_game_id).order_by(GameAnalysis.move_number).all()
        
        best_move = max(last_game_analysis, key=lambda x: x.score) if last_game_analysis else None
        worst_move = min(last_game_analysis, key=lambda x: x.score) if last_game_analysis else None
        
        return jsonify({
            'wins': stats.wins,
            'losses': stats.losses,
            'draws': stats.draws,
            'rating': stats.rating,
            'average_score': float(avg_score),
            'highest_average': 7,  # Need to implement proper calculation
            'lowest_average': 4,   # Need to implement proper calculation
            'last_game_id': stats.last_game_id,
            'best_move': best_move.move_number if best_move else None,
            'best_move_score': best_move.score if best_move else None,
            'worst_move': worst_move.move_number if worst_move else None,
            'worst_move_score': worst_move.score if worst_move else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search_players')
def search_players():
    query = request.args.get('q', '').strip()
    exclude_id = request.args.get('exclude', type=int)
    
    if not query:
        return jsonify([])
    
    # Search by username (case insensitive)
    users = User.query.filter(
        User.username.ilike(f'%{query}%'),
        User.id != exclude_id
    ).limit(20).all()
    
    results = []
    for user in users:
        stats = PlayerStats.query.filter_by(user_id=user.id).first()
        results.append({
            'id': user.id,
            'username': user.username,
            'rating': stats.rating if stats else 1000,
            'wins': stats.wins if stats else 0,
            'losses': stats.losses if stats else 0,
            'draws': stats.draws if stats else 0,
            'last_active': user.last_login.isoformat() if user.last_login else None
        })
    
    return jsonify(results)

@app.route('/api/suggestions/<int:user_id>')
def get_suggestions(user_id):
    # Get users who are not friends and not already requested
    # Example implementation:
    friends = Friendship.query.filter(
        (Friendship.user_id == user_id) | 
        (Friendship.friend_id == user_id)
    ).all()
    
    friend_ids = {user_id}
    for f in friends:
        if f.user_id == user_id:
            friend_ids.add(f.friend_id)
        else:
            friend_ids.add(f.user_id)
    
    # Get some random users who aren't friends
    suggestions = User.query.filter(
        User.id != user_id,
        ~User.id.in_(friend_ids)
    ).order_by(func.random()).limit(5).all()
    
    return jsonify([{
        'id': u.id,
        'username': u.username,
        'rating': u.stats.rating if u.stats else 1000,
        'wins': u.stats.wins if u.stats else 0,
        'losses': u.stats.losses if u.stats else 0,
        'draws': u.stats.draws if u.stats else 0,
        'last_active': u.last_login.isoformat() if u.last_login else None
    } for u in suggestions])

@app.route('/api/get_friendship')
def get_friendship():
    user_id = request.args.get('user_id', type=int)
    friend_id = request.args.get('friend_id', type=int)
    
    friendship = Friendship.query.filter(
        ((Friendship.user_id == user_id) & (Friendship.friend_id == friend_id)) |
        ((Friendship.user_id == friend_id) & (Friendship.friend_id == user_id))
    ).first()
    
    if not friendship:
        return jsonify({'error': 'Friendship not found'}), 404
        
    return jsonify({
        'id': friendship.id,
        'user_id': friendship.user_id,
        'friend_id': friendship.friend_id,
        'status': friendship.status
    })

@app.route('/friend_stats/<int:friend_id>')
def friend_stats(friend_id):
    return render_template('friend_stats.html', friend_id=friend_id)

# Route to get current user from session
@app.route('/api/current_user')
def get_current_user():
    # If you're using Flask sessions for authentication
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({
        "user_id": user.id,
        "username": user.username
    })

# Route to get user by ID (for testing when no session)
@app.route('/api/current_user/<int:user_id>')
def get_user_by_id(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({
        "user_id": user.id,
        "username": user.username
    })
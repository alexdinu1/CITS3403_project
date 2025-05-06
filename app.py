import os
import platform
import chess
import chess.engine
from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from flask_migrate import Migrate

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
db = SQLAlchemy(app)
migrate = Migrate(app, db)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    # Relationship to stats
    stats = db.relationship('PlayerStats', backref='user', uselist=False)

class Game(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pgn = db.Column(db.Text, nullable=False)
    white_player = db.Column(db.String(50))
    black_player = db.Column(db.String(50))
    result = db.Column(db.String(10))
    date_played = db.Column(db.DateTime, default=datetime.now)
    moves = db.relationship('Move', backref='game', lazy=True)

class PlayerStats(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    wins = db.Column(db.Integer, default=0)
    losses = db.Column(db.Integer, default=0)
    draws = db.Column(db.Integer, default=0)
    rating = db.Column(db.Integer, default=1000)

class Move(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'))
    move_number = db.Column(db.Integer)
    move_text = db.Column(db.String(10))
    fen = db.Column(db.String(100))

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

@app.route('/get_ai_move', methods=['POST'])
def get_ai_move():
    data = request.json
    fen = data.get('fen')  # Get the current board position in FEN format
    difficulty = data.get('difficulty', 'medium')  # Default to 'medium' if not provided

    if not fen:
        return jsonify({'error': 'FEN not provided'}), 400

    # Map difficulty to Stockfish parameters
    difficulty_settings = {
        'easy': {'skill_level': 1, 'depth': 10},
        'medium': {'skill_level': 10, 'depth': 12},
        'hard': {'skill_level': 20, 'depth': None}  # Let it use full strength without artificial limits
    }
    settings = difficulty_settings.get(difficulty, difficulty_settings['medium'])

    try:
        # Initialize Stockfish engine
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            board = chess.Board(fen)

            # Set Stockfish skill level and depth
            engine.configure({'Skill Level': settings['skill_level']})
            result = engine.play(board, chess.engine.Limit(depth=settings['depth']))

            return jsonify({'move': result.move.uci()})  # Return the move in UCI format
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
def get_player_stats(player_name):
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
            password_hash=generate_password_hash(data['password']),
            last_login=datetime.utcnow()
        )
        db.session.add(user)
        db.session.commit()
        
        # Create default stats
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
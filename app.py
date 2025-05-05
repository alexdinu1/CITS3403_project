import os
import platform
import chess
import chess.engine
from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(app.instance_path, 'chess.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

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
    player_name = db.Column(db.String(50), unique=True)
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
        result=data['result']
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
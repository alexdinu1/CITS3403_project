import os
import platform
import chess
import chess.engine
from flask import Flask, render_template, request, jsonify, redirect, url_for

app = Flask(__name__)

# Determine the correct Stockfish binary based on the OS
if platform.system() == "Darwin":  # macOS
    STOCKFISH_PATH = "./static/stockfish/stockfish-macos"
elif platform.system() == "Windows":  # Windows
    STOCKFISH_PATH = "./static/stockfish/stockfish.exe"
elif platform.system() == "Linux":  # Linux
    STOCKFISH_PATH = "./static/stockfish/stockfish-linux"
else:
    raise OSError("Unsupported operating system")

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
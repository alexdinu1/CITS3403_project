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
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

            score_obj = info['score'].white()

            if isinstance(score_obj, chess.engine.Cp):
                evaluation = score_obj.score()
            elif isinstance(score_obj, chess.engine.Mate):
                mate_val = score_obj.mate()
                evaluation = 100000 if mate_val > 0 else -100000
            else:
                evaluation = 0

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

            info_before = engine.analyse(board_before, chess.engine.Limit(depth=15))
            info_after = engine.analyse(board_after, chess.engine.Limit(depth=15))

            # 🟢 Correct: get the Score object by calling .white()
            score_before = info_before['score'].white()
            score_after = info_after['score'].white()

            def score_to_cp(score_obj):
                if isinstance(score_obj, chess.engine.Cp):
                    return score_obj.score()
                elif isinstance(score_obj, chess.engine.Mate):
                    mate_val = score_obj.mate()
                    return 100000 if mate_val > 0 else -100000
                else:
                    return 0

            eval_before = score_to_cp(score_before)
            eval_after = score_to_cp(score_after)

            cpl = abs(eval_before - eval_after)

            if score_after.is_mate():
                mate_val = score_after.mate()
                if mate_val > 0:
                    feedback = f"You're delivering mate in {mate_val}"
                    score_value = 10
                else:
                    feedback = f"Opponent has mate in {abs(mate_val)}"
                    score_value = 0
            elif score_before.is_mate():
                mate_val = score_before.mate()
                if mate_val > 0:
                    feedback = f"You were delivering mate in {mate_val}, don't miss it!"
                    score_value = 5
                else:
                    feedback = f"Opponent was mating in {abs(mate_val)}, stay alert!"
                    score_value = 1
            else:
                if cpl == 0:
                    score_value = 10
                    feedback = "Perfect move"
                elif cpl <= 20:
                    score_value = 9
                    feedback = "Excellent move"
                elif cpl <= 50:
                    score_value = 7
                    feedback = "Good move"
                elif cpl <= 100:
                    score_value = 5
                    feedback = "Average move"
                elif cpl <= 200:
                    score_value = 3
                    feedback = "Inaccuracy"
                elif cpl <= 500:
                    score_value = 1
                    feedback = "Mistake"
                else:
                    score_value = 0
                    feedback = "Blunder"

            return jsonify({
                'cpl': cpl,
                'score': score_value,
                'feedback': feedback
            })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
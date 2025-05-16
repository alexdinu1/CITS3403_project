import os
import platform
from pathlib import Path
from flask import Flask, render_template, redirect, url_for
from flask_cors import CORS
from flask_migrate import Migrate
from models import db
import logging
from flask_wtf import CSRFProtect

# Import blueprints from routes
from routes.auth import auth_bp
from routes.chess import chess_bp
from routes.stats import stats_bp
from routes.friends import friends_bp
from routes.move import move_bp

app = Flask(__name__, static_folder='static')

CORS(app)

basedir = Path(__file__).parent
instance_path = Path(app.instance_path)
instance_path.mkdir(exist_ok=True)
db_path = instance_path / 'app.db'

app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default-secret-key')

db.init_app(app)
migrate = Migrate(app, db)
csrf = CSRFProtect(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Stockfish path config (if needed by chess.py)
if platform.system() == "Darwin":
    app.config['STOCKFISH_PATH'] = "./static/stockfish/stockfish-macos"
elif platform.system() == "Windows":
    app.config['STOCKFISH_PATH'] = "./static/stockfish/stockfish.exe"
elif platform.system() == "Linux":
    app.config['STOCKFISH_PATH'] = "./static/stockfish/stockfish-linux"
else:
    raise OSError("Unsupported operating system")

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(chess_bp)
app.register_blueprint(stats_bp)
app.register_blueprint(friends_bp)
app.register_blueprint(move_bp)

# CLI command to initialize the database
@app.cli.command('init-db')
def init_db():
    with app.app_context():
        db.create_all()
    print('Initialized the database.')

# Template routes
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

if __name__ == '__main__':
    app.run(debug=True)
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, Index

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now)
    last_login = db.Column(db.DateTime, default=datetime.now)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    stats = db.relationship('PlayerStats', backref='user', uselist=False)
    games = db.relationship('Game', backref='player', lazy=True)

class Game(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    pgn = db.Column(db.Text, nullable=False)
    white_player = db.Column(db.String(50))
    black_player = db.Column(db.String(50))
    result = db.Column(db.String(10))
    date_played = db.Column(db.DateTime, default=datetime.utcnow)
    analyzed = db.Column(db.Boolean, default=False)
    
    # Relationships
    moves = db.relationship('Move', backref='game', lazy=True, order_by='Move.move_number')
    analysis = db.relationship('GameAnalysis', backref='game', lazy=True)

class Move(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'), nullable=False)
    move_number = db.Column(db.Integer, nullable=False)
    game_state = db.Column(db.String(100))  # Board state after move

class PlayerStats(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    wins = db.Column(db.Integer, default=0)
    losses = db.Column(db.Integer, default=0)
    draws = db.Column(db.Integer, default=0)
    rating = db.Column(db.Integer, default=1000)
    highest_rating = db.Column(db.Integer, default=1000)
    last_game_id = db.Column(db.Integer, db.ForeignKey('game.id'), nullable=True)
    
    # Relationships
    last_game = db.relationship('Game')

class Friendship(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    friend_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        db.UniqueConstraint('user_id', 'friend_id', name='unique_friendship'),
    )

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='friendships_initiated')
    friend = db.relationship('User', foreign_keys=[friend_id], backref='friendships_received')

class GameAnalysis(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'), nullable=False)
    move_number = db.Column(db.Integer, nullable=False)
    score = db.Column(db.Float)
    is_blunder = db.Column(db.Boolean, default=False)
    is_brilliant = db.Column(db.Boolean, default=False)
    comment = db.Column(db.Text)
    
    __table_args__ = (
        Index('idx_analysis_blunders', 'game_id', 'is_blunder'),
    )
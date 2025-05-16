from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from models import db, User, PlayerStats
from flask_wtf.csrf import CSRFProtect

auth_bp = Blueprint('auth', __name__)
csrf = CSRFProtect()

@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data received"}), 400

        user = User.query.filter(
            (User.username == data.get('username')) | 
            (User.email == data.get('username'))
        ).first()

        if not user:
            return jsonify({"error": "User not found"}), 404

        if not check_password_hash(user.password_hash, data.get('password', '')):
            return jsonify({"error": "Invalid username or password"}), 401

        user.last_login = datetime.utcnow()
        db.session.commit()

        # Create stats if missing
        if not user.stats:
            stats = PlayerStats(user_id=user.id)
            db.session.add(stats)
            db.session.commit()

        # Optionally set session
        session['user_id'] = user.id

        return jsonify({
            "status": "success",
            "user_id": user.id,
            "username": user.username
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data received"}), 400

        required = ['username', 'email', 'password']
        if not all(field in data for field in required):
            return jsonify({"error": "Missing required fields"}), 400

        if User.query.filter_by(username=data['username']).first():
            return jsonify({"error": "Username already exists"}), 400
        if User.query.filter_by(email=data['email']).first():
            return jsonify({"error": "Email already exists"}), 400

        user = User(
            username=data['username'],
            email=data['email'],
            password_hash=generate_password_hash(data['password'], method='pbkdf2:sha256'),
            last_login=datetime.utcnow(),
            is_active=True
        )
        db.session.add(user)
        db.session.commit()

        stats = PlayerStats(
            user_id=user.id,
            wins=0,
            losses=0,
            draws=0,
            rating=1000,
            highest_rating=1000,
            last_game_id=None,
        )
        db.session.add(stats)
        db.session.commit()

        # Optionally set session
        session['user_id'] = user.id

        return jsonify({
            "status": "success",
            "user_id": user.id,
            "username": user.username
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/current_user')
def get_current_user():
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

@auth_bp.route('/api/current_user/<int:user_id>')
def get_user_by_id(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "user_id": user.id,
        "username": user.username
    })

csrf.exempt(auth_bp)  # Exempt the whole blueprint if you want
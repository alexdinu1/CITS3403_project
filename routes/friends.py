from flask import Blueprint, abort, redirect, request, jsonify, render_template, session, url_for
from models import db, User, Friendship, PlayerStats
from datetime import datetime
from sqlalchemy import func

friends_bp = Blueprint('friends', __name__)

@friends_bp.route('/api/friends/<int:user_id>')
def get_friends(user_id):
    friends = Friendship.query.filter(
        ((Friendship.user_id == user_id) | (Friendship.friend_id == user_id)) &
        (Friendship.status == 'accepted')
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

@friends_bp.route('/api/friend_requests/<int:user_id>')
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

@friends_bp.route('/api/friend_action', methods=['POST'])
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

@friends_bp.route('/api/search_players')
def search_players():
    q = request.args.get('q', '').strip()
    exclude = request.args.get('exclude', type=int)
    if not q:
        return jsonify([])

    query = User.query.filter(User.username.ilike(f'%{q}%'))
    if exclude:
        query = query.filter(User.id != exclude)
    users = query.limit(10).all()
    return jsonify([{
        'id': u.id,
        'username': u.username,
        'rating': u.stats.rating if u.stats else 1000,
        'wins': u.stats.wins if u.stats else 0,
        'losses': u.stats.losses if u.stats else 0,
        'draws': u.stats.draws if u.stats else 0,
        'last_active': u.last_login.isoformat() if u.last_login else None
    } for u in users])

@friends_bp.route('/api/suggestions/<int:user_id>')
def get_suggestions(user_id):
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

@friends_bp.route('/api/get_friendship')
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

@friends_bp.route('/friend_stats/<int:friend_id>')
def friend_stats(friend_id):
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('index'))

    is_friend = Friendship.query.filter(
        ((Friendship.user_id == user_id) & (Friendship.friend_id == friend_id)) |
        ((Friendship.user_id == friend_id) & (Friendship.friend_id == user_id)),
        Friendship.status == 'accepted'
    ).first()

    if not is_friend:
        return abort(403) 

    return render_template('friend_stats.html', friend_id=friend_id)
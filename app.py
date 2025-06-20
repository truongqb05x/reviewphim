from flask import Flask, jsonify, send_from_directory, request, make_response
import mysql.connector
from mysql.connector import Error
import os
import uuid
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

app = Flask(__name__, static_folder='static', static_url_path='/static')
HTML_FOLDER = os.path.join(os.path.dirname(__file__), 'html')

# MySQL configuration
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'test'
}

@contextmanager
def get_db_connection():
    """Context manager for database connections."""
    connection = None
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        yield connection
    except Error as e:
        print(f"Database connection error: {e}")
        yield None
    finally:
        if connection and connection.is_connected():
            connection.close()

def execute_query(query: str, params: tuple = (), dictionary: bool = True) -> Optional[List[Dict]]:
    """Execute database query with error handling."""
    with get_db_connection() as conn:
        if not conn:
            return None
        try:
            cursor = conn.cursor(dictionary=dictionary)
            cursor.execute(query, params)
            result = cursor.fetchall()
            cursor.close()
            return result
        except Error as e:
            print(f"Query execution error: {e}")
            return None

def save_session(session_id: str):
    """Save session ID to the database."""
    with get_db_connection() as conn:
        if not conn:
            return False
        try:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO sessions (session_id, created_at) VALUES (%s, NOW())",
                (session_id,)
            )
            conn.commit()
            cursor.close()
            return True
        except Error as e:
            print(f"Error saving session: {e}")
            return False

def track_video_view(session_id: str, video_id: int, watch_duration: int, is_completed: bool):
    """Save video view data to the database."""
    with get_db_connection() as conn:
        if not conn:
            return False
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO video_views (session_id, video_id, watch_duration, is_completed)
                VALUES (%s, %s, %s, %s)
                """,
                (session_id, video_id, watch_duration, int(is_completed))
            )
            conn.commit()
            cursor.close()
            return True
        except Error as e:
            print(f"Error saving video view: {e}")
            return False

@app.route('/track-view', methods=['POST'])
def track_view():
    """Track video view progress."""
    data = request.get_json()
    session_id = request.cookies.get('session_id')
    video_id = data.get('video_id')
    watch_duration = data.get('watch_duration', 0)
    is_completed = data.get('is_completed', False)

    if not session_id or not video_id:
        return jsonify({'error': 'Missing session_id or video_id'}), 400

    if track_video_view(session_id, video_id, watch_duration, is_completed):
        return jsonify({'message': 'View tracked successfully'}), 200
    return jsonify({'error': 'Failed to track view'}), 500
@app.route('/videos', methods=['GET'])
def get_videos():
    try:
        tag = request.args.get('tag');
        exclude_id = request.args.get('exclude_id');
        session_id = request.cookies.get('session_id');

        # Base query
        query = """
        SELECT 
            v.video_id, 
            v.title, 
            v.description, 
            v.video_url,
            GROUP_CONCAT(DISTINCT t.name) AS tags,
            COUNT(DISTINCT vv.video_id) AS view_count
        FROM videos v
        LEFT JOIN video_tags vt ON v.video_id = vt.video_id
        LEFT JOIN tags t ON vt.tag_id = t.id
        LEFT JOIN video_views vv ON v.video_id = vv.video_id
        """

        params = []

        # User views subquery
        if session_id:
            query += """
            LEFT JOIN (
                SELECT video_id, MAX(watch_duration) AS max_duration
                FROM video_views
                WHERE session_id = %s
                GROUP BY video_id
            ) user_views ON v.video_id = user_views.video_id
            """
            params.append(session_id)
        else:
            query += """
            LEFT JOIN (
                SELECT video_id, MAX(watch_duration) AS max_duration
                FROM video_views
                GROUP BY video_id
            ) user_views ON v.video_id = user_views.video_id
            """

        # WHERE clauses
        where_clauses = []
        if tag:
            where_clauses.append("t.name = %s")
            params.append(tag)
        if exclude_id:
            try:
                exclude_id = int(exclude_id)
                where_clauses.append("v.video_id != %s")
                params.append(exclude_id)
            except ValueError:
                print(f"Invalid exclude_id: {exclude_id}")
                return jsonify({'error': 'Invalid exclude_id'}), 400

        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        # Group by and order
        query += """
            GROUP BY v.video_id, v.title, v.description, v.video_url
            ORDER BY RAND()
            LIMIT 10
        """  # Tăng LIMIT lên 10 để tăng cơ hội

        # Execute
        videos = execute_query(query, tuple(params))
        print(f"Query executed: {query}, params: {params}, result: {videos}")
        if videos is None or not videos:
            print(f"No valid videos found for query: {query}, params: {params}")
            return jsonify({'error': 'No valid videos available'}), 404

        # Process tags
        for video in videos:
            video['tags'] = video['tags'].split(',') if video['tags'] else []
            video['video_id'] = str(video['video_id'])
            del video['view_count']

        print(f"Returning videos: {videos}")

        # Create session if none exists
        if not session_id:
            session_id = str(uuid.uuid4())
            save_session(session_id)

        # Response
        response = make_response(jsonify({'videos': videos}), 200)
        if not request.cookies.get('session_id'):
            response.set_cookie(
                'session_id', session_id,
                max_age=31536000 * 10,
                httponly=True,
                secure=True,
                samesite='Lax'
            )
        return response
    except Exception as e:
        print(f"Error executing query: {e}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/check-session')
def check_session():
    """Check session ID."""
    session_id = request.cookies.get('session_id')
    if session_id:
        return jsonify({'message': f'Session ID: {session_id}'}), 200
    return jsonify({'message': 'No session found'}), 404

@app.route('/')
def serve_index():
    """Serve the main index page."""
    return send_from_directory(HTML_FOLDER, 'index.html')

@app.route('/trending')
def khampha():
    """Serve the trending page."""
    return send_from_directory(HTML_FOLDER, 'khampha.html')

@app.route('/api/tags', methods=['GET'])
def get_tags():
    """Fetch all tags with their image URLs."""
    tags = execute_query("SELECT name, image_url FROM tags")
    if tags is None:
        return jsonify({'error': 'Failed to fetch tags'}), 500
    
    return jsonify([
        {'name': tag['name'], 'image_url': tag['image_url'] or ''} 
        for tag in tags
    ]), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
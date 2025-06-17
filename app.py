from flask import Flask, jsonify, send_from_directory, request
import mysql.connector
from mysql.connector import Error
import os
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

@app.route('/videos', methods=['GET'])
def get_videos():
    """Fetch videos with optional tag filtering."""
    tag = request.args.get('tag')
    query = """
        SELECT v.video_id, v.title, v.description, v.video_url,
               GROUP_CONCAT(t.name) as tags
        FROM videos v
        LEFT JOIN video_tags vt ON v.video_id = vt.video_id
        LEFT JOIN tags t ON vt.tag_id = t.id
    """
    
    params = (tag,) if tag else ()
    if tag:
        query += " WHERE t.name = %s"
    query += " GROUP BY v.video_id, v.title, v.description, v.video_url"

    videos = execute_query(query, params)
    if videos is None:
        return jsonify({'error': 'Failed to fetch videos'}), 500

    # Process tags
    for video in videos:
        video['tags'] = video['tags'].split(',') if video['tags'] else []

    return jsonify({'videos': videos}), 200

@app.route('/')
def serve_index():
    """Serve the main index page."""
    return send_from_directory(HTML_FOLDER, 'index.html')

@app.route('/trending')
def khampha():
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
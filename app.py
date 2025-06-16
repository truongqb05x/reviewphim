from flask import Flask, jsonify, send_from_directory
import mysql.connector
from mysql.connector import Error
import os

app = Flask(__name__, static_folder='static', static_url_path='/static')  # ✅ Sửa chỗ này

# Thư mục chứa file HTML
HTML_FOLDER = os.path.join(os.path.dirname(__file__), 'html')

# Cấu hình kết nối MySQL
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'test'
}

def get_db_connection():
    try:
        connection = mysql.connector.connect(**db_config)
        if connection.is_connected():
            return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

@app.route('/videos', methods=['GET'])
def get_videos():
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = connection.cursor(dictionary=True)
        
        query = """
        SELECT 
            v.video_id,
            v.title,
            v.description,
            v.video_url,
            GROUP_CONCAT(t.name) as tags
        FROM videos v
        LEFT JOIN video_tags vt ON v.video_id = vt.video_id
        LEFT JOIN tags t ON vt.tag_id = t.tag_id
        GROUP BY v.video_id, v.title, v.description, v.video_url
        """
        
        cursor.execute(query)
        videos = cursor.fetchall()
        
        for video in videos:
            video['tags'] = video['tags'].split(',') if video['tags'] else []
        
        return jsonify({'videos': videos}), 200
    
    except Error as e:
        print(f"Error executing query: {e}")
        return jsonify({'error': 'Failed to fetch videos'}), 500
    
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

@app.route('/')
def serve_index():
    return send_from_directory(HTML_FOLDER, 'index.html')

@app.route('/<path:filename>')
def serve_html(filename):
    if filename.endswith('.html'):
        try:
            return send_from_directory(HTML_FOLDER, filename)
        except FileNotFoundError:
            return jsonify({'error': 'Page not found'}), 404
    return jsonify({'error': 'Invalid file type'}), 400

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

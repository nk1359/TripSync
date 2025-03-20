from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import mysql.connector
import os

app = Flask(__name__, static_folder='build', static_url_path='')
CORS(app)

db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': 'admin',
    'database': 'tripsync'
}

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/hello', methods=['GET'])
def hello():
    return jsonify({"message": "Hello from Flask!"})

@app.route('/api/register', methods=['POST'])
def register_user():
    data = request.get_json()
    required_fields = ["first_name", "last_name", "username", "email", "password"]
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        insert_query = """
            INSERT INTO users 
            (first_name, last_name, username, email, password) 
            VALUES (%s, %s, %s, %s, %s)
        """
        values = (
            data["first_name"],
            data["last_name"],
            data["username"],
            data["email"],
            data["password"]
        )
        cursor.execute(insert_query, values)
        conn.commit()
        return jsonify({"message": "User registered successfully"}), 201

    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 400

    finally:
        if conn:
            conn.close()

@app.route('/<path:path>')
def serve_react_app(path):
    if not os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, 'index.html')
    return send_from_directory(app.static_folder, path)

@app.route('/api/login', methods=['POST'])
def login_user():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Missing credentials'}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        query = "SELECT * FROM users WHERE username = %s AND password = %s"
        cursor.execute(query, (username, password))
        user = cursor.fetchone()
        
        if user:
            return jsonify({'success': True, 'user': user}), 200
        else:
            return jsonify({'success': False, 'error': 'Invalid credentials'}), 401
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    app.run(debug=True)

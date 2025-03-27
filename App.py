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

@app.route('/api/users', methods=['GET'])
def get_users():
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                user_id AS id,
                CONCAT(first_name, ' ', last_name) AS name
            FROM users
        """
        cursor.execute(query)
        users = cursor.fetchall()
        return jsonify({"users": users}), 200
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 400
    finally:
        if conn:
            conn.close()

@app.route('/api/create_group', methods=['POST'])
def create_group():
    data = request.get_json()
    group_name = data.get('group_name')
    created_by = data.get('created_by')

    if not group_name or not created_by:
        return jsonify({'error': 'Missing required fields'}), 400

    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    query = "INSERT INTO chat_groups (name, created_by) VALUES (%s, %s)"
    cursor.execute(query, (group_name, created_by))
    conn.commit()

    group_id = cursor.lastrowid
    cursor.execute("INSERT INTO group_members (group_id, username) VALUES (%s, %s)", (group_id, created_by))
    conn.commit()

    cursor.close()
    conn.close()

    return jsonify({'message': 'Group created', 'group_id': group_id}), 201

@app.route('/api/add_user_to_group', methods=['POST'])
def add_user_to_group():
    data = request.get_json()
    group_id = data.get('group_id')
    username = data.get('username')

    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    query = "INSERT INTO group_members (group_id, username) VALUES (%s, %s)"
    cursor.execute(query, (group_id, username))
    conn.commit()

    cursor.close()
    conn.close()

    return jsonify({'message': 'User added to group'}), 201

@app.route('/api/send_message', methods=['POST'])
def send_message():
    data = request.get_json()
    group_id = data.get('group_id')
    sender = data.get('sender')
    message = data.get('message')

    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    query = "INSERT INTO messages (group_id, sender, message) VALUES (%s, %s, %s)"
    cursor.execute(query, (group_id, sender, message))
    conn.commit()

    cursor.close()
    conn.close()

    return jsonify({'message': 'Message sent'}), 201

@app.route('/api/group_messages/<group_id>', methods=['GET'])
def get_group_messages(group_id):
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor(dictionary=True)

    query = "SELECT sender, message, created_at FROM messages WHERE group_id = %s ORDER BY created_at ASC"
    cursor.execute(query, (group_id,))
    messages = cursor.fetchall()

    cursor.close()
    conn.close()

    return jsonify(messages)

@app.route('/api/get_groups', methods=['GET'])
def get_groups():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, name FROM chat_groups")  # Adjust table name
        groups = cursor.fetchall()
        return jsonify({"groups": groups}), 200
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/group_info/<group_id>', methods=['GET'])
def get_group_info(group_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT name FROM chat_groups WHERE id = %s", (group_id,))
        group = cursor.fetchone()

        if not group:
            return jsonify({"error": "Group not found"}), 404

        return jsonify(group), 200
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/delete_group/<int:group_id>', methods=['DELETE'])
def delete_group(group_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Delete messages first to prevent foreign key issues
        cursor.execute("DELETE FROM messages WHERE group_id = %s", (group_id,))
        cursor.execute("DELETE FROM group_members WHERE group_id = %s", (group_id,))
        cursor.execute("DELETE FROM chat_groups WHERE id = %s", (group_id,))

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'message': 'Group deleted successfully'}), 200
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500


if __name__ == '__main__':
    app.run(debug=True)
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
    
@app.route('/api/top-places', methods=['GET'])
def get_top_places():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Modified query to group places by category instead of city
        query = """
        SELECT 
            p.category,
            p.id AS place_id,
            p.name AS place_name,
            c.city_name,
            pi.image_url
        FROM places p
        JOIN cities c ON p.city_id = c.id
        LEFT JOIN (
            SELECT place_id, MIN(image_url) AS image_url
            FROM places_images
            GROUP BY place_id
        ) pi ON pi.place_id = p.id
        WHERE p.id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (PARTITION BY category ORDER BY id) AS rn
                FROM places
            ) AS ranked
            WHERE rn <= 5
        )
        ORDER BY p.category, c.city_name, p.id;
        """

        cursor.execute(query)
        results = cursor.fetchall()

        # Structure the data: group places under each category
        grouped = {}
        for row in results:
            category = row['category']
            place = {
                'place_id': row['place_id'],
                'place_name': row['place_name'],
                'city_name': row['city_name'],
                'image_url': row['image_url']
            }
            grouped.setdefault(category, []).append(place)

        return jsonify(grouped), 200

    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500

    finally:
        if conn:
            conn.close()


# Endpoint to get top 5 cities with their top 5 places
@app.route('/api/top-cities', methods=['GET'])
def get_top_cities():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # First get top 5 cities (you could adjust criteria for what makes a city "top")
        cities_query = """
        SELECT c.id, c.city_name
        FROM cities c 
        ORDER BY c.id
        LIMIT 5
        """
        cursor.execute(cities_query)
        cities = cursor.fetchall()
        
        result = {}
        
        # For each city, get its top 5 places
        for city in cities:
            city_id = city['id']
            city_name = city['city_name']
            
            places_query = """
            SELECT 
                p.id AS place_id,
                p.name AS place_name,
                p.category,
                pi.image_url,
                '4.5' AS rating
            FROM places p
            LEFT JOIN (
                SELECT place_id, MIN(image_url) AS image_url
                FROM places_images
                GROUP BY place_id
            ) pi ON pi.place_id = p.id
            WHERE p.city_id = %s
            LIMIT 5
            """
            
            cursor.execute(places_query, (city_id,))
            places = cursor.fetchall()
            
            result[city_name] = places
            
        return jsonify(result), 200

    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

# Endpoint to get all categories
@app.route('/api/categories', methods=['GET'])
def get_categories():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT DISTINCT category 
        FROM places 
        WHERE category IS NOT NULL AND category != ''
        ORDER BY category
        """
        
        cursor.execute(query)
        categories = cursor.fetchall()
        
        # Extract just the category names as a list
        category_list = [item['category'] for item in categories]
        
        return jsonify(category_list), 200
        
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

# Endpoint to get places by category with pagination and search
@app.route('/api/places', methods=['GET'])
def get_places():
    try:
        category = request.args.get('category', '')
        search_term = request.args.get('search', '')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        
        offset = (page - 1) * per_page
        
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        params = []
        where_clauses = []
        
        # Add category filter if specified
        if category and category != 'All':
            where_clauses.append("p.category = %s")
            params.append(category)
        
        # Add search filter if specified
        if search_term:
            where_clauses.append("(p.name LIKE %s OR c.city_name LIKE %s)")
            search_pattern = f"%{search_term}%"
            params.extend([search_pattern, search_pattern])
        
        # Construct WHERE clause
        where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"
        
        # Query for places with pagination
        query = f"""
        SELECT 
            p.id AS place_id,
            p.name AS place_name,
            p.category,
            c.city_name,
            pi.image_url,
            '4.5' AS rating
        FROM places p
        JOIN cities c ON p.city_id = c.id
        LEFT JOIN (
            SELECT place_id, MIN(image_url) AS image_url
            FROM places_images
            GROUP BY place_id
        ) pi ON pi.place_id = p.id
        WHERE {where_clause}
        ORDER BY p.name
        LIMIT %s OFFSET %s
        """
        
        params.extend([per_page, offset])
        cursor.execute(query, params)
        places = cursor.fetchall()
        
        # Get total count for pagination
        count_query = f"""
        SELECT COUNT(*) as total
        FROM places p
        JOIN cities c ON p.city_id = c.id
        WHERE {where_clause}
        """
        
        cursor.execute(count_query, params[:-2] if params else [])
        total = cursor.fetchone()['total']
        
        return jsonify({
            'places': places,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page
        }), 200
        
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    app.run(debug=True)
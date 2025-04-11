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

# API Endpoints (these all stay the same)

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
    search_term = request.args.get('search', '')
    current_user_id = request.args.get('current_user_id')
    
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        if search_term:
            query = """
            SELECT 
                u.user_id AS id,
                CONCAT(u.first_name, ' ', u.last_name) AS name,
                u.username,
                CASE
                    WHEN f.status = 'pending' AND f.user_id = %s THEN 'request_sent'
                    WHEN f.status = 'pending' AND f.friend_id = %s THEN 'request_received'
                    WHEN f.status = 'accepted' THEN 'friends'
                    ELSE 'none'
                END AS friendship_status
            FROM users u
            LEFT JOIN friends f ON 
                (f.user_id = u.user_id AND f.friend_id = %s) OR 
                (f.friend_id = u.user_id AND f.user_id = %s)
            WHERE (u.first_name LIKE %s OR u.last_name LIKE %s OR u.username LIKE %s)
            AND u.user_id != %s
            """
            search_pattern = f"%{search_term}%"
            cursor.execute(query, (current_user_id, current_user_id, current_user_id, current_user_id, 
                                  search_pattern, search_pattern, search_pattern, current_user_id))
        else:
            query = """
            SELECT 
                user_id AS id,
                CONCAT(first_name, ' ', last_name) AS name,
                username
            FROM users
            WHERE user_id != %s
            """
            cursor.execute(query, (current_user_id,))
        
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
    created_by = data.get('created_by')  # user_id of the creator
    members = data.get('members', [])  # List of friend user_ids to add

    if not group_name or not created_by:
        return jsonify({'error': 'Missing required fields'}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # First get the username of the creator
        cursor.execute("SELECT username FROM users WHERE user_id = %s", (created_by,))
        creator = cursor.fetchone()
        if not creator:
            return jsonify({'error': 'Creator not found'}), 404
        creator_username = creator['username']

        # Create the chat group
        create_query = "INSERT INTO chat_groups (name, created_by) VALUES (%s, %s)"
        cursor.execute(create_query, (group_name, created_by))
        conn.commit()

        group_id = cursor.lastrowid

        # Add the group creator to the group
        cursor.execute("INSERT INTO group_members (group_id, username) VALUES (%s, %s)", (group_id, creator_username))
        conn.commit()

        valid_members = []
        # For each friend_id, get their username and check if they're a friend
        for friend_id in members:
            # Get the friend's username
            cursor.execute("SELECT username FROM users WHERE user_id = %s", (friend_id,))
            friend = cursor.fetchone()
            if not friend:
                print(f"User ID {friend_id} not found")
                continue
            
            friend_username = friend['username']
            
            # Check if they're actually a friend
            check_query = """
            SELECT 1 FROM friends
            WHERE ((user_id = %s AND friend_id = %s) OR (user_id = %s AND friend_id = %s))
              AND status = 'accepted'
            """
            cursor.execute(check_query, (created_by, friend_id, friend_id, created_by))
            if cursor.fetchone():
                # Add friend to group and track them as valid
                cursor.execute("INSERT INTO group_members (group_id, username) VALUES (%s, %s)", 
                               (group_id, friend_username))
                conn.commit()
                valid_members.append(friend_id)
            else:
                print(f"User {friend_id} is not a friend of user {created_by}")

        return jsonify({'message': 'Group created', 'group_id': group_id, 'members_added': valid_members}), 201

    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/add_friend_to_group', methods=['POST'])
def add_friend_to_group():
    data = request.get_json()
    group_id = data.get('group_id')
    friend_id = data.get('friend_id')
    user_id = data.get('user_id')

    if not group_id or not friend_id or not user_id:
        return jsonify({'error': 'Missing required fields'}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Get the friend's username
        cursor.execute("SELECT username FROM users WHERE user_id = %s", (friend_id,))
        friend = cursor.fetchone()
        if not friend:
            return jsonify({'error': 'Friend not found'}), 404
        friend_username = friend['username']

        # Add the friend to the group
        cursor.execute("INSERT INTO group_members (group_id, username) VALUES (%s, %s)", 
                       (group_id, friend_username))
        conn.commit()

        return jsonify({'message': 'Friend added to group successfully'}), 201

    except mysql.connector.Error as err:
        conn.rollback()
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/send_message', methods=['POST'])
def send_message():
    data = request.get_json()
    group_id = data.get('group_id')
    sender = data.get('sender')  # This is the username
    message = data.get('message')

    if not group_id or not sender or not message:
        return jsonify({'error': 'Missing required fields'}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # First check if the sender is a member of the group
        cursor.execute("SELECT 1 FROM group_members WHERE group_id = %s AND username = %s", 
                       (group_id, sender))
        if not cursor.fetchone():
            return jsonify({'error': 'You are not a member of this group'}), 403

        # Insert the message
        query = "INSERT INTO messages (group_id, sender, message) VALUES (%s, %s, %s)"
        cursor.execute(query, (group_id, sender, message))
        conn.commit()

        return jsonify({'message': 'Message sent'}), 201
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/group_messages/<group_id>', methods=['GET'])
def get_group_messages(group_id):
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'User ID not provided'}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Get username of current user
        cursor.execute("SELECT username FROM users WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        username = user['username']

        # Verify that the user is a member of the group
        cursor.execute("SELECT 1 FROM group_members WHERE group_id = %s AND username = %s", 
                       (group_id, username))
        membership = cursor.fetchone()

        if not membership:
            return jsonify({'error': 'User is not a member of this group'}), 403

        # If the user is a member, retrieve the group messages
        query = "SELECT sender, message, created_at AS timestamp FROM messages WHERE group_id = %s ORDER BY created_at ASC"
        cursor.execute(query, (group_id,))
        messages = cursor.fetchall()

        return jsonify(messages)
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/get_groups', methods=['GET'])
def get_groups():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get username of the user
        cursor.execute("SELECT username FROM users WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
        username = user['username']
        
        # Get groups where the user is a member
        query = """
        SELECT g.id, g.name 
        FROM chat_groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.username = %s
        """
        cursor.execute(query, (username,))
        groups = cursor.fetchall()
        return jsonify({"groups": groups}), 200
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/group_members/<int:group_id>', methods=['GET'])
def get_group_members(group_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT u.user_id, u.username, u.first_name, u.last_name
        FROM group_members gm
        JOIN users u ON gm.username = u.username
        WHERE gm.group_id = %s
        ORDER BY u.first_name, u.last_name
        """
        cursor.execute(query, (group_id,))
        members = cursor.fetchall()
        
        return jsonify({"members": members}), 200
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

# Friend request endpoints
@app.route('/api/send_friend_request', methods=['POST'])
def send_friend_request():
    data = request.get_json()
    user_id = data.get('user_id')
    friend_id = data.get('friend_id')
    
    if not user_id or not friend_id:
        return jsonify({'error': 'Missing required fields'}), 400
    
    if user_id == friend_id:
        return jsonify({'error': 'Cannot send friend request to yourself'}), 400
        
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if a friend request already exists in either direction
        check_query = """
        SELECT id, status, user_id, friend_id FROM friends 
        WHERE (user_id = %s AND friend_id = %s) OR (user_id = %s AND friend_id = %s)
        """
        cursor.execute(check_query, (user_id, friend_id, friend_id, user_id))
        existing = cursor.fetchone()
        
        if existing:
            if existing['status'] == 'accepted':
                return jsonify({'message': 'Already friends'}), 200
            elif existing['status'] == 'pending':
                if existing['user_id'] == int(user_id):
                    return jsonify({'message': 'Friend request already sent'}), 200
                else:
                    # Accept the request if it was sent to us
                    accept_query = "UPDATE friends SET status = 'accepted' WHERE id = %s"
                    cursor.execute(accept_query, (existing['id'],))
                    conn.commit()
                    return jsonify({'message': 'Friend request accepted'}), 200
            else:
                return jsonify({'error': 'Unknown friendship status'}), 400
        
        # Insert new friend request
        insert_query = "INSERT INTO friends (user_id, friend_id, status) VALUES (%s, %s, 'pending')"
        cursor.execute(insert_query, (user_id, friend_id))
        conn.commit()
        
        return jsonify({'message': 'Friend request sent successfully'}), 201
        
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/friend_requests/<int:user_id>', methods=['GET'])
def get_friend_requests(user_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT f.id, f.user_id, f.status, u.first_name, u.last_name, u.username
        FROM friends f
        JOIN users u ON f.user_id = u.user_id
        WHERE f.friend_id = %s AND f.status = 'pending'
        """
        cursor.execute(query, (user_id,))
        requests = cursor.fetchall()
        
        return jsonify({'friend_requests': requests}), 200
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/accept_friend_request', methods=['POST'])
def accept_friend_request():
    data = request.get_json()
    request_id = data.get('request_id')
    
    if not request_id:
        return jsonify({'error': 'Missing request ID'}), 400
        
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        query = "UPDATE friends SET status = 'accepted' WHERE id = %s"
        cursor.execute(query, (request_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Friend request not found'}), 404
            
        return jsonify({'message': 'Friend request accepted'}), 200
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/reject_friend_request', methods=['POST'])
def reject_friend_request():
    data = request.get_json()
    request_id = data.get('request_id')
    
    if not request_id:
        return jsonify({'error': 'Missing request ID'}), 400
        
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        query = "DELETE FROM friends WHERE id = %s AND status = 'pending'"
        cursor.execute(query, (request_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Friend request not found'}), 404
            
        return jsonify({'message': 'Friend request rejected'}), 200
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/friends/<int:user_id>', methods=['GET'])
def get_friends(user_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        # Since friendship is mutual, we need to check both directions
        query = """
        SELECT u.user_id, u.username, u.first_name, u.last_name, u.email
        FROM friends f
        JOIN users u ON u.user_id = f.friend_id
        WHERE f.user_id = %s AND f.status = 'accepted'
        UNION
        SELECT u.user_id, u.username, u.first_name, u.last_name, u.email
        FROM friends f
        JOIN users u ON u.user_id = f.user_id
        WHERE f.friend_id = %s AND f.status = 'accepted'
        """
        cursor.execute(query, (user_id, user_id))
        friends = cursor.fetchall()
        return jsonify({'friends': friends}), 200
    except mysql.connector.Error as err:
        return jsonify({'error': str(err)}), 400
    finally:
        if conn:
            conn.close()

@app.route('/api/top-places', methods=['GET'])
def get_top_places():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Modified query to use image_url from the places table directly
        query = """
        SELECT 
            p.category,
            p.id AS place_id,
            p.name AS place_name,
            c.city_name,
            p.image_url
        FROM places p
        JOIN cities c ON p.city_id = c.id
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

@app.route('/api/top-cities', methods=['GET'])
def get_top_cities():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Fetch top 5 cities (adjust as needed)
        cities_query = """
        SELECT c.id, c.city_name
        FROM cities c 
        ORDER BY c.id
        LIMIT 5
        """
        cursor.execute(cities_query)
        cities = cursor.fetchall()
        
        result = {}
        
        # For each city, get its top 5 places, INCLUDING the city_name
        for city in cities:
            city_id = city['id']
            city_name = city['city_name']
            
            places_query = """
            SELECT 
                p.id AS place_id,
                p.name AS place_name,
                p.category,
                p.image_url,
                c.city_name,         -- JOIN the cities table so we can SELECT c.city_name
                '4.5' AS rating
            FROM places p
            JOIN cities c ON p.city_id = c.id
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
        
        category_list = [item['category'] for item in categories]
        
        return jsonify(category_list), 200
        
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

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
        
        if category and category != 'All':
            where_clauses.append("p.category = %s")
            params.append(category)
        
        if search_term:
            where_clauses.append("(p.name LIKE %s OR c.city_name LIKE %s)")
            search_pattern = f"%{search_term}%"
            params.extend([search_pattern, search_pattern])
        
        where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"
        
        # Modified query to use p.image_url from the places table
        query = f"""
        SELECT 
            p.id AS place_id,
            p.name AS place_name,
            p.category,
            c.city_name,
            p.image_url,
            '4.5' AS rating
        FROM places p
        JOIN cities c ON p.city_id = c.id
        WHERE {where_clause}
        ORDER BY p.name
        LIMIT %s OFFSET %s
        """
        
        params.extend([per_page, offset])
        cursor.execute(query, params)
        places = cursor.fetchall()
        
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

# New endpoint to get place details including address
@app.route('/api/place/<int:place_id>', methods=['GET'])
def get_place_details(place_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            p.id, 
            p.name, 
            p.category,
            p.address,
            c.city_name
        FROM places p
        JOIN cities c ON p.city_id = c.id
        WHERE p.id = %s
        """
        
        cursor.execute(query, (place_id,))
        place = cursor.fetchone()
        
        if not place:
            return jsonify({"error": "Place not found"}), 404
            
        return jsonify(place), 200
        
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()

# Calendar API Endpoints
@app.route('/api/calendar/events', methods=['GET'])
def get_calendar_events():
    user_id = request.args.get('user_id')
    group_id = request.args.get('group_id')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Build the query dynamically based on provided parameters
        query = """
        SELECT 
            ce.event_id,
            ce.title,
            ce.description,
            ce.start_date,
            ce.end_date,
            ce.location,
            ce.place_id,
            ce.group_id,
            ce.created_by,
            cg.name AS group_name,
            u.first_name,
            u.last_name,
            u.username,
            p.name AS place_name,
            p.address AS place_address,
            p.category AS place_category,
            c.city_name
        FROM calendar_events ce
        JOIN chat_groups cg ON ce.group_id = cg.id
        JOIN users u ON ce.created_by = u.user_id
        LEFT JOIN places p ON ce.place_id = p.id
        LEFT JOIN cities c ON p.city_id = c.id
        WHERE ce.group_id IN (
            SELECT group_id 
            FROM group_members 
            WHERE username = (SELECT username FROM users WHERE user_id = %s)
        )
        """
        
        params = [user_id]
        
        # Add optional filters
        if group_id:
            query += " AND ce.group_id = %s"
            params.append(group_id)
        
        if start_date:
            query += " AND ce.start_date >= %s"
            params.append(start_date)
        
        if end_date:
            query += " AND ce.start_date <= %s"
            params.append(end_date)
        
        query += " ORDER BY ce.start_date ASC"
        
        cursor.execute(query, params)
        events = cursor.fetchall()
        
        # Format dates for JSON response
        for event in events:
            event['start_date'] = event['start_date'].isoformat() if event['start_date'] else None
            event['end_date'] = event['end_date'].isoformat() if event['end_date'] else None
        
        return jsonify({"events": events}), 200
    
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/calendar/events', methods=['POST'])
def create_calendar_event():
    data = request.get_json()
    required_fields = ["title", "start_date", "group_id", "created_by"]
    
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get username of current user
        cursor.execute("SELECT username FROM users WHERE user_id = %s", (data['created_by'],))
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
        username = user['username']
        
        # Check if user is a member of the group
        cursor.execute("SELECT 1 FROM group_members WHERE group_id = %s AND username = %s", 
                      (data['group_id'], username))
        is_member = cursor.fetchone()
        if not is_member:
            return jsonify({"error": "You are not a member of this group"}), 403
        
        # Create the event
        insert_query = """
        INSERT INTO calendar_events 
        (title, description, start_date, end_date, location, place_id, group_id, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        values = (
            data['title'],
            data.get('description'),
            data['start_date'],
            data.get('end_date'),
            data.get('location'),
            data.get('place_id'),
            data['group_id'],
            data['created_by']
        )
        
        cursor.execute(insert_query, values)
        event_id = cursor.lastrowid
        conn.commit()
        
        # Add the creator as a participant
        cursor.execute(
            "INSERT INTO event_participants (event_id, user_id) VALUES (%s, %s)",
            (event_id, data['created_by'])
        )
        conn.commit()
        
        # Get the newly created event
        cursor.execute("""
        SELECT 
            ce.event_id,
            ce.title,
            ce.description,
            ce.start_date,
            ce.end_date,
            ce.location,
            ce.place_id,
            ce.group_id,
            cg.name AS group_name
        FROM calendar_events ce
        JOIN chat_groups cg ON ce.group_id = cg.id
        WHERE ce.event_id = %s
        """, (event_id,))
        
        new_event = cursor.fetchone()
        
        # Format dates for JSON response
        if new_event:
            new_event['start_date'] = new_event['start_date'].isoformat() if new_event['start_date'] else None
            new_event['end_date'] = new_event['end_date'].isoformat() if new_event['end_date'] else None
        
        return jsonify({"event": new_event, "message": "Event created successfully"}), 201
    
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/calendar/events/<int:event_id>', methods=['PUT'])
def update_calendar_event(event_id):
    data = request.get_json()
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if the event exists and the user is the creator
        cursor.execute("""
        SELECT created_by, group_id FROM calendar_events 
        WHERE event_id = %s
        """, (event_id,))
        
        event = cursor.fetchone()
        if not event:
            return jsonify({"error": "Event not found"}), 404
        
        # Only the creator can update the event
        if int(event['created_by']) != int(user_id):
            return jsonify({"error": "Only the event creator can update it"}), 403
        
        # Build update query
        update_fields = []
        update_values = []
        
        if 'title' in data:
            update_fields.append("title = %s")
            update_values.append(data['title'])
        
        if 'description' in data:
            update_fields.append("description = %s")
            update_values.append(data['description'])
        
        if 'start_date' in data:
            update_fields.append("start_date = %s")
            update_values.append(data['start_date'])
        
        if 'end_date' in data:
            update_fields.append("end_date = %s")
            update_values.append(data['end_date'])
        
        if 'location' in data:
            update_fields.append("location = %s")
            update_values.append(data['location'])
        
        if 'place_id' in data:
            update_fields.append("place_id = %s")
            update_values.append(data['place_id'])
        
        if not update_fields:
            return jsonify({"message": "No fields to update"}), 200
        
        update_query = "UPDATE calendar_events SET " + ", ".join(update_fields) + " WHERE event_id = %s"
        update_values.append(event_id)
        
        cursor.execute(update_query, update_values)
        conn.commit()
        
        # Get the updated event
        cursor.execute("""
        SELECT 
            ce.event_id,
            ce.title,
            ce.description,
            ce.start_date,
            ce.end_date,
            ce.location,
            ce.place_id,
            ce.group_id,
            cg.name AS group_name
        FROM calendar_events ce
        JOIN chat_groups cg ON ce.group_id = cg.id
        WHERE ce.event_id = %s
        """, (event_id,))
        
        updated_event = cursor.fetchone()
        
        # Format dates for JSON response
        if updated_event:
            updated_event['start_date'] = updated_event['start_date'].isoformat() if updated_event['start_date'] else None
            updated_event['end_date'] = updated_event['end_date'].isoformat() if updated_event['end_date'] else None
        
        return jsonify({"event": updated_event, "message": "Event updated successfully"}), 200
    
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/calendar/events/<int:event_id>', methods=['DELETE'])
def delete_calendar_event(event_id):
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if the event exists and the user is the creator
        cursor.execute("""
        SELECT created_by, group_id FROM calendar_events 
        WHERE event_id = %s
        """, (event_id,))
        
        event = cursor.fetchone()
        if not event:
            return jsonify({"error": "Event not found"}), 404
        
        # Only the creator can delete the event
        if int(event['created_by']) != int(user_id):
            return jsonify({"error": "Only the event creator can delete it"}), 403
        
        # Delete the event (participants will be cascaded)
        cursor.execute("DELETE FROM calendar_events WHERE event_id = %s", (event_id,))
        conn.commit()
        
        return jsonify({"message": "Event deleted successfully"}), 200
    
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/calendar/events/<int:event_id>/participants', methods=['GET'])
def get_event_participants(event_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            ep.user_id,
            ep.status,
            u.username,
            u.first_name,
            u.last_name
        FROM event_participants ep
        JOIN users u ON ep.user_id = u.user_id
        WHERE ep.event_id = %s
        """
        
        cursor.execute(query, (event_id,))
        participants = cursor.fetchall()
        
        return jsonify({"participants": participants}), 200
    
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/calendar/events/<int:event_id>/participants', methods=['POST'])
def update_participant_status(event_id):
    data = request.get_json()
    user_id = data.get('user_id')
    status = data.get('status')
    
    if not user_id or not status:
        return jsonify({"error": "User ID and status are required"}), 400
    
    if status not in ['attending', 'maybe', 'declined']:
        return jsonify({"error": "Invalid status. Must be 'attending', 'maybe', or 'declined'"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if the event exists
        cursor.execute("SELECT group_id FROM calendar_events WHERE event_id = %s", (event_id,))
        event = cursor.fetchone()
        if not event:
            return jsonify({"error": "Event not found"}), 404
        
        # Check if the user is a member of the group
        cursor.execute("""
        SELECT 1 FROM group_members 
        WHERE group_id = %s AND username = (SELECT username FROM users WHERE user_id = %s)
        """, (event['group_id'], user_id))
        is_member = cursor.fetchone()
        if not is_member:
            return jsonify({"error": "You must be a member of the group to participate in its events"}), 403
        
        # Check if the user is already a participant
        cursor.execute("SELECT status FROM event_participants WHERE event_id = %s AND user_id = %s", 
                      (event_id, user_id))
        participant = cursor.fetchone()
        
        if participant:
            # Update existing status
            cursor.execute("""
            UPDATE event_participants SET status = %s 
            WHERE event_id = %s AND user_id = %s
            """, (status, event_id, user_id))
        else:
            # Add new participant
            cursor.execute("""
            INSERT INTO event_participants (event_id, user_id, status) 
            VALUES (%s, %s, %s)
            """, (event_id, user_id, status))
        
        conn.commit()
        
        return jsonify({"message": f"Participant status updated to '{status}'"}), 200
    
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/calendar/groups/<int:user_id>', methods=['GET'])
def get_user_calendar_groups(user_id):
    """Get the groups where the user is a member for calendar selection"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get username of the user
        cursor.execute("SELECT username FROM users WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
        username = user['username']
        
        # Get groups where the user is a member
        query = """
        SELECT g.id, g.name 
        FROM chat_groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.username = %s
        ORDER BY g.name
        """
        cursor.execute(query, (username,))
        groups = cursor.fetchall()
        
        return jsonify({"groups": groups}), 200
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/leave_group', methods=['POST'])
def leave_group():
    data = request.get_json()
    group_id = data.get('group_id')
    user_id = data.get('user_id')
    
    if not group_id or not user_id:
        return jsonify({'error': 'Missing required fields'}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get the username of the user
        cursor.execute("SELECT username, first_name, last_name FROM users WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        username = user['username']
        full_name = f"{user['first_name']} {user['last_name']}"
        
        # Check if the user is a member of the group
        cursor.execute("SELECT 1 FROM group_members WHERE group_id = %s AND username = %s", 
                      (group_id, username))
        is_member = cursor.fetchone()
        if not is_member:
            return jsonify({'error': 'User is not a member of this group'}), 403
        
        # Remove the user from the group
        cursor.execute("DELETE FROM group_members WHERE group_id = %s AND username = %s", 
                      (group_id, username))
        conn.commit()
        
        cursor.execute(
            "INSERT INTO messages (group_id, sender, message) VALUES (%s, %s, %s)",
            (group_id, username, f"{full_name} has left the group")
        )
        conn.commit()
        
        return jsonify({'message': 'Successfully left the group'}), 200
    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({'error': str(err)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/chats')
@app.route('/chats/<path:path>')
@app.route('/calendar')
def react_routes(path=None):
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react_app(path):
    if path.startswith('api/'):
        return {'error': 'API endpoint not found'}, 404
    
    if '.' in path:
        file_path = os.path.join(app.static_folder, path)
        if os.path.isfile(file_path):
            return send_from_directory(app.static_folder, path)
    
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(debug=True)
from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import mysql.connector
import os
from dotenv import load_dotenv
import googlemaps

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, static_folder='build', static_url_path='')
CORS(app)

db_config = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', 'admin'),
    'database': os.getenv('DB_NAME', 'tripsync')
}

# Google Places API Configuration
GOOGLE_PLACES_API_KEY = os.getenv('GOOGLE_PLACES_API_KEY')
gmaps = googlemaps.Client(key=GOOGLE_PLACES_API_KEY) if GOOGLE_PLACES_API_KEY else None

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
        
        # Get groups where the user is a member, along with the last message
        query = """
        SELECT g.id, g.name, 
               (SELECT message FROM messages 
                WHERE group_id = g.id 
                ORDER BY created_at DESC LIMIT 1) as last_message,
               (SELECT created_at FROM messages 
                WHERE group_id = g.id 
                ORDER BY created_at DESC LIMIT 1) as last_message_time
        FROM chat_groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.username = %s
        ORDER BY last_message_time IS NULL, last_message_time DESC
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

# Note: /api/top-places endpoint removed - now using /api/top-cities with Google Places API

@app.route('/api/places/load-more', methods=['GET'])
def load_more_places():
    """Load more places for a specific category and city"""
    if not gmaps:
        return jsonify({
            "error": "Google Places API is not configured",
            "places": [],
            "total": 0
        }), 200
    
    try:
        category = request.args.get('category', 'Attractions')
        city = request.args.get('city', 'New York, NY')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        
        # Map category to Google search terms
        category_mapping = {
            'Restaurants': 'restaurants',
            'Museums': 'museums',
            'Parks & Recreation': 'parks',
            'Attractions': 'attractions',
            'Shopping': 'shopping',
            'Hotels': 'hotels',
            'Nightlife': 'nightlife',
            'Sports & Entertainment': 'sports venues',
            'Wellness': 'spas'
        }
        
        search_term = category_mapping.get(category, 'attractions')
        query = f"{search_term} in {city} USA"
        
        places_result = gmaps.places(query=query)
        
        if places_result['status'] == 'OK':
            places = places_result.get('results', [])
            
            # Apply pagination
            start_idx = (page - 1) * per_page
            end_idx = start_idx + per_page
            paginated_places = places[start_idx:end_idx]
            
            formatted_places = []
            for place in paginated_places:
                place_id = place.get('place_id')
                
                # Get photo URL from original search result
                photo_url = None
                if 'photos' in place and len(place['photos']) > 0:
                    photo_reference = place['photos'][0].get('photo_reference')
                    if photo_reference:
                        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                
                try:
                    details = gmaps.place(place_id=place_id, fields=[
                        'name', 'formatted_address', 'geometry', 
                        'rating', 'type', 'url'
                    ])
                    
                    if details['status'] == 'OK':
                        result_data = details['result']
                        
                        # Get place type and convert to category
                        place_type = result_data.get('type', [])
                        if isinstance(place_type, str):
                            place_type = [place_type]
                        
                        formatted_place = {
                            'place_id': place_id,
                            'place_name': result_data.get('name', ''),
                            'address': result_data.get('formatted_address', ''),
                            'city_name': city.split(',')[0],
                            'category': extract_category_from_types(place_type),
                            'image_url': photo_url,
                            'rating': str(result_data.get('rating', '4.5')),
                            'google_maps_url': result_data.get('url', ''),
                            'lat': result_data['geometry']['location']['lat'] if 'geometry' in result_data else None,
                            'lng': result_data['geometry']['location']['lng'] if 'geometry' in result_data else None
                        }
                        formatted_places.append(formatted_place)
                except Exception as e:
                    print(f"Error fetching place details for {place_id}: {e}")
                    continue
            
            return jsonify({
                'places': formatted_places,
                'total': len(places),
                'page': page,
                'per_page': per_page,
                'total_pages': (len(places) + per_page - 1) // per_page
            }), 200
        else:
            return jsonify({
                "error": f"Google Places API error: {places_result.get('status')}",
                "places": [],
                "total": 0
            }), 200
        
    except Exception as e:
        print("Error loading more places:", e)
        return jsonify({
            "error": str(e),
            "places": [],
            "total": 0
        }), 200

@app.route('/api/top-cities', methods=['GET'])
def get_top_cities():
    """Get popular places from Google Places API for top US cities"""
    if not gmaps:
        return jsonify({
            "error": "Google Places API is not configured",
            "message": "Please add your Google Places API key"
        }), 500
    
    try:
        # Define popular US cities to showcase - limit for faster loading
        cities = ['New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Miami, FL', 'Las Vegas, NV']
        result = {}
        
        for city in cities:
            try:
                # Search for top attractions in each US city
                places_result = gmaps.places(query=f"top attractions in {city} USA")
                
                if places_result['status'] == 'OK':
                    city_places = []
                    city_display_name = city.split(',')[0]
                    
                    # Get details for first 3 places (reduced for faster loading)
                    for place in places_result.get('results', [])[:3]:
                        place_id = place.get('place_id')
                        
                        # Get photo URL from original search result (before place details)
                        photo_url = None
                        if 'photos' in place and len(place['photos']) > 0:
                            photo_reference = place['photos'][0].get('photo_reference')
                            if photo_reference:
                                photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                        
                        try:
                            details = gmaps.place(place_id=place_id, fields=[
                                'name', 'formatted_address', 'geometry', 
                                'rating', 'type', 'url'
                            ])
                            
                            if details['status'] == 'OK':
                                result_data = details['result']
                                
                                # Get place type and convert to category
                                place_type = result_data.get('type', [])
                                if isinstance(place_type, str):
                                    place_type = [place_type]
                                
                                city_places.append({
                                    'place_id': place_id,
                                    'place_name': result_data.get('name', ''),
                                    'address': result_data.get('formatted_address', ''),
                                    'city_name': city_display_name,
                                    'category': extract_category_from_types(place_type),
                                    'image_url': photo_url,
                                    'rating': str(result_data.get('rating', '4.5')),
                                    'google_maps_url': result_data.get('url', '')
                                })
                                print(f"  Added: {result_data.get('name', '')}")
                            else:
                                print(f"  Place details failed: {details['status']}")
                        except Exception as e:
                            print(f"  Error fetching place {place_id}: {e}")
                            import traceback
                            traceback.print_exc()
                            continue
                    
                    # Use city display name as key
                    city_display_name = city.split(',')[0]
                    result[city_display_name] = city_places
                    print(f"Found {len(city_places)} places for {city_display_name}")
                else:
                    print(f"Error fetching places for {city}: {places_result.get('status')}")
                    city_display_name = city.split(',')[0]
                    result[city_display_name] = []
                    
            except Exception as e:
                print(f"Error processing city {city}: {e}")
                city_display_name = city.split(',')[0]
                result[city_display_name] = []
            
        return jsonify(result), 200

    except Exception as e:
        print("Error fetching top cities from Google Places:", e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/states', methods=['GET'])
def get_states():
    """Get list of US states for search dropdown"""
    states = [
        {'code': 'AL', 'name': 'Alabama'}, {'code': 'AK', 'name': 'Alaska'}, {'code': 'AZ', 'name': 'Arizona'},
        {'code': 'AR', 'name': 'Arkansas'}, {'code': 'CA', 'name': 'California'}, {'code': 'CO', 'name': 'Colorado'},
        {'code': 'CT', 'name': 'Connecticut'}, {'code': 'DE', 'name': 'Delaware'}, {'code': 'FL', 'name': 'Florida'},
        {'code': 'GA', 'name': 'Georgia'}, {'code': 'HI', 'name': 'Hawaii'}, {'code': 'ID', 'name': 'Idaho'},
        {'code': 'IL', 'name': 'Illinois'}, {'code': 'IN', 'name': 'Indiana'}, {'code': 'IA', 'name': 'Iowa'},
        {'code': 'KS', 'name': 'Kansas'}, {'code': 'KY', 'name': 'Kentucky'}, {'code': 'LA', 'name': 'Louisiana'},
        {'code': 'ME', 'name': 'Maine'}, {'code': 'MD', 'name': 'Maryland'}, {'code': 'MA', 'name': 'Massachusetts'},
        {'code': 'MI', 'name': 'Michigan'}, {'code': 'MN', 'name': 'Minnesota'}, {'code': 'MS', 'name': 'Mississippi'},
        {'code': 'MO', 'name': 'Missouri'}, {'code': 'MT', 'name': 'Montana'}, {'code': 'NE', 'name': 'Nebraska'},
        {'code': 'NV', 'name': 'Nevada'}, {'code': 'NH', 'name': 'New Hampshire'}, {'code': 'NJ', 'name': 'New Jersey'},
        {'code': 'NM', 'name': 'New Mexico'}, {'code': 'NY', 'name': 'New York'}, {'code': 'NC', 'name': 'North Carolina'},
        {'code': 'ND', 'name': 'North Dakota'}, {'code': 'OH', 'name': 'Ohio'}, {'code': 'OK', 'name': 'Oklahoma'},
        {'code': 'OR', 'name': 'Oregon'}, {'code': 'PA', 'name': 'Pennsylvania'}, {'code': 'RI', 'name': 'Rhode Island'},
        {'code': 'SC', 'name': 'South Carolina'}, {'code': 'SD', 'name': 'South Dakota'}, {'code': 'TN', 'name': 'Tennessee'},
        {'code': 'TX', 'name': 'Texas'}, {'code': 'UT', 'name': 'Utah'}, {'code': 'VT', 'name': 'Vermont'},
        {'code': 'VA', 'name': 'Virginia'}, {'code': 'WA', 'name': 'Washington'}, {'code': 'WV', 'name': 'West Virginia'},
        {'code': 'WI', 'name': 'Wisconsin'}, {'code': 'WY', 'name': 'Wyoming'}, {'code': 'DC', 'name': 'Washington D.C.'}
    ]
    return jsonify(states), 200

@app.route('/api/autocomplete', methods=['GET'])
def autocomplete_places():
    """Get place suggestions for autocomplete"""
    if not gmaps:
        return jsonify({
            "error": "Google Places API is not configured",
            "places": []
        }), 200
    
    try:
        query = request.args.get('query', '').strip()
        if not query or len(query) < 2:
            return jsonify({"places": []}), 200
        
        # Use Google Places Autocomplete API
        places_result = gmaps.places_autocomplete(
            input_text=query,
            types='establishment',
            components={'country': 'us'}
        )
        
        suggestions = []
        for place in places_result[:8]:  # Limit to 8 suggestions
            suggestion = {
                'place_id': place['place_id'],
                'name': place['description'],
                'main_text': place['structured_formatting']['main_text'],
                'secondary_text': place['structured_formatting'].get('secondary_text', '')
            }
            suggestions.append(suggestion)
        
        return jsonify({"places": suggestions}), 200
        
    except Exception as e:
        print("Autocomplete error:", e)
        return jsonify({
            "error": str(e),
            "places": []
        }), 200

@app.route('/api/autocomplete/cities', methods=['GET'])
def autocomplete_cities():
    """Get city suggestions for autocomplete"""
    if not gmaps:
        return jsonify({
            "error": "Google Places API is not configured",
            "cities": []
        }), 200
    
    try:
        query = request.args.get('query', '').strip()
        if not query or len(query) < 2:
            return jsonify({"cities": []}), 200
        
        # Use Google Places Autocomplete API for cities
        places_result = gmaps.places_autocomplete(
            input_text=f"{query}, USA",
            types='(cities)',
            components={'country': 'us'}
        )
        
        suggestions = []
        for place in places_result[:6]:  # Limit to 6 suggestions
            description = place['description']
            # Extract city and state from description
            parts = description.split(', ')
            if len(parts) >= 2:
                city_name = parts[0]
                state_info = parts[1].replace(', USA', '')
                suggestion = {
                    'place_id': place['place_id'],
                    'city': city_name,
                    'state': state_info,
                    'full_name': description
                }
                suggestions.append(suggestion)
        
        return jsonify({"cities": suggestions}), 200
        
    except Exception as e:
        print("City autocomplete error:", e)
        return jsonify({
            "error": str(e),
            "cities": []
        }), 200

@app.route('/api/places', methods=['GET'])
def get_places():
    """Get places using Google Places API instead of MySQL database"""
    if not gmaps:
        return jsonify({
            "error": "Google Places API is not configured. Please add GOOGLE_PLACES_API_KEY to .env file",
            "places": [],
            "total": 0,
            "page": 1,
            "per_page": 10,
            "total_pages": 0
        }), 200
    
    try:
        category = request.args.get('category', '')
        search_term = request.args.get('search', '')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        
        # If there's a search term, use the Google Places search endpoint
        if search_term:
            # Redirect to Google Places search
            return search_google_places()
        
        # For general browsing without search, show popular attractions in major US cities
        # Reduce initial load by limiting cities and places per city
        cities = ['New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Miami, FL', 'Las Vegas, NV']
        
        all_places = []
        places_per_city = max(1, per_page // len(cities))  # Reduce places per city
        
        for city in cities:
            try:
                # Search for attractions in each city
                query = f"attractions in {city} USA"
        
                if category and category != 'All':
                    # Map category to Google search terms
                    category_mapping = {
                        'Restaurants': 'restaurants',
                        'Museums': 'museums',
                        'Parks & Recreation': 'parks',
                        'Attractions': 'attractions',
                        'Shopping': 'shopping',
                        'Hotels': 'hotels',
                        'Nightlife': 'nightlife',
                        'Sports & Entertainment': 'sports venues',
                        'Wellness': 'spas'
                    }
                    if category in category_mapping:
                        query = f"{category_mapping[category]} in {city} USA"
                
                places_result = gmaps.places(query=query)
                
                if places_result['status'] == 'OK':
                    city_places = []
                    city_display_name = city.split(',')[0]
                    
                    # Get details for places in this city
                    for place in places_result.get('results', [])[:places_per_city]:
                        place_id = place.get('place_id')
                        
                        # Get photo URL from original search result
                        photo_url = None
                        if 'photos' in place and len(place['photos']) > 0:
                            photo_reference = place['photos'][0].get('photo_reference')
                            if photo_reference:
                                photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                        
                        try:
                            details = gmaps.place(place_id=place_id, fields=[
                                'name', 'formatted_address', 'geometry', 
                                'rating', 'type', 'url'
                            ])
                            
                            if details['status'] == 'OK':
                                result_data = details['result']
                                
                                # Get place type and convert to category
                                place_type = result_data.get('type', [])
                                if isinstance(place_type, str):
                                    place_type = [place_type]
                                
                                formatted_place = {
                                    'place_id': place_id,
                                    'place_name': result_data.get('name', ''),
                                    'address': result_data.get('formatted_address', ''),
                                    'city_name': city_display_name,
                                    'category': extract_category_from_types(place_type),
                                    'image_url': photo_url,
                                    'rating': str(result_data.get('rating', '4.5')),
                                    'google_maps_url': result_data.get('url', ''),
                                    'lat': result_data['geometry']['location']['lat'] if 'geometry' in result_data else None,
                                    'lng': result_data['geometry']['location']['lng'] if 'geometry' in result_data else None
                                }
                                city_places.append(formatted_place)
                        except Exception as e:
                            print(f"Error fetching place details for {place_id}: {e}")
                            continue
                    
                    all_places.extend(city_places)
                    
            except Exception as e:
                print(f"Error processing city {city}: {e}")
                continue
        
        # Apply pagination
        total = len(all_places)
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_places = all_places[start_idx:end_idx]
        
        return jsonify({
            'places': paginated_places,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page
        }), 200
        
    except Exception as e:
        print("Error fetching places:", e)
        return jsonify({
            "error": str(e),
            "places": [],
            "total": 0,
            "page": 1,
            "per_page": 10,
            "total_pages": 0
        }), 200

# New advanced search endpoint
@app.route('/api/search', methods=['GET'])
def advanced_search():
    """Advanced search with place type, state, and optional city/zip"""
    if not gmaps:
        return jsonify({
            "error": "Google Places API is not configured",
            "places": [],
            "total": 0
        }), 200
    
    try:
        place_type = request.args.get('place_type', '').strip()
        state = request.args.get('state', '').strip()
        city = request.args.get('city', '').strip()
        categories = request.args.get('categories', '').strip()
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        
        if not place_type and not categories:
            return jsonify({
                "error": "Place type or categories are required",
                "places": [],
                "total": 0
            }), 200
        
        # Determine search terms
        search_terms = []
        if place_type:
            search_terms.append(place_type)
        if categories:
            category_list = categories.split(',')
            search_terms.extend(category_list)
        
        # Build search query
        search_term = ' and '.join(search_terms)
        if city and state:
            # Both city and state specified
            query = f"{search_term} in {city}, {state} USA"
        elif city:
            # Only city specified
            query = f"{search_term} in {city} USA"
        elif state:
            # Only state specified
            query = f"{search_term} in {state} USA"
        else:
            # No location specified - search USA
            query = f"{search_term} in USA"
        
        print(f"Searching for: {query}")
        
        # Use Places API text search
        places_result = gmaps.places(query=query)
        
        if places_result['status'] not in ['OK', 'ZERO_RESULTS']:
            return jsonify({
                "error": f"Google Places API error: {places_result.get('status')}",
                "places": [],
                "total": 0
            }), 200
        
        # Format the results
        all_places = []
        print(f"Processing {len(places_result.get('results', []))} search results")
        
        for i, place in enumerate(places_result.get('results', [])):
            place_id = place.get('place_id')
            print(f"Processing place {i+1}: {place.get('name', 'Unknown')} - {place_id}")
            
            # Get photo URL from original search result
            photo_url = None
            if 'photos' in place and len(place['photos']) > 0:
                photo_reference = place['photos'][0].get('photo_reference')
                if photo_reference:
                    photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
            
            # Get place details for more information
            try:
                details = gmaps.place(place_id=place_id, fields=[
                    'name', 'formatted_address', 'geometry', 
                    'rating', 'type', 'url'
                ])
                
                if details['status'] == 'OK':
                    result = details['result']
                    
                    # Extract category from type
                    place_type_list = result.get('type', [])
                    if isinstance(place_type_list, str):
                        place_type_list = [place_type_list]
                    category = extract_category_from_types(place_type_list)
                    
                    # Check if result matches our criteria
                    address = result.get('formatted_address', '')
                    print(f"  Address: {address}")
                    
                    # If city was specified, check if the result is in the right area
                    if city:
                        print(f"  Checking city match: '{city}' in '{address.lower()}'")
                        # For NYC, also include Brooklyn, Manhattan, Queens, etc.
                        if city.lower() in ['new york', 'nyc', 'new york city']:
                            if not any(borough in address.lower() for borough in ['new york', 'brooklyn', 'manhattan', 'queens', 'bronx', 'staten island']):
                                print(f"  Skipping - not in NYC area")
                                continue
                        # For other cities, be more specific
                        elif city.lower() not in address.lower():
                            print(f"  Skipping - city doesn't match")
                            continue
                        else:
                            print(f"  City match found!")
                    
                    # If state was specified, ensure it's in the right state
                    if state:
                        print(f"  Checking state match: '{state.upper()}' in '{address.upper()}'")
                        if state.upper() not in address.upper():
                            print(f"  Skipping - state doesn't match")
                            continue
                        else:
                            print(f"  State match found!")
                    
                    formatted_place = {
                        'place_id': place_id,
                        'place_name': result.get('name', ''),
                        'address': address,
                        'city_name': extract_city_from_address(address),
                        'category': category,
                        'image_url': photo_url,
                        'rating': result.get('rating', '4.5'),
                        'google_maps_url': result.get('url', ''),
                        'lat': result['geometry']['location']['lat'] if 'geometry' in result else None,
                        'lng': result['geometry']['location']['lng'] if 'geometry' in result else None
                    }
                    all_places.append(formatted_place)
                    print(f"  Added place: {formatted_place['place_name']}")
                else:
                    print(f"  Skipping - place details failed: {details.get('status')}")
            except Exception as e:
                print(f"Error fetching place details for {place_id}: {e}")
                continue
        
        # Apply pagination
        total = len(all_places)
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_places = all_places[start_idx:end_idx]
        
        print(f"Final results: {total} total places, returning {len(paginated_places)} places for page {page}")
        
        response_data = {
            'places': paginated_places,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page,
            'query': query
        }
        
        print(f"Response data: {response_data}")
        return jsonify(response_data), 200
        
    except Exception as e:
        print("Advanced search error:", e)
        return jsonify({
            "error": str(e),
            "places": [],
            "total": 0
        }), 200

# Google Places API endpoint (keep for backward compatibility)
@app.route('/api/google-places/search', methods=['GET'])
def search_google_places():
    """
    Search for places using Google Places API
    Query params:
    - query: search term (e.g., "restaurants in New York")
    - category: filter by category (optional)
    """
    if not gmaps:
        return jsonify({
            "error": "Google Places API is not configured. Please add GOOGLE_PLACES_API_KEY to .env file",
            "places": [],
            "total": 0
        }), 200
    
    try:
        search_query = request.args.get('query', request.args.get('search', ''))
        category_filter = request.args.get('category', '')
        
        if not search_query:
            return jsonify({"error": "Query parameter is required", "places": [], "total": 0}), 200
        
        # Use Places API text search
        places_result = gmaps.places(query=search_query)
        
        if places_result['status'] not in ['OK', 'ZERO_RESULTS']:
            return jsonify({
                "error": f"Google Places API error: {places_result.get('status')}",
                "places": [],
                "total": 0
            }), 200
        
        # Format the results
        formatted_places = []
        for place in places_result.get('results', [])[:20]:  # Limit to 20 results
            place_id = place.get('place_id')
            
            # Get photo URL from original search result
            photo_url = None
            if 'photos' in place and len(place['photos']) > 0:
                photo_reference = place['photos'][0].get('photo_reference')
                if photo_reference:
                    photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
            
            # Get place details for more information
            try:
                details = gmaps.place(place_id=place_id, fields=[
                    'name', 'formatted_address', 'geometry', 
                    'rating', 'type', 'url'
                ])
                
                if details['status'] == 'OK':
                    result = details['result']
                    
                    # Extract category from type
                    place_type = result.get('type', [])
                    if isinstance(place_type, str):
                        place_type = [place_type]
                    category = extract_category_from_types(place_type)
                    
                    # Apply category filter if specified
                    if category_filter and category_filter != 'All' and category != category_filter:
                        continue
                    
                    formatted_place = {
                        'place_id': place_id,
                        'place_name': result.get('name', ''),
                        'address': result.get('formatted_address', ''),
                        'city_name': extract_city_from_address(result.get('formatted_address', '')),
                        'category': category,
                        'image_url': photo_url,
                        'rating': result.get('rating', '4.5'),
                        'google_maps_url': result.get('url', ''),
                        'lat': result['geometry']['location']['lat'] if 'geometry' in result else None,
                        'lng': result['geometry']['location']['lng'] if 'geometry' in result else None
                    }
                    formatted_places.append(formatted_place)
            except Exception as e:
                print(f"Error fetching details for place {place_id}: {e}")
                continue
        
        return jsonify({
            'places': formatted_places,
            'total': len(formatted_places),
            'page': 1,
            'per_page': len(formatted_places),
            'total_pages': 1
        }), 200
        
    except Exception as e:
        print("Google Places API Error:", e)
        return jsonify({
            "error": str(e),
            "places": [],
            "total": 0
        }), 200

def extract_city_from_address(address):
    """Extract city name from formatted address"""
    if not address:
        return ''
    # Address format is usually: Street, City, State ZIP, Country
    parts = address.split(',')
    if len(parts) >= 2:
        # Usually the city is the second-to-last or third-to-last part
        return parts[-3].strip() if len(parts) >= 3 else parts[-2].strip()
    return ''

def extract_category_from_types(types):
    """Extract category from Google Place types"""
    category_mapping = {
        'restaurant': 'Restaurants',
        'cafe': 'Restaurants',
        'bar': 'Restaurants',
        'food': 'Restaurants',
        'museum': 'Museums',
        'art_gallery': 'Museums',
        'park': 'Parks & Recreation',
        'amusement_park': 'Parks & Recreation',
        'tourist_attraction': 'Attractions',
        'zoo': 'Attractions',
        'aquarium': 'Attractions',
        'shopping_mall': 'Shopping',
        'store': 'Shopping',
        'lodging': 'Hotels',
        'hotel': 'Hotels',
        'night_club': 'Nightlife',
        'casino': 'Nightlife',
        'stadium': 'Sports & Entertainment',
        'movie_theater': 'Sports & Entertainment',
        'spa': 'Wellness',
        'gym': 'Wellness'
    }
    
    for place_type in types:
        if place_type in category_mapping:
            return category_mapping[place_type]
    
    return 'Attractions'

# New endpoint to get place details from Google Places API
@app.route('/api/place/<place_id>', methods=['GET'])
def get_place_details(place_id):
    """Get place details using Google Places API instead of MySQL database"""
    if not gmaps:
        return jsonify({"error": "Google Places API is not configured"}), 500
    
    try:
        # Get place details from Google Places API
        details = gmaps.place(place_id=place_id, fields=[
            'name', 'formatted_address', 'geometry', 'photo', 
            'rating', 'type', 'url', 'website', 'formatted_phone_number',
            'opening_hours', 'price_level', 'user_ratings_total'
        ])
        
        if details['status'] != 'OK':
            return jsonify({"error": f"Place not found: {details.get('status')}"}), 404
        
        result = details['result']
        
        # Get photo URL
        photo_url = None
        photo_data = result.get('photo')
        if photo_data and isinstance(photo_data, list) and len(photo_data) > 0:
            photo_reference = photo_data[0].get('photo_reference')
            if photo_reference:
                photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
        elif photo_data and isinstance(photo_data, dict):
            photo_reference = photo_data.get('photo_reference')
            if photo_reference:
                photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
        
        # Get place type and convert to category
        place_type = result.get('type', [])
        if isinstance(place_type, str):
            place_type = [place_type]
        
        # Format response
        place_details = {
            'id': place_id,
            'name': result.get('name', ''),
            'category': extract_category_from_types(place_type),
            'address': result.get('formatted_address', ''),
            'city_name': extract_city_from_address(result.get('formatted_address', '')),
            'image_url': photo_url,
            'rating': result.get('rating', 0),
            'user_ratings_total': result.get('user_ratings_total', 0),
            'price_level': result.get('price_level'),
            'phone': result.get('formatted_phone_number'),
            'website': result.get('website'),
            'google_maps_url': result.get('url'),
            'opening_hours': result.get('opening_hours'),
            'lat': result['geometry']['location']['lat'] if 'geometry' in result else None,
            'lng': result['geometry']['location']['lng'] if 'geometry' in result else None
        }
        
        return jsonify(place_details), 200
        
    except Exception as e:
        print("Error fetching place details:", e)
        return jsonify({"error": str(e)}), 500

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
        # Note: place_id now stores Google Places place_id instead of MySQL place id
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
            u.username
        FROM calendar_events ce
        JOIN chat_groups cg ON ce.group_id = cg.id
        JOIN users u ON ce.created_by = u.user_id
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
        
        # Format dates and fetch place details from Google Places API if place_id exists
        for event in events:
            event['start_date'] = event['start_date'].isoformat() if event['start_date'] else None
            event['end_date'] = event['end_date'].isoformat() if event['end_date'] else None
            
            # Fetch place details from Google Places API if place_id exists
            if event.get('place_id') and gmaps:
                try:
                    place_details = gmaps.place(place_id=event['place_id'], fields=[
                        'name', 'formatted_address', 'type'
                    ])
                    
                    if place_details['status'] == 'OK':
                        place_data = place_details['result']
                        event['place_name'] = place_data.get('name', '')
                        event['place_address'] = place_data.get('formatted_address', '')
                        event['place_category'] = extract_category_from_types(
                            [place_data.get('type', [])] if isinstance(place_data.get('type'), str) 
                            else place_data.get('type', [])
                        )
                        event['city_name'] = extract_city_from_address(place_data.get('formatted_address', ''))
                except Exception as e:
                    print(f"Error fetching place details for {event['place_id']}: {e}")
                    event['place_name'] = ''
                    event['place_address'] = ''
                    event['place_category'] = ''
                    event['city_name'] = ''
            else:
                event['place_name'] = ''
                event['place_address'] = ''
                event['place_category'] = ''
                event['city_name'] = ''
        
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

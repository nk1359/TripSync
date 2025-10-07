from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import mysql.connector
from datetime import datetime
import os
from dotenv import load_dotenv
import googlemaps

# Load environment variables
load_dotenv()

# Database configuration
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': os.getenv('DB_PASSWORD'),
    'database': 'tripsync'
}

# Initialize Flask app
app = Flask(__name__, static_folder='build', static_url_path='')
CORS(app)

# Initialize Google Maps client
GOOGLE_PLACES_API_KEY = os.getenv('GOOGLE_PLACES_API_KEY')
gmaps = None
if GOOGLE_PLACES_API_KEY:
    gmaps = googlemaps.Client(key=GOOGLE_PLACES_API_KEY)
else:
    print("WARNING: Google Places API key not found!")

# Authentication routes
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    first_name = data.get('first_name')
    last_name = data.get('last_name')
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if not all([first_name, last_name, username, email, password]):
        return jsonify({"error": "All fields are required"}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Check if username or email already exists
        cursor.execute("SELECT * FROM users WHERE username = %s OR email = %s", (username, email))
        if cursor.fetchone():
            return jsonify({"error": "Username or email already exists"}), 409
        
        # Insert new user
        cursor.execute("""
            INSERT INTO users (first_name, last_name, username, email, password)
            VALUES (%s, %s, %s, %s, %s)
        """, (first_name, last_name, username, email, password))
        
        conn.commit()
        
        # Get the created user
        cursor.execute("SELECT user_id, first_name, last_name, username, email FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        
        return jsonify({
            "message": "User registered successfully",
            "user": {
                "user_id": user[0],
                "first_name": user[1],
                "last_name": user[2],
                "username": user[3],
                "email": user[4]
            }
        }), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT user_id, first_name, last_name, username, email FROM users WHERE username = %s AND password = %s", 
                      (username, password))
        user = cursor.fetchone()
        
        if user:
            return jsonify({
                "message": "Login successful",
                "user": user
            }), 200
        else:
            return jsonify({"error": "Invalid credentials"}), 401
            
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Friend request routes
@app.route('/api/search_users', methods=['GET'])
def search_users():
    query = request.args.get('query', '')
    current_user_id = request.args.get('user_id')
    
    if not query or not current_user_id:
        return jsonify({"error": "Query and user_id are required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Search for users by username, excluding current user
        cursor.execute("""
            SELECT user_id, first_name, last_name, username 
            FROM users
            WHERE (username LIKE %s OR first_name LIKE %s OR last_name LIKE %s)
            AND user_id != %s
            LIMIT 10
        """, (f'%{query}%', f'%{query}%', f'%{query}%', current_user_id))
        
        users = cursor.fetchall()
        
        # For each user, check if already friends or pending request
        for user in users:
            cursor.execute("""
                SELECT status FROM friends 
                WHERE (user_id = %s AND friend_id = %s) 
                OR (user_id = %s AND friend_id = %s)
            """, (current_user_id, user['user_id'], user['user_id'], current_user_id))
            
            friends = cursor.fetchone()
            user['friends_status'] = friends['status'] if friends else None
        
        return jsonify(users), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/send_friend_request', methods=['POST'])
def send_friend_request():
    data = request.json
    user_id = data.get('user_id')
    friend_id = data.get('friend_id')
    
    if not user_id or not friend_id:
        return jsonify({"error": "user_id and friend_id are required"}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Check if friends already exists
        cursor.execute("""
            SELECT * FROM friends 
            WHERE (user_id = %s AND friend_id = %s) 
            OR (user_id = %s AND friend_id = %s)
        """, (user_id, friend_id, friend_id, user_id))
        
        if cursor.fetchone():
            return jsonify({"error": "Friend request already exists"}), 409
        
        # Insert friend request
        cursor.execute("""
            INSERT INTO friends (user_id, friend_id, status)
            VALUES (%s, %s, 'pending')
        """, (user_id, friend_id))
        
        conn.commit()
        return jsonify({"message": "Friend request sent"}), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/friend_requests/<int:user_id>', methods=['GET'])
def get_friend_requests(user_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get pending friend requests received by this user
        cursor.execute("""
            SELECT f.id, f.user_id, u.first_name, u.last_name, u.username
            FROM friends f
            JOIN users u ON f.user_id = u.user_id
            WHERE f.friend_id = %s AND f.status = 'pending'
        """, (user_id,))
        
        requests = cursor.fetchall()
        return jsonify(requests), 200

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/accept_friend_request/<int:request_id>', methods=['POST'])
def accept_friend_request(request_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Update friends status to accepted
        cursor.execute("""
            UPDATE friends 
            SET status = 'accepted'
            WHERE id = %s
        """, (request_id,))
        
        conn.commit()
        return jsonify({"message": "Friend request accepted"}), 200

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/reject_friend_request/<int:request_id>', methods=['POST'])
def reject_friend_request(request_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Delete the friend request
        cursor.execute("DELETE FROM friends WHERE id = %s", (request_id,))
        
        conn.commit()
        return jsonify({"message": "Friend request rejected"}), 200

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Friend routes
@app.route('/api/friends/<int:user_id>', methods=['GET'])
def get_friends(user_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Get all accepted friendss for this user
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN f.user_id = %s THEN u2.user_id
                    ELSE u1.user_id
                END as user_id,
                CASE 
                    WHEN f.user_id = %s THEN u2.first_name
                    ELSE u1.first_name
                END as first_name,
                CASE 
                    WHEN f.user_id = %s THEN u2.last_name
                    ELSE u1.last_name
                END as last_name,
                CASE 
                    WHEN f.user_id = %s THEN u2.username
                    ELSE u1.username
                END as username
            FROM friends f
            JOIN users u1 ON f.user_id = u1.user_id
            JOIN users u2 ON f.friend_id = u2.user_id
            WHERE (f.user_id = %s OR f.friend_id = %s) AND f.status = 'accepted'
        """, (user_id, user_id, user_id, user_id, user_id, user_id))
        
        friends = cursor.fetchall()
        return jsonify(friends), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Chat/Group routes
@app.route('/api/groups/<int:user_id>', methods=['GET'])
@app.route('/api/chat_groups/<int:user_id>', methods=['GET'])
def get_chat_groups(user_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # First get the user's username
        cursor.execute("SELECT username FROM users WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify([]), 200
        
        username = user['username']
        
        # Get all groups user is part of or created
        cursor.execute("""
            SELECT DISTINCT g.id as group_id, g.name as group_name, g.created_at
        FROM chat_groups g
            WHERE g.created_by = %s 
            OR g.id IN (SELECT group_id FROM group_members WHERE username = %s)
            ORDER BY g.created_at DESC
        """, (username, username))
        
        groups = cursor.fetchall()
        
        # For each group, get the latest message and member count
        for group in groups:
            cursor.execute("""
                SELECT m.message, m.created_at as timestamp
                FROM messages m
                WHERE m.group_id = %s
                ORDER BY m.created_at DESC
                LIMIT 1
            """, (group['group_id'],))
            
            latest_message = cursor.fetchone()
            if latest_message:
                group['latest_message'] = latest_message['message']
                group['latest_message_time'] = latest_message['timestamp']
            else:
                group['latest_message'] = None
                group['latest_message_time'] = None
            
            # Get member count
            cursor.execute("""
                SELECT COUNT(*) as count FROM group_members WHERE group_id = %s
            """, (group['group_id'],))
            count_result = cursor.fetchone()
            group['member_count'] = (count_result['count'] + 1) if count_result else 1  # +1 for creator
        
        return jsonify(groups), 200
        
    except mysql.connector.Error as err:
        print(f"Database error in get_chat_groups: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/chat_groups', methods=['POST'])
def create_chat_groups():
    data = request.json
    chat_groups_name = data.get('chat_groups_name')
    user_id = data.get('user_id')
    member_ids = data.get('member_ids', [])
    
    if not chat_groups_name or not user_id:
        return jsonify({"error": "chat_groups_name and user_id are required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Create chat_groups
        cursor.execute("""
            INSERT INTO `chat_groups` (chat_groups_name, created_by)
            VALUES (%s, %s)
        """, (chat_groups_name, user_id))
        
        chat_groups_id = cursor.lastrowid
        
        # Add creator to chat_groups
        cursor.execute("""
            INSERT INTO user_chat_groups (user_id, chat_groups_id)
            VALUES (%s, %s)
        """, (user_id, chat_groups_id))
        
        # Add other members
        for member_id in member_ids:
            cursor.execute("""
                INSERT INTO user_chat_groups (user_id, chat_groups_id)
                VALUES (%s, %s)
            """, (member_id, chat_groups_id))

        conn.commit()
        return jsonify({"message": "Group created", "chat_groups_id": chat_groups_id}), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/create', methods=['POST'])
def create_trip():
    """Create a trip (chat_groups + calendar events for locations)"""
    data = request.json
    user_id = data.get('user_id')
    trip_name = data.get('trip_name')
    description = data.get('description', '')
    member_ids = data.get('member_ids', [])
    locations = data.get('locations', [])
    
    if not user_id or not trip_name:
        return jsonify({"error": "user_id and trip_name are required"}), 400
    
    if not locations:
        return jsonify({"error": "At least one location is required"}), 400
        
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Create chat_groups for the trip
        cursor.execute("""
            INSERT INTO `chat_groups` (chat_groups_name, created_by)
            VALUES (%s, %s)
        """, (trip_name, user_id))
        
        chat_groups_id = cursor.lastrowid
        
        # Add creator to chat_groups
        cursor.execute("""
            INSERT INTO user_chat_groups (user_id, chat_groups_id)
            VALUES (%s, %s)
        """, (user_id, chat_groups_id))
        
        # Add other members if specified
        for member_id in member_ids:
            try:
                cursor.execute("""
                    INSERT INTO user_chat_groups (user_id, chat_groups_id)
                    VALUES (%s, %s)
                """, (member_id, chat_groups_id))
            except mysql.connector.Error:
                # Skip if user is already in chat_groups
                pass
        
        # Create calendar events for each location
        for location in locations:
            city = location.get('city')
            state = location.get('state')
            start_date = location.get('startDate')
            end_date = location.get('endDate') or start_date
            
            if not city or not start_date:
                continue
            
            location_str = f"{city}, {state}" if state else city
            event_title = f"Visit {city}"
            
            cursor.execute("""
                INSERT INTO calendar_events 
                (title, description, start_date, end_date, location, chat_groups_id, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (event_title, description, start_date, end_date, location_str, chat_groups_id, user_id))
        
        conn.commit()
        
        return jsonify({
            "message": "Trip created successfully",
            "chat_groups_id": chat_groups_id,
            "trip_name": trip_name
        }), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/chat_groups/<int:chat_groups_id>/messages', methods=['GET'])
def get_messages(chat_groups_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT m.message_id, m.message, m.timestamp, m.user_id,
                   u.first_name, u.last_name, u.username
            FROM messagess m
            JOIN users u ON m.user_id = u.user_id
            WHERE m.chat_groups_id = %s
            ORDER BY m.timestamp ASC
        """, (chat_groups_id,))
        
        messages = cursor.fetchall()
        return jsonify(messages), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/chat_groups/<int:chat_groups_id>/messages', methods=['POST'])
def send_message(chat_groups_id):
    data = request.json
    user_id = data.get('user_id')
    messages = data.get('message')
    
    if not user_id or not message:
        return jsonify({"error": "user_id and messages are required"}), 400
        
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO messagess (chat_groups_id, user_id, message)
            VALUES (%s, %s, %s)
        """, (chat_groups_id, user_id, message))
        
        conn.commit()
        
        # Get the created messages with user details
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT m.message_id, m.message, m.timestamp, m.user_id,
                   u.first_name, u.last_name, u.username
            FROM messagess m
            JOIN users u ON m.user_id = u.user_id
            WHERE m.message_id = %s
        """, (cursor.lastrowid,))
        
        new_messages = cursor.fetchone()
        return jsonify(new_message), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/chat_groups/<int:chat_groups_id>/members', methods=['GET'])
def get_chat_groups_members(chat_groups_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT u.user_id, u.first_name, u.last_name, u.username
            FROM user_chat_groups ug
            JOIN users u ON ug.user_id = u.user_id
            WHERE ug.chat_groups_id = %s
        """, (chat_groups_id,))
        
        members = cursor.fetchall()
        return jsonify(members), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Google Places API routes
@app.route('/api/autocomplete', methods=['GET'])
def autocomplete():
    """Autocomplete for place search"""
    if not gmaps:
        return jsonify({"error": "Google Places API is not configured"}), 500
    
    query = request.args.get('query', '')
    if not query:
        return jsonify([]), 200
    
    try:
        result = gmaps.places_autocomplete(query)
        suggestions = [
            {
                'description': place['description'],
                'place_id': place['place_id']
            }
            for place in result
        ]
        return jsonify(suggestions), 200
    except Exception as e:
        print("Error in autocomplete:", e)
        return jsonify({"error": str(e)}), 500

@app.route('/api/autocomplete/cities', methods=['GET'])
def autocomplete_cities():
    """Autocomplete specifically for cities"""
    if not gmaps:
        return jsonify({"error": "Google Places API is not configured"}), 500
    
    query = request.args.get('query', '')
    if not query:
        return jsonify([]), 200
    
    try:
        result = gmaps.places_autocomplete(
            query,
            types=['(cities)']
        )
        suggestions = [
            {
                'description': place['description'],
                'place_id': place['place_id']
            }
            for place in result
        ]
        return jsonify(suggestions), 200
    except Exception as e:
        print("Error in city autocomplete:", e)
        return jsonify({"error": str(e)}), 500

@app.route('/api/search', methods=['GET'])
def search_places():
    """Search for places using Google Places API"""
    if not gmaps:
        return jsonify({"error": "Google Places API is not configured"}), 500
    
    # Get query parameters
    place_type = request.args.get('place_type', '')
    category = request.args.get('categories', '')
    city = request.args.get('city', '')
    state = request.args.get('state', '')
    country = request.args.get('country', 'USA')
    
    # Build location string
    location_parts = [part for part in [city, state, country] if part]
    location = ', '.join(location_parts) if location_parts else None
    
    if not location and not place_type:
        return jsonify({"error": "Either location or place_type is required"}), 400
    
    try:
        # Build search query
        search_query = f"{place_type} and {category}" if place_type and category else (place_type or category)
        
        # If we have a location, add it to the query
        if location:
            search_query = f"{search_query} in {location}"
        
        print(f"Searching for: {search_query}")
        
        # Perform text search
        results = gmaps.places(query=search_query)
        
        print(f"Processing {len(results.get('results', []))} search results")
        
        formatted_places = []
        
        for idx, place in enumerate(results.get('results', []), 1):
            try:
                place_id = place.get('place_id')
                print(f"Processing place {idx}: {place.get('name')} - {place_id}")
                
                # Get photo URL
                photo_url = None
                photos = place.get('photos')
                if photos and len(photos) > 0:
                    photo_reference = photos[0].get('photo_reference')
                    if photo_reference:
                        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                
                # Get detailed place information
                try:
                    details = gmaps.place(place_id=place_id, fields=[
                        'name', 'formatted_address', 'geometry', 
                        'rating', 'type', 'url'
                    ])
                    
                    if details['status'] == 'OK':
                        result_data = details['result']
                        
                        # Get place type and convert to category
                        place_type = result_data.get('types', [])
                        if isinstance(place_type, str):
                            place_type = [place_type]
                        
                        formatted_place = {
                            'place_id': place_id,
                            'place_name': result_data.get('name', ''),
                            'address': result_data.get('formatted_address', ''),
                            'city_name': city.split(',')[0] if city else extract_city_from_address(result_data.get('formatted_address', '')),
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
            
            except Exception as e:
                print(f"Error processing place: {e}")
                continue
        
        return jsonify({
            'places': formatted_places,
            'total': len(formatted_places)
        }), 200
        
    except Exception as e:
        print("Error in place search:", e)
        return jsonify({"error": str(e)}), 500

def extract_city_from_address(address):
    """Extract city name from formatted address"""
    if not address:
        return ''
    
    parts = address.split(',')
    if len(parts) >= 2:
        return parts[-3].strip() if len(parts) >= 3 else parts[0].strip()
    return parts[0].strip()

@app.route('/api/search/city', methods=['GET'])
def search_places_in_city():
    """Search for places in a specific city using Google Places API"""
    if not gmaps:
        return jsonify({"error": "Google Places API is not configured"}), 500
    
    # Get query parameters
    city_name = request.args.get('city', '')
    category = request.args.get('category', '')
    
    if not city_name:
        return jsonify({"error": "City name is required"}), 400
    
    try:
        # Get city coordinates first
        geocode_result = gmaps.geocode(city_name)
        if not geocode_result:
            return jsonify({"error": "City not found"}), 404
        
        city_location = geocode_result[0]['geometry']['location']
        city_display_name = geocode_result[0].get('formatted_address', city_name)
        
        # Search for places in this city
        search_type = ''
        if category and category != 'All':
            # Map our category to Google Places types
            category_map = {
                'Restaurants': 'restaurant',
                'Hotels': 'lodging',
                'Attractions': 'tourist_attraction',
                'Museums': 'museum',
                'Parks & Recreation': 'park',
                'Shopping': 'shopping_mall'
            }
            search_type = category_map.get(category, 'tourist_attraction')
        
        # Perform nearby search
        results = gmaps.places_nearby(
            location=city_location,
            radius=50000,  # 50km radius
            type=search_type if search_type else None
        )
        
        city_places = []
        
        for place in results.get('results', []):
            try:
                place_id = place.get('place_id')
                
                # Get photo URL
                photo_url = None
                photos = place.get('photos')
                if photos and len(photos) > 0:
                    photo_reference = photos[0].get('photo_reference')
                    if photo_reference:
                        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                
                # Get detailed place information
                try:
                    details = gmaps.place(place_id=place_id, fields=[
                        'name', 'formatted_address', 'geometry', 
                        'rating', 'type', 'url'
                    ])
                    
                    if details['status'] == 'OK':
                        result_data = details['result']
                        
                        # Get place type and convert to category
                        place_type = result_data.get('types', [])
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
                except Exception as e:
                    print(f"Error fetching details for {place_id}: {e}")
                    continue
            
            except Exception as e:
                print(f"Error processing place: {e}")
                continue
        
        return jsonify({
            'results': city_places,
            'total': len(city_places),
            'city': city_display_name
        }), 200
        
    except Exception as e:
        print("Error in city search:", e)
        return jsonify({"error": str(e)}), 500

def is_location_match(address, city=None, state=None):
    """Check if address matches the specified city and/or state"""
    if not address:
        return False
    
    address_lower = address.lower()
    
    # Check city match
    if city:
        print(f"  Checking city match: '{city}' in '{address_lower}'")
        city_lower = city.lower()
        
        # For cities like "New York", check if it appears in the address
        # Also check for the city name in different formats
        if city_lower in address_lower:
            print(f"  City match found!")
        elif state:
            # If city not found but state is provided, check if address is in the state
            # Some NYC areas like Queens, Brooklyn might not say "New York" in address
            state_upper = state.upper()
            address_upper = address.upper()
            
            # Check if state code appears in address
            if f' {state_upper} ' in f' {address_upper} ':
                print(f"  Checking state match: '{state_upper}' in '{address_upper}'")
                print(f"  State match found!")
                return True
            else:
                print(f"  Skipping - city doesn't match")
                return False
        else:
            print(f"  Skipping - city doesn't match")
            return False
    
    # Check state match if city matched or no city specified
    if state:
        state_upper = state.upper()
        address_upper = address.upper()
        
        # Check if state code appears in address (with spaces to avoid partial matches)
        if f' {state_upper} ' in f' {address_upper} ':
            return True
        
        print(f"  Skipping - state doesn't match")
        return False
    
    return True

@app.route('/api/search/advanced', methods=['GET'])
def advanced_search():
    """Advanced search with city/state filtering using Google Places API"""
    if not gmaps:
        return jsonify({"error": "Google Places API is not configured"}), 500
    
    # Get query parameters
    place_type = request.args.get('place_type', '')
    category = request.args.get('category', '')
    city = request.args.get('city', '')
    state = request.args.get('state', '')
    
    if not place_type and not category:
        return jsonify({"error": "Either place_type or category is required"}), 400
    
    try:
        # Build search query
        search_parts = []
        if place_type:
            search_parts.append(place_type)
        if category and category != 'All':
            search_parts.append(category)
        
        search_query = ' '.join(search_parts)
        
        # Add location to query
        location_parts = []
        if city:
            location_parts.append(city)
        if state:
            location_parts.append(state)
        location_parts.append('USA')
        
        location_string = ', '.join(location_parts)
        full_query = f"{search_query} in {location_string}"
        
        print(f"Searching for: {full_query}")
        
        # Perform text search
        results = gmaps.places(query=full_query)
        
        print(f"Processing {len(results.get('results', []))} search results")
        
        formatted_places = []
        
        for idx, place in enumerate(results.get('results', []), 1):
            try:
                place_id = place.get('place_id')
                print(f"Processing place {idx}: {place.get('name')} - {place_id}")
                
                # Get photo URL
                photo_url = None
                photos = place.get('photos')
                if photos and len(photos) > 0:
                    photo_reference = photos[0].get('photo_reference')
                    if photo_reference:
                        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                
                # Get detailed place information
                try:
                    details = gmaps.place(place_id=place_id, fields=[
                        'name', 'formatted_address', 'geometry', 
                        'rating', 'type', 'url'
                    ])
                    
                    if details['status'] == 'OK':
                        result_data = details['result']
                        
                        # Get place type and convert to category
                        place_type_list = result_data.get('types', [])
                        if isinstance(place_type_list, str):
                            place_type_list = [place_type_list]
                        category = extract_category_from_types(place_type_list)
                        
                        # Check if result matches our criteria
                        address = result_data.get('formatted_address', '')
                        print(f"  Address: {address}")
                        
                        # Apply location filter
                        if not is_location_match(address, city, state):
                            continue
                        
                        city_display_name = city if city else extract_city_from_address(address)
                        
                        formatted_place = {
                            'place_id': place_id,
                            'place_name': result_data.get('name', ''),
                            'address': address,
                            'city_name': city_display_name,
                            'category': category,
                            'image_url': photo_url,
                            'rating': str(result_data.get('rating', '4.5')),
                            'google_maps_url': result_data.get('url', ''),
                            'lat': result_data['geometry']['location']['lat'] if 'geometry' in result_data else None,
                            'lng': result_data['geometry']['location']['lng'] if 'geometry' in result_data else None
                        }
                        formatted_places.append(formatted_place)
                        print(f"  Added place: {formatted_place['place_name']}")
                
                except Exception as e:
                    print(f"Error fetching place details for {place_id}: {e}")
                    continue
            
            except Exception as e:
                print(f"Error processing place: {e}")
                continue
        
        return jsonify({
            'places': formatted_places,
            'total': len(formatted_places)
        }), 200

    except Exception as e:
        print("Error in advanced search:", e)
        return jsonify({"error": str(e)}), 500

@app.route('/api/search/nearby', methods=['GET'])
def search_nearby():
    """Search for places near a location"""
    if not gmaps:
        return jsonify({"error": "Google Places API is not configured"}), 500
    
    lat = request.args.get('lat')
    lng = request.args.get('lng')
    radius = request.args.get('radius', 5000)  # Default 5km
    category_filter = request.args.get('category')
    
    if not lat or not lng:
        return jsonify({"error": "Latitude and longitude are required"}), 400
    
    try:
        location = (float(lat), float(lng))
        
        # Map category to Google Places type
        place_type = None
        if category_filter and category_filter != 'All':
            category_map = {
                'Restaurants': 'restaurant',
                'Hotels': 'lodging',
                'Attractions': 'tourist_attraction',
                'Museums': 'museum',
                'Parks & Recreation': 'park',
                'Shopping': 'shopping_mall'
            }
            place_type = category_map.get(category_filter)
        
        # Search nearby places
        results = gmaps.places_nearby(
            location=location,
            radius=int(radius),
            type=place_type
        )
        
        formatted_places = []
        
        for place in results.get('results', []):
            try:
                place_id = place.get('place_id')
                
                # Get photo URL
                photo_url = None
                photos = place.get('photos')
                if photos and len(photos) > 0:
                    photo_reference = photos[0].get('photo_reference')
                    if photo_reference:
                        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                
                # Get detailed place information
                details = gmaps.place(place_id=place_id, fields=[
                    'name', 'formatted_address', 'geometry', 
                    'rating', 'type', 'url'
                ])
                
                if details['status'] == 'OK':
                    result = details['result']
                    
                    # Extract category from type
                    place_type = result.get('types', [])
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
                        'rating': str(result.get('rating', '4.5')),
                        'google_maps_url': result.get('url', ''),
                        'lat': result['geometry']['location']['lat'],
                        'lng': result['geometry']['location']['lng']
                    }
                    formatted_places.append(formatted_place)
            
            except Exception as e:
                print(f"Error processing place: {e}")
                continue
        
        return jsonify({
            'places': formatted_places,
            'total': len(formatted_places)
        }), 200
        
    except Exception as e:
        print("Error in nearby search:", e)
        return jsonify({"error": str(e)}), 500

def extract_category_from_types(types):
    """Extract category from Google Place types with priority ordering"""
    
    # Print for debugging
    print(f"DEBUG: Extracting category from types: {types}")
    
    # Ensure types is a list
    if not types:
        print("DEBUG: No types provided, defaulting to Attractions")
        return 'Attractions'
    
    if isinstance(types, str):
        types = [types]
    
    # Define priority order - more specific types first
    priority_types = [
        # Food & Dining (highest priority for restaurants)
        'restaurant', 'cafe', 'bar', 'food', 'meal_delivery', 'meal_takeaway', 'bakery',
        # Accommodation
        'lodging', 'hotel', 'motel', 'resort',
        # Specific attractions
        'museum', 'art_gallery', 'zoo', 'aquarium',
        # Parks
        'park', 'amusement_park', 'campground', 'rv_park',
        # Shopping
        'shopping_mall', 'clothing_store', 'department_store', 'electronics_store', 
        'furniture_store', 'book_store', 'store',
        # Entertainment
        'night_club', 'casino', 'stadium', 'movie_theater', 'bowling_alley',
        # Health & Wellness
        'gym', 'spa', 'beauty_salon', 'hair_care', 'hospital', 'doctor', 'dentist', 'pharmacy',
        # Education
        'school', 'university', 'library',
        # Places of Worship
        'church', 'mosque', 'synagogue', 'hindu_temple',
        # Transportation
        'airport', 'bus_station', 'train_station', 'subway_station',
        # Services
        'parking', 'gas_station', 'car_wash', 'bank', 'atm',
        # Government
        'city_hall', 'courthouse', 'police', 'post_office',
        # Generic (lowest priority)
        'landmark', 'tourist_attraction', 'point_of_interest'
    ]
    
    category_mapping = {
        'restaurant': 'Restaurants',
        'cafe': 'Restaurants',
        'bar': 'Restaurants',
        'food': 'Restaurants',
        'meal_delivery': 'Restaurants',
        'meal_takeaway': 'Restaurants',
        'bakery': 'Restaurants',
        'museum': 'Museums',
        'art_gallery': 'Museums',
        'park': 'Parks & Recreation',
        'amusement_park': 'Parks & Recreation',
        'campground': 'Parks & Recreation',
        'rv_park': 'Parks & Recreation',
        'tourist_attraction': 'Attractions',
        'zoo': 'Attractions',
        'aquarium': 'Attractions',
        'landmark': 'Attractions',
        'point_of_interest': 'Attractions',
        'shopping_mall': 'Shopping',
        'store': 'Shopping',
        'clothing_store': 'Shopping',
        'department_store': 'Shopping',
        'electronics_store': 'Shopping',
        'furniture_store': 'Shopping',
        'book_store': 'Shopping',
        'lodging': 'Hotels',
        'hotel': 'Hotels',
        'motel': 'Hotels',
        'resort': 'Hotels',
        'night_club': 'Nightlife',
        'casino': 'Nightlife',
        'stadium': 'Sports & Entertainment',
        'movie_theater': 'Sports & Entertainment',
        'bowling_alley': 'Sports & Entertainment',
        'gym': 'Wellness',
        'spa': 'Wellness',
        'beauty_salon': 'Wellness',
        'hair_care': 'Wellness',
        'church': 'Places of Worship',
        'mosque': 'Places of Worship',
        'synagogue': 'Places of Worship',
        'hindu_temple': 'Places of Worship',
        'airport': 'Transportation',
        'bus_station': 'Transportation',
        'train_station': 'Transportation',
        'subway_station': 'Transportation',
        'parking': 'Services',
        'gas_station': 'Services',
        'car_wash': 'Services',
        'bank': 'Services',
        'atm': 'Services',
        'hospital': 'Healthcare',
        'doctor': 'Healthcare',
        'dentist': 'Healthcare',
        'pharmacy': 'Healthcare',
        'school': 'Education',
        'university': 'Education',
        'library': 'Education',
        'city_hall': 'Government',
        'courthouse': 'Government',
        'police': 'Government',
        'post_office': 'Government'
    }
    
    # Check types in priority order
    for priority_type in priority_types:
        if priority_type in types:
            category = category_mapping.get(priority_type)
            if category:
                print(f"DEBUG: Found match! Type '{priority_type}' -> Category '{category}'")
                return category
    
    # Default to Attractions if no match found
    print(f"DEBUG: No match found in types {types}, defaulting to Attractions")
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
        
        # Get ALL photo URLs
        photo_urls = []
        photo_data = result.get('photos')
        print(f"DEBUG Photo data for {result.get('name', 'Unknown')}: {photo_data}")
        
        if photo_data and isinstance(photo_data, list):
            # Get up to 10 photos
            print(f"DEBUG: Found {len(photo_data)} photos")
            for photo in photo_data[:10]:
                photo_reference = photo.get('photo_reference')
                if photo_reference:
                    photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                    photo_urls.append(photo_url)
                    print(f"DEBUG: Added photo URL with reference {photo_reference[:20]}...")
        elif photo_data and isinstance(photo_data, dict):
            photo_reference = photo_data.get('photo_reference')
            if photo_reference:
                photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                photo_urls.append(photo_url)
                print(f"DEBUG: Added single photo URL")
        
        print(f"DEBUG: Total photos added: {len(photo_urls)}")
        
        # Get place type and convert to category
        place_type = result.get('types', [])
        if isinstance(place_type, str):
            place_type = [place_type]
        
        # Format response
        place_details = {
            'id': place_id,
            'name': result.get('name', ''),
            'category': extract_category_from_types(place_type),
            'address': result.get('formatted_address', ''),
            'city_name': extract_city_from_address(result.get('formatted_address', '')),
            'image_url': photo_urls[0] if photo_urls else None,  # Keep for backward compatibility
            'photos': photo_urls,  # New field with all photos
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
    chat_groups_id = request.args.get('chat_groups_id')
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
            ce.chat_groups_id,
            g.chat_groups_name,
            ce.created_by
        FROM calendar_events ce
        LEFT JOIN `chat_groups` g ON ce.chat_groups_id = g.chat_groups_id
        WHERE ce.created_by = %s
        """
        
        params = [user_id]
        
        if chat_groups_id:
            query += " AND ce.chat_groups_id = %s"
            params.append(chat_groups_id)
        
        if start_date and end_date:
            query += " AND ce.start_date >= %s AND ce.end_date <= %s"
            params.extend([start_date, end_date])
        
        query += " ORDER BY ce.start_date ASC"
        
        cursor.execute(query, params)
        events = cursor.fetchall()
        
        # For each event with a place_id, fetch place details from Google Places
        for event in events:
            if event['place_id']:
                try:
                    # Use Google Places API to get place details
                    place_details = gmaps.place(
                        place_id=event['place_id'],
                        fields=['name', 'formatted_address', 'type']
                    )
                    
                    if place_details['status'] == 'OK':
                        place_data = place_details['result']
                        event['place_name'] = place_data.get('name', '')
                        event['place_address'] = place_data.get('formatted_address', '')
                        event['place_category'] = extract_category_from_types(
                            [place_data.get('types', [])] if isinstance(place_data.get('types'), str) 
                            else place_data.get('types', [])
                        )
                        event['city_name'] = extract_city_from_address(place_data.get('formatted_address', ''))
                except Exception as e:
                    print(f"Error fetching place details for {event['place_id']}: {e}")
                event['place_name'] = ''
                event['place_address'] = ''
                event['place_category'] = ''
                event['city_name'] = ''
        
        return jsonify(events), 200
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/calendar/events', methods=['POST'])
def create_calendar_event():
    data = request.json
    
    # Required fields
    title = data.get('title')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    created_by = data.get('created_by')
    
    # Optional fields
    description = data.get('description', '')
    location = data.get('location', '')
    place_id = data.get('place_id')  # Google Places place_id
    chat_groups_id = data.get('chat_groups_id')
    
    if not all([title, start_date, end_date, created_by]):
        return jsonify({"error": "Title, start_date, end_date, and created_by are required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        cursor.execute("""
        INSERT INTO calendar_events 
            (title, description, start_date, end_date, location, place_id, chat_groups_id, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (title, description, start_date, end_date, location, place_id, chat_groups_id, created_by))
        
        event_id = cursor.lastrowid
        conn.commit()
        
        return jsonify({
            "message": "Event created successfully",
            "event_id": event_id
        }), 201
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/calendar/events/<int:event_id>', methods=['PUT'])
def update_calendar_event(event_id):
    data = request.json
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Verify user owns this event
        cursor.execute("SELECT created_by FROM calendar_events WHERE event_id = %s", (event_id,))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Event not found"}), 404
        
        if str(result[0]) != str(user_id):
            return jsonify({"error": "Unauthorized"}), 403
        
        # Build update query dynamically
        update_fields = []
        params = []
        
        if 'title' in data:
            update_fields.append("title = %s")
            params.append(data['title'])
        
        if 'description' in data:
            update_fields.append("description = %s")
            params.append(data['description'])
        
        if 'start_date' in data:
            update_fields.append("start_date = %s")
            params.append(data['start_date'])
        
        if 'end_date' in data:
            update_fields.append("end_date = %s")
            params.append(data['end_date'])
        
        if 'location' in data:
            update_fields.append("location = %s")
            params.append(data['location'])
        
        if 'place_id' in data:
            update_fields.append("place_id = %s")
            params.append(data['place_id'])
        
        if 'chat_groups_id' in data:
            update_fields.append("chat_groups_id = %s")
            params.append(data['chat_groups_id'])
        
        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400
        
        params.append(event_id)
        query = f"UPDATE calendar_events SET {', '.join(update_fields)} WHERE event_id = %s"
        
        cursor.execute(query, params)
        conn.commit()
        
        return jsonify({"message": "Event updated successfully"}), 200
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/calendar/events/<int:event_id>', methods=['DELETE'])
def delete_calendar_event(event_id):
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Verify user owns this event
        cursor.execute("SELECT created_by FROM calendar_events WHERE event_id = %s", (event_id,))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Event not found"}), 404
        
        if str(result[0]) != str(user_id):
            return jsonify({"error": "Unauthorized"}), 403
        
        cursor.execute("DELETE FROM calendar_events WHERE event_id = %s", (event_id,))
        conn.commit()
        
        return jsonify({"message": "Event deleted successfully"}), 200
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/calendar/chat_groups/<int:user_id>', methods=['GET'])
def get_user_chat_groups(user_id):
    """Get all chat_groups that a user is part of for calendar selection"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT DISTINCT g.chat_groups_id, g.chat_groups_name
            FROM user_chat_groups ug
            JOIN `chat_groups` g ON ug.chat_groups_id = g.chat_groups_id
            WHERE ug.user_id = %s
            ORDER BY g.chat_groups_name ASC
        """, (user_id,))
        
        chat_groups = cursor.fetchall()
        return jsonify(chat_groups), 200
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Homepage/Welcome API
@app.route('/api/welcome/<int:user_id>', methods=['GET'])
def get_welcome_data(user_id):
    """Get personalized welcome data for user homepage"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get user info
        cursor.execute("""
            SELECT first_name, last_name FROM users WHERE user_id = %s
        """, (user_id,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        # Get upcoming events count
        cursor.execute("""
            SELECT COUNT(*) as count FROM calendar_events 
            WHERE created_by = %s AND start_date >= CURDATE()
        """, (user_id,))
        upcoming_events = cursor.fetchone()['count']
        
        # Get active chat_groups count
        cursor.execute("""
            SELECT COUNT(DISTINCT chat_groups_id) as count FROM user_chat_groups 
            WHERE user_id = %s
        """, (user_id,))
        active_chat_groups = cursor.fetchone()['count']
        
        # Get recent activity (latest messages and events)
        cursor.execute("""
            SELECT 'message' as type, m.messages as content, m.timestamp, g.chat_groups_name as context
            FROM messagess m
            JOIN `chat_groups` g ON m.chat_groups_id = g.chat_groups_id
            JOIN user_chat_groups ug ON g.chat_groups_id = ug.chat_groups_id
            WHERE ug.user_id = %s
            ORDER BY m.timestamp DESC
            LIMIT 5
        """, (user_id,))
        recent_activity = cursor.fetchall()
        
        welcome_data = {
            'user': user,
            'stats': {
                'upcoming_events': upcoming_events,
                'active_chat_groups': active_chat_groups
            },
            'recent_activity': recent_activity
        }
        
        return jsonify(welcome_data), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Serve React App
@app.route('/')
@app.route('/home')
@app.route('/chats')
@app.route('/chats/<path:path>')
@app.route('/calendar')
@app.route('/login')
@app.route('/register')
def react_routes(path=None):
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5000)

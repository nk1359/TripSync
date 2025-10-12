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
        
        request_id = cursor.lastrowid
        conn.commit()
        return jsonify({"message": "Friend request sent", "request_id": request_id}), 201
        
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

@app.route('/api/friend_requests_sent/<int:user_id>', methods=['GET'])
def get_friend_requests_sent(user_id):
    """Get pending friend requests sent by this user"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get pending friend requests sent by this user
        cursor.execute("""
            SELECT f.id, f.friend_id, u.first_name, u.last_name, u.username
            FROM friends f
            JOIN users u ON f.friend_id = u.user_id
            WHERE f.user_id = %s AND f.status = 'pending'
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

@app.route('/api/cancel_friend_request/<int:request_id>', methods=['POST'])
def cancel_friend_request(request_id):
    """Cancel a friend request that was sent"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Delete the friend request
        cursor.execute("DELETE FROM friends WHERE id = %s AND status = 'pending'", (request_id,))
        
        conn.commit()
        return jsonify({"message": "Friend request cancelled"}), 200

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
        return jsonify({"friends": friends}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Friend suggestions route
@app.route('/api/friend_suggestions/<int:user_id>', methods=['GET'])
def get_friend_suggestions(user_id):
    """Get suggested users who are not friends yet"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get users who are not friends and no pending requests
        cursor.execute("""
            SELECT u.user_id as id, u.first_name, u.last_name, u.username
            FROM users u
            WHERE u.user_id != %s
            AND u.user_id NOT IN (
                SELECT CASE 
                    WHEN f.user_id = %s THEN f.friend_id
                    ELSE f.user_id
                END
                FROM friends f
                WHERE (f.user_id = %s OR f.friend_id = %s)
            )
            LIMIT 10
        """, (user_id, user_id, user_id, user_id))
        
        suggestions = cursor.fetchall()
        return jsonify({"suggestions": suggestions}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Unified user search route
@app.route('/api/users', methods=['GET'])
def search_users_unified():
    """Search users by name or username"""
    search_query = request.args.get('search', '').strip()
    current_user_id = request.args.get('current_user_id')
    
    if not current_user_id:
        return jsonify({"error": "current_user_id is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        if search_query:
            # Search with query
            cursor.execute("""
                SELECT user_id as id, first_name, last_name, username,
                       CONCAT(first_name, ' ', last_name) as name
                FROM users
                WHERE (username LIKE %s OR first_name LIKE %s OR last_name LIKE %s)
                AND user_id != %s
                LIMIT 20
            """, (f'%{search_query}%', f'%{search_query}%', f'%{search_query}%', current_user_id))
        else:
            # Return empty if no search query
            return jsonify({"users": []}), 200
        
        users = cursor.fetchall()
        
        # For each user, check friendship status
        for user in users:
            # Check if already friends
            cursor.execute("""
                SELECT id, status,
                       CASE 
                           WHEN user_id = %s THEN 'sent'
                           WHEN friend_id = %s THEN 'received'
                       END as request_direction
                FROM friends 
                WHERE (user_id = %s AND friend_id = %s) 
                OR (user_id = %s AND friend_id = %s)
            """, (current_user_id, current_user_id, current_user_id, user['id'], user['id'], current_user_id))
            
            friendship = cursor.fetchone()
            
            if friendship:
                if friendship['status'] == 'accepted':
                    user['friendship_status'] = 'friends'
                elif friendship['request_direction'] == 'sent':
                    user['friendship_status'] = 'request_sent'
                elif friendship['request_direction'] == 'received':
                    user['friendship_status'] = 'request_received'
                    user['request_id'] = friendship['id']
            else:
                user['friendship_status'] = 'none'
        
        return jsonify({"users": users}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Remove friend route
@app.route('/api/remove_friend', methods=['POST'])
def remove_friend():
    """Remove a friend"""
    data = request.json
    user_id = data.get('user_id')
    friend_id = data.get('friend_id')
    
    if not user_id or not friend_id:
        return jsonify({"error": "user_id and friend_id are required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Delete the friendship (either direction)
        cursor.execute("""
            DELETE FROM friends 
            WHERE (user_id = %s AND friend_id = %s) 
            OR (user_id = %s AND friend_id = %s)
        """, (user_id, friend_id, friend_id, user_id))
        
        conn.commit()
        return jsonify({"message": "Friend removed successfully"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# ===== CHAT API ROUTES =====

@app.route('/api/chats/user/<int:user_id>', methods=['GET'])
def get_user_chats(user_id):
    """Get all chats for a user (trip-based chats they're part of)"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get all group chats for trips the user is part of
        query = """
        SELECT 
            gc.chat_id,
            gc.trip_id,
            gc.chat_name,
            t.trip_name,
            gc.created_at,
            (SELECT COUNT(*) FROM chat_participants WHERE chat_id = gc.chat_id) as member_count
        FROM group_chats gc
        JOIN trips t ON gc.trip_id = t.trip_id
        WHERE gc.chat_id IN (
            SELECT chat_id FROM chat_participants WHERE user_id = %s
        )
        ORDER BY gc.created_at DESC
        """
        cursor.execute(query, (user_id,))
        chats = cursor.fetchall()
        
        # Get last message and unread count for each chat
        for chat in chats:
            cursor.execute("""
                SELECT cm.message, cm.sent_at, u.username, u.first_name
                FROM chat_messages cm
                JOIN users u ON cm.user_id = u.user_id
                WHERE cm.chat_id = %s
                ORDER BY cm.sent_at DESC
                LIMIT 1
            """, (chat['chat_id'],))
            
            last_msg = cursor.fetchone()
            if last_msg:
                chat['last_message'] = last_msg['message']
                chat['last_message_time'] = last_msg['sent_at']
                chat['last_sender'] = last_msg['first_name']
            else:
                chat['last_message'] = None
                chat['last_message_time'] = None
                chat['last_sender'] = None
            
            # Get unread count
            cursor.execute("""
                SELECT unread_count FROM unread_messages 
                WHERE user_id = %s AND chat_id = %s AND chat_type = 'group'
            """, (user_id, chat['chat_id']))
            unread = cursor.fetchone()
            chat['unread_count'] = unread['unread_count'] if unread else 0
        
        return jsonify({"chats": chats}), 200
        
    except Exception as e:
        print(f"Error in get_user_chats: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/<int:chat_id>/messages', methods=['GET'])
def get_chat_messages(chat_id):
    """Get all messages in a chat"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is participant
        cursor.execute("""
            SELECT 1 FROM chat_participants WHERE chat_id = %s AND user_id = %s
        """, (chat_id, user_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "Access denied"}), 403
        
        # Get messages
        cursor.execute("""
            SELECT 
                cm.message_id,
                cm.message as message_content,
                cm.sent_at,
                cm.user_id as sender_id,
                u.username as sender_username,
                u.first_name as sender_first_name,
                u.last_name as sender_last_name
            FROM chat_messages cm
            JOIN users u ON cm.user_id = u.user_id
            WHERE cm.chat_id = %s
            ORDER BY cm.sent_at ASC
        """, (chat_id,))
        
        messages = cursor.fetchall()
        
        # Mark messages as read for this user
        cursor.execute("""
            DELETE FROM unread_messages 
            WHERE user_id = %s AND chat_id = %s AND chat_type = 'group'
        """, (user_id, chat_id))
        conn.commit()
        
        # Convert datetime to string
        for msg in messages:
            if msg.get('sent_at'):
                msg['sent_at'] = msg['sent_at'].isoformat() if hasattr(msg['sent_at'], 'isoformat') else str(msg['sent_at'])
        
        return jsonify({"messages": messages}), 200
        
    except Exception as e:
        print(f"Error in get_chat_messages: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/direct', methods=['POST'])
def create_direct_chat():
    """Create a direct chat between two users"""
    data = request.json
    user_id = data.get('user_id')
    friend_id = data.get('friend_id')
    
    if not user_id or not friend_id:
        return jsonify({"error": "user_id and friend_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if direct chat already exists (works regardless of which user is user1 or user2)
        cursor.execute("""
            SELECT chat_id 
            FROM direct_chats 
            WHERE (user1_id = %s AND user2_id = %s) 
               OR (user1_id = %s AND user2_id = %s)
            LIMIT 1
        """, (user_id, friend_id, friend_id, user_id))
        
        existing_chat = cursor.fetchone()
        
        if existing_chat:
            # Get friend's name for response
            cursor.execute("SELECT first_name, last_name FROM users WHERE user_id = %s", (friend_id,))
            friend = cursor.fetchone()
            chat_name = f"{friend['first_name']} {friend['last_name']}"
            
            return jsonify({
                "chat_id": existing_chat['chat_id'],
                "chat_name": chat_name,
                "existed": True
            }), 200
        
        # Get friend's name
        cursor.execute("SELECT first_name, last_name FROM users WHERE user_id = %s", (friend_id,))
        friend = cursor.fetchone()
        
        # Create new direct chat (LEAST/GREATEST ensures consistent ordering)
        cursor.execute("""
            INSERT INTO direct_chats (user1_id, user2_id)
            VALUES (LEAST(%s, %s), GREATEST(%s, %s))
        """, (user_id, friend_id, user_id, friend_id))
        chat_id = cursor.lastrowid
        
        conn.commit()
        
        chat_name = f"{friend['first_name']} {friend['last_name']}"
        
        return jsonify({
            "chat_id": chat_id,
            "chat_name": chat_name,
            "existed": False,
            "is_direct": True
        }), 201
        
    except Exception as e:
        print(f"Error creating direct chat: {e}")
        print(f"User ID: {user_id}, Friend ID: {friend_id}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/direct/user/<int:user_id>', methods=['GET'])
def get_user_direct_chats(user_id):
    """Get all direct chats for a user"""
    include_archived = request.args.get('include_archived', 'false').lower() == 'true'
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Determine which archive column to check
        query = """
        SELECT 
            dc.chat_id,
            dc.user1_id,
            dc.user2_id,
            dc.last_message_at,
            dc.created_at,
            CASE 
                WHEN dc.user1_id = %s THEN dc.archived_by_user1
                ELSE dc.archived_by_user2
            END as is_archived
        FROM direct_chats dc
        WHERE (dc.user1_id = %s OR dc.user2_id = %s)
        """
        
        if not include_archived:
            query += """
            AND ((dc.user1_id = %s AND dc.archived_by_user1 = FALSE) 
                 OR (dc.user2_id = %s AND dc.archived_by_user2 = FALSE))
            """
            cursor.execute(query, (user_id, user_id, user_id, user_id, user_id))
        else:
            cursor.execute(query, (user_id, user_id, user_id))
        
        direct_chats = cursor.fetchall()
        
        # Get chat names and last messages
        for chat in direct_chats:
            other_user_id = chat['user2_id'] if chat['user1_id'] == user_id else chat['user1_id']
            
            # Get other user's name
            cursor.execute("SELECT first_name, last_name FROM users WHERE user_id = %s", (other_user_id,))
            other_user = cursor.fetchone()
            chat['chat_name'] = f"{other_user['first_name']} {other_user['last_name']}" if other_user else 'User'
            
            # Get last message
            cursor.execute("""
                SELECT message_content, sent_at 
                FROM direct_messages 
                WHERE chat_id = %s 
                ORDER BY sent_at DESC 
                LIMIT 1
            """, (chat['chat_id'],))
            last_msg = cursor.fetchone()
            if last_msg:
                chat['last_message'] = last_msg['message_content'][:50] + ('...' if len(last_msg['message_content']) > 50 else '')
                chat['last_message_time'] = last_msg['sent_at']
            
            # Get unread count
            cursor.execute("""
                SELECT unread_count FROM unread_messages 
                WHERE user_id = %s AND chat_id = %s AND chat_type = 'direct'
            """, (user_id, chat['chat_id']))
            unread = cursor.fetchone()
            chat['unread_count'] = unread['unread_count'] if unread else 0
        
        return jsonify({"chats": direct_chats}), 200
        
    except Exception as e:
        print(f"Error fetching direct chats: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/direct/<int:chat_id>/archive', methods=['POST'])
def archive_direct_chat(chat_id):
    """Archive a direct chat for a user"""
    data = request.json
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get the chat
        cursor.execute("""
            SELECT user1_id, user2_id FROM direct_chats WHERE chat_id = %s
        """, (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            return jsonify({"error": "Chat not found"}), 404
        
        # Archive for the correct user
        if chat['user1_id'] == user_id:
            cursor.execute("UPDATE direct_chats SET archived_by_user1 = TRUE WHERE chat_id = %s", (chat_id,))
        elif chat['user2_id'] == user_id:
            cursor.execute("UPDATE direct_chats SET archived_by_user2 = TRUE WHERE chat_id = %s", (chat_id,))
        else:
            return jsonify({"error": "Access denied"}), 403
        
        conn.commit()
        return jsonify({"success": True}), 200
        
    except Exception as e:
        print(f"Error archiving chat: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/direct/<int:chat_id>/messages', methods=['GET'])
def get_direct_messages(chat_id):
    """Get messages from a direct chat"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is part of this direct chat
        cursor.execute("""
            SELECT 1 FROM direct_chats 
            WHERE chat_id = %s AND (user1_id = %s OR user2_id = %s)
        """, (chat_id, user_id, user_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "Access denied"}), 403
        
        # Get messages
        cursor.execute("""
            SELECT 
                dm.message_id,
                dm.sender_id,
                dm.message_content,
                dm.sent_at,
                u.username as sender_username,
                u.first_name as sender_first_name,
                u.last_name as sender_last_name
            FROM direct_messages dm
            JOIN users u ON dm.sender_id = u.user_id
            WHERE dm.chat_id = %s
            ORDER BY dm.sent_at ASC
        """, (chat_id,))
        
        messages = cursor.fetchall()
        
        # Mark messages as read for this user
        cursor.execute("""
            DELETE FROM unread_messages 
            WHERE user_id = %s AND chat_id = %s AND chat_type = 'direct'
        """, (user_id, chat_id))
        conn.commit()
        
        # Convert datetime to string
        for msg in messages:
            if msg.get('sent_at'):
                msg['sent_at'] = msg['sent_at'].isoformat()
        
        return jsonify({"messages": messages}), 200
        
    except Exception as e:
        print(f"Error fetching direct messages: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/direct/<int:chat_id>/messages', methods=['POST'])
def send_direct_message(chat_id):
    """Send a message in a direct chat"""
    data = request.json
    sender_id = data.get('sender_id') or data.get('user_id')
    message_content = data.get('message_content', '').strip()
    
    if not sender_id or not message_content:
        return jsonify({"error": "sender_id and message_content required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is part of this direct chat
        cursor.execute("""
            SELECT 1 FROM direct_chats 
            WHERE chat_id = %s AND (user1_id = %s OR user2_id = %s)
        """, (chat_id, sender_id, sender_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "Access denied"}), 403
        
        # Insert message
        cursor.execute("""
            INSERT INTO direct_messages (chat_id, sender_id, message_content)
            VALUES (%s, %s, %s)
        """, (chat_id, sender_id, message_content))
        
        message_id = cursor.lastrowid
        
        # Update last_message_at in direct_chats
        cursor.execute("""
            UPDATE direct_chats 
            SET last_message_at = NOW(),
                archived_by_user1 = FALSE,
                archived_by_user2 = FALSE
            WHERE chat_id = %s
        """, (chat_id,))
        
        # Get the other user in this chat
        cursor.execute("""
            SELECT user1_id, user2_id FROM direct_chats WHERE chat_id = %s
        """, (chat_id,))
        chat_users = cursor.fetchone()
        other_user_id = chat_users['user2_id'] if chat_users['user1_id'] == sender_id else chat_users['user1_id']
        
        # Update unread count for the other user
        cursor.execute("""
            INSERT INTO unread_messages (user_id, chat_id, chat_type, unread_count, last_message_at)
            VALUES (%s, %s, 'direct', 1, NOW())
            ON DUPLICATE KEY UPDATE 
                unread_count = unread_count + 1,
                last_message_at = NOW()
        """, (other_user_id, chat_id))
        
        conn.commit()
        
        # Get the created message with user details
        cursor.execute("""
            SELECT 
                dm.message_id,
                dm.sender_id,
                dm.message_content,
                dm.sent_at,
                u.username as sender_username,
                u.first_name as sender_first_name,
                u.last_name as sender_last_name
            FROM direct_messages dm
            JOIN users u ON dm.sender_id = u.user_id
            WHERE dm.message_id = %s
        """, (message_id,))
        
        new_message = cursor.fetchone()
        
        if new_message.get('sent_at'):
            new_message['sent_at'] = new_message['sent_at'].isoformat()
        
        return jsonify({
            "success": True,
            "message": new_message
        }), 201
        
    except Exception as e:
        print(f"Error sending direct message: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/<int:chat_id>/messages', methods=['POST'])
def send_chat_message(chat_id):
    """Send a message in a group chat"""
    data = request.json
    sender_id = data.get('sender_id') or data.get('user_id')
    message_content = data.get('message_content') or data.get('message', '').strip()
    
    if not sender_id or not message_content:
        return jsonify({"error": "sender_id and message_content required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is participant
        cursor.execute("""
            SELECT 1 FROM chat_participants WHERE chat_id = %s AND user_id = %s
        """, (chat_id, sender_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "Access denied"}), 403
        
        # Insert message
        cursor.execute("""
            INSERT INTO chat_messages (chat_id, user_id, message)
            VALUES (%s, %s, %s)
        """, (chat_id, sender_id, message_content))
        
        message_id = cursor.lastrowid
        
        # Get all participants in this chat (except sender)
        cursor.execute("""
            SELECT user_id FROM chat_participants 
            WHERE chat_id = %s AND user_id != %s
        """, (chat_id, sender_id))
        participants = cursor.fetchall()
        
        # Update unread count for all other participants
        for participant in participants:
            cursor.execute("""
                INSERT INTO unread_messages (user_id, chat_id, chat_type, unread_count, last_message_at)
                VALUES (%s, %s, 'group', 1, NOW())
                ON DUPLICATE KEY UPDATE 
                    unread_count = unread_count + 1,
                    last_message_at = NOW()
            """, (participant['user_id'], chat_id))
        
        conn.commit()
        
        # Get the created message with user details
        cursor.execute("""
            SELECT 
                cm.message_id,
                cm.message as message_content,
                cm.sent_at,
                cm.user_id as sender_id,
                u.username as sender_username,
                u.first_name as sender_first_name,
                u.last_name as sender_last_name
            FROM chat_messages cm
            JOIN users u ON cm.user_id = u.user_id
            WHERE cm.message_id = %s
        """, (message_id,))
        
        new_message = cursor.fetchone()
        
        # Convert datetime to string
        if new_message.get('sent_at'):
            new_message['sent_at'] = new_message['sent_at'].isoformat() if hasattr(new_message['sent_at'], 'isoformat') else str(new_message['sent_at'])
        
        return jsonify({"message": new_message, "success": True}), 201
        
    except Exception as e:
        print(f"Error in send_chat_message: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
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
    """Search for places using Google Places API with pagination support via next_page_token"""
    if not gmaps:
        return jsonify({"error": "Google Places API is not configured"}), 500
    
    # Get query parameters
    place_type = request.args.get('place_type', '')
    category = request.args.get('categories', '')
    city = request.args.get('city', '')
    state = request.args.get('state', '')
    country = request.args.get('country', 'USA')
    page_token = request.args.get('page_token', None)  # Get next_page_token from frontend
    
    # Build location string
    location_parts = [part for part in [city, state, country] if part]
    location = ', '.join(location_parts) if location_parts else None
    
    if not location and not place_type and not page_token:
        return jsonify({"error": "Either location or place_type is required"}), 400
    
    try:
        # If we have a page_token, use it to get the next page
        if page_token:
            print(f"🔄 Fetching next page using token: {page_token[:30]}...")
            try:
                # When using page_token, we don't need to pass query parameter
                results = gmaps.places(query='', page_token=page_token)
                print(f"✅ Successfully fetched next page")
            except Exception as token_error:
                print(f"❌ Error using page token: {str(token_error)}")
                return jsonify({"error": f"Failed to fetch next page: {str(token_error)}"}), 500
        else:
            # Build search query
            search_query = f"{place_type} and {category}" if place_type and category else (place_type or category)
            
            # If we have a location, add it to the query
            if location:
                search_query = f"{search_query} in {location}"
            
            print(f"🔍 Searching for: {search_query}")
            
            # Perform text search
            results = gmaps.places(query=search_query)
        
        print(f"📍 Processing {len(results.get('results', []))} search results")
        
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
        
        # Get next_page_token for loading more results
        next_page_token = results.get('next_page_token')
        
        print(f"✅ Returning {len(formatted_places)} places, next_page_token: {'Yes' if next_page_token else 'No'}")
        
        return jsonify({
            'places': formatted_places,
            'total': len(formatted_places),
            'next_page_token': next_page_token,
            'has_more': next_page_token is not None
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
@app.route('/planner')
@app.route('/login')
@app.route('/register')
def react_routes(path=None):
    return send_from_directory(app.static_folder, 'index.html')

# Trip management routes
@app.route('/api/trips/<int:user_id>', methods=['GET'])
def get_user_trips(user_id):
    """Get all trips for a user"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get trips where user is a participant
        query = """
        SELECT DISTINCT 
            t.*, 
            tp.role,
            (SELECT COUNT(*) FROM trip_participants WHERE trip_id = t.trip_id) as member_count
        FROM trips t
        JOIN trip_participants tp ON t.trip_id = tp.trip_id
        WHERE tp.user_id = %s
        ORDER BY t.created_at DESC
        """
        cursor.execute(query, (user_id,))
        trips = cursor.fetchall()
        
        return jsonify({"trips": trips})
        
    except Exception as e:
        print(f"Database error in get_user_trips: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/trips', methods=['POST'])
def create_trip():
    """Create a new trip"""
    data = request.json
    trip_name = data.get('trip_name')
    description = data.get('description')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    created_by = data.get('created_by')
    member_ids = data.get('member_ids', [])  # List of friend user_ids to add to the trip
    
    if not all([trip_name, start_date, end_date, created_by]):
        return jsonify({"error": "Missing required fields"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Create trip
        trip_query = """
        INSERT INTO trips (trip_name, description, start_date, end_date, created_by)
        VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(trip_query, (trip_name, description, start_date, end_date, created_by))
        trip_id = cursor.lastrowid
        
        # Add creator as trip participant
        participant_query = """
        INSERT INTO trip_participants (trip_id, user_id, role)
        VALUES (%s, %s, 'owner')
        """
        cursor.execute(participant_query, (trip_id, created_by))
        
        # Add invited friends as trip participants
        for member_id in member_ids:
            cursor.execute(participant_query.replace("'owner'", "'member'"), (trip_id, member_id))
        
        # Create group chat for the trip
        chat_query = """
        INSERT INTO group_chats (trip_id, chat_name)
        VALUES (%s, %s)
        """
        cursor.execute(chat_query, (trip_id, f"{trip_name} Chat"))
        chat_id = cursor.lastrowid
        
        # Add creator to group chat
        chat_participant_query = """
        INSERT INTO chat_participants (chat_id, user_id)
        VALUES (%s, %s)
        """
        cursor.execute(chat_participant_query, (chat_id, created_by))
        
        # Add invited friends to group chat
        for member_id in member_ids:
            cursor.execute(chat_participant_query, (chat_id, member_id))
        
        conn.commit()
        
        return jsonify({
            "success": True,
            "trip_id": trip_id,
            "chat_id": chat_id,
            "message": "Trip created successfully"
        }), 201
        
    except Exception as e:
        print(f"Database error in create_trip: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/trips/<int:trip_id>/members', methods=['GET'])
def get_trip_members(trip_id):
    """Get all members of a trip"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            u.user_id,
            u.username,
            u.first_name,
            u.last_name,
            tp.role
        FROM trip_participants tp
        JOIN users u ON tp.user_id = u.user_id
        WHERE tp.trip_id = %s
        ORDER BY 
            CASE tp.role
                WHEN 'owner' THEN 1
                WHEN 'admin' THEN 2
                ELSE 3
            END,
            u.first_name
        """
        cursor.execute(query, (trip_id,))
        members = cursor.fetchall()
        
        return jsonify({"members": members}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/members', methods=['POST'])
def add_trip_member(trip_id):
    """Add a member to a trip (owner/admin only)"""
    data = request.json
    user_id = data.get('user_id')  # Person adding the member
    member_id = data.get('member_id')  # Person being added
    
    if not user_id or not member_id:
        return jsonify({"error": "user_id and member_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        user_role = cursor.fetchone()
        if not user_role or user_role['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only owners and admins can add members"}), 403
        
        # Check if member is already in the trip
        cursor.execute("""
            SELECT 1 FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, member_id))
        
        if cursor.fetchone():
            return jsonify({"error": "User is already a member of this trip"}), 400
        
        # Add member to trip
        cursor.execute("""
            INSERT INTO trip_participants (trip_id, user_id, role)
            VALUES (%s, %s, 'member')
        """, (trip_id, member_id))
        
        # Add member to trip's group chat
        cursor.execute("""
            SELECT chat_id FROM group_chats WHERE trip_id = %s
        """, (trip_id,))
        
        chat = cursor.fetchone()
        if chat:
            cursor.execute("""
                INSERT INTO chat_participants (chat_id, user_id)
                VALUES (%s, %s)
            """, (chat['chat_id'], member_id))
        
        # Create notification for the added member
        cursor.execute("""
            INSERT INTO trip_notifications (user_id, trip_id, added_by_user_id)
            VALUES (%s, %s, %s)
        """, (member_id, trip_id, user_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Member added successfully"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/members/<int:member_id>', methods=['DELETE'])
def remove_trip_member(trip_id, member_id):
    """Remove a member from a trip (owner/admin only, cannot remove owner)"""
    data = request.json
    user_id = data.get('user_id')  # Person removing the member
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        user_role = cursor.fetchone()
        if not user_role or user_role['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only owners and admins can remove members"}), 403
        
        # Check if member being removed is the owner
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, member_id))
        
        member_role = cursor.fetchone()
        if member_role and member_role['role'] == 'owner':
            return jsonify({"error": "Cannot remove the trip owner"}), 400
        
        # Remove member from trip
        cursor.execute("""
            DELETE FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, member_id))
        
        # Remove member from trip's group chat
        cursor.execute("""
            SELECT chat_id FROM group_chats WHERE trip_id = %s
        """, (trip_id,))
        
        chat = cursor.fetchone()
        if chat:
            cursor.execute("""
                DELETE FROM chat_participants
                WHERE chat_id = %s AND user_id = %s
            """, (chat['chat_id'], member_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Member removed successfully"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# ===== TRIP MEMBER REQUEST ROUTES =====

@app.route('/api/trips/<int:trip_id>/member-requests', methods=['POST'])
def request_add_trip_member(trip_id):
    """Request to add a friend to a trip (any member can request)"""
    data = request.json
    requester_id = data.get('requester_id')  # Person making the request
    friend_id = data.get('friend_id')  # Person to be added
    
    if not requester_id or not friend_id:
        return jsonify({"error": "requester_id and friend_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if requester is a member of the trip
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, requester_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "You must be a trip member to request additions"}), 403
        
        # Check if friend is already in the trip
        cursor.execute("""
            SELECT 1 FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, friend_id))
        
        if cursor.fetchone():
            return jsonify({"error": "User is already a member of this trip"}), 400
        
        # Check if request already exists
        cursor.execute("""
            SELECT id FROM trip_member_requests
            WHERE trip_id = %s AND friend_id = %s AND status = 'pending'
        """, (trip_id, friend_id))
        
        if cursor.fetchone():
            return jsonify({"error": "A pending request already exists for this user"}), 400
        
        # Check if requester is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, requester_id))
        
        requester_role = cursor.fetchone()
        is_owner_or_admin = requester_role and requester_role['role'] in ['owner', 'admin']
        
        # Create the request
        # If requester is owner/admin, auto-approve owner side
        cursor.execute("""
            INSERT INTO trip_member_requests (trip_id, requester_id, friend_id, status, owner_approved, friend_accepted)
            VALUES (%s, %s, %s, 'pending', %s, FALSE)
        """, (trip_id, requester_id, friend_id, is_owner_or_admin))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request sent to trip owner"}), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/member-requests', methods=['GET'])
def get_trip_member_requests(trip_id):
    """Get all pending member requests for a trip (requests from non-owners that need owner approval)"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        user_role = cursor.fetchone()
        if not user_role or user_role['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only owners and admins can view requests"}), 403
        
        # Get pending requests ONLY from non-owners/non-admins (actual requests needing approval)
        # Invitations sent by owners/admins go to the friend, not shown here
        cursor.execute("""
            SELECT 
                tmr.id as request_id,
                tmr.requester_id,
                tmr.friend_id,
                tmr.created_at,
                u1.first_name as requester_first_name,
                u1.last_name as requester_last_name,
                u1.username as requester_username,
                u2.first_name as friend_first_name,
                u2.last_name as friend_last_name,
                u2.username as friend_username,
                tp.role as requester_role
            FROM trip_member_requests tmr
            JOIN users u1 ON tmr.requester_id = u1.user_id
            JOIN users u2 ON tmr.friend_id = u2.user_id
            LEFT JOIN trip_participants tp ON tmr.trip_id = tp.trip_id AND tmr.requester_id = tp.user_id
            WHERE tmr.trip_id = %s 
              AND tmr.status = 'pending'
              AND (tp.role IS NULL OR tp.role NOT IN ('owner', 'admin'))
            ORDER BY tmr.created_at DESC
        """, (trip_id,))
        
        requests = cursor.fetchall()
        
        return jsonify({"requests": requests}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/sent-invitations', methods=['GET'])
def get_sent_invitations(trip_id):
    """Get all pending invitations sent by owners/admins for this trip"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is a member of the trip
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "You must be a trip member to view invitations"}), 403
        
        # Get pending invitations sent by owners/admins (these are pending friend acceptances)
        cursor.execute("""
            SELECT 
                tmr.id as invitation_id,
                tmr.requester_id,
                tmr.friend_id,
                tmr.created_at,
                u.first_name,
                u.last_name,
                u.username,
                tp.role as requester_role
            FROM trip_member_requests tmr
            JOIN users u ON tmr.friend_id = u.user_id
            LEFT JOIN trip_participants tp ON tmr.trip_id = tp.trip_id AND tmr.requester_id = tp.user_id
            WHERE tmr.trip_id = %s 
              AND tmr.status = 'pending'
              AND tp.role IN ('owner', 'admin')
            ORDER BY tmr.created_at DESC
        """, (trip_id,))
        
        invitations = cursor.fetchall()
        
        return jsonify({"invitations": invitations}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/my-requests', methods=['GET'])
def get_my_trip_requests(trip_id):
    """Get pending requests that I (the current user) have made for this trip"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is a member of the trip
        cursor.execute("""
            SELECT 1 FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "You must be a trip member to view your requests"}), 403
        
        # Get pending requests made by this user
        cursor.execute("""
            SELECT 
                tmr.id as request_id,
                tmr.friend_id,
                tmr.created_at,
                tmr.owner_approved,
                tmr.friend_accepted,
                u.first_name,
                u.last_name,
                u.username
            FROM trip_member_requests tmr
            JOIN users u ON tmr.friend_id = u.user_id
            WHERE tmr.trip_id = %s 
              AND tmr.requester_id = %s
              AND tmr.status = 'pending'
            ORDER BY tmr.created_at DESC
        """, (trip_id, user_id))
        
        requests = cursor.fetchall()
        
        return jsonify({"requests": requests}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/member-requests/<int:request_id>/approve', methods=['POST'])
def approve_trip_member_request(trip_id, request_id):
    """Approve a member addition request (owner/admin only)"""
    data = request.json
    user_id = data.get('user_id')  # Person approving
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        user_role = cursor.fetchone()
        if not user_role or user_role['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only owners and admins can approve requests"}), 403
        
        # Get request details
        cursor.execute("""
            SELECT friend_id FROM trip_member_requests
            WHERE id = %s AND trip_id = %s AND status = 'pending'
        """, (request_id, trip_id))
        
        request_data = cursor.fetchone()
        if not request_data:
            return jsonify({"error": "Request not found or already processed"}), 404
        
        friend_id = request_data['friend_id']
        
        # Mark as owner approved
        cursor.execute("""
            UPDATE trip_member_requests
            SET owner_approved = TRUE, approved_by = %s, updated_at = NOW()
            WHERE id = %s
        """, (user_id, request_id))
        
        # Check if friend has also accepted
        cursor.execute("""
            SELECT friend_accepted FROM trip_member_requests
            WHERE id = %s
        """, (request_id,))
        
        request_status = cursor.fetchone()
        
        # If both have approved, add member to trip
        if request_status and request_status['friend_accepted']:
            # Add member to trip
            cursor.execute("""
                INSERT INTO trip_participants (trip_id, user_id, role)
                VALUES (%s, %s, 'member')
            """, (trip_id, friend_id))
            
            # Add member to trip's group chat
            cursor.execute("""
                SELECT chat_id FROM group_chats WHERE trip_id = %s
            """, (trip_id,))
            
            chat = cursor.fetchone()
            if chat:
                cursor.execute("""
                    INSERT INTO chat_participants (chat_id, user_id)
                    VALUES (%s, %s)
                """, (chat['chat_id'], friend_id))
            
            # Update request status to approved
            cursor.execute("""
                UPDATE trip_member_requests
                SET status = 'approved'
                WHERE id = %s
            """, (request_id,))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request approved and member added"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/member-requests/<int:request_id>/reject', methods=['POST'])
def reject_trip_member_request(trip_id, request_id):
    """Reject a member addition request (owner/admin only)"""
    data = request.json
    user_id = data.get('user_id')  # Person rejecting
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        user_role = cursor.fetchone()
        if not user_role or user_role['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only owners and admins can reject requests"}), 403
        
        # Update request status
        cursor.execute("""
            UPDATE trip_member_requests
            SET status = 'rejected', approved_by = %s, updated_at = NOW()
            WHERE id = %s AND trip_id = %s AND status = 'pending'
        """, (user_id, request_id, trip_id))
        
        if cursor.rowcount == 0:
            return jsonify({"error": "Request not found or already processed"}), 404
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request rejected"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# ===== TRIP INVITATION ROUTES (for invited friends to accept/decline) =====

@app.route('/api/users/<int:user_id>/trip-invitations', methods=['GET'])
def get_user_trip_invitations(user_id):
    """Get all pending trip invitations for a user"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get invitations where this user is the friend_id (invited person)
        cursor.execute("""
            SELECT 
                tmr.id as invitation_id,
                tmr.trip_id,
                tmr.requester_id,
                tmr.created_at,
                t.trip_name,
                t.description,
                t.start_date,
                t.end_date,
                u.first_name as inviter_first_name,
                u.last_name as inviter_last_name,
                u.username as inviter_username
            FROM trip_member_requests tmr
            JOIN trips t ON tmr.trip_id = t.trip_id
            JOIN users u ON tmr.requester_id = u.user_id
            WHERE tmr.friend_id = %s AND tmr.status = 'pending'
            ORDER BY tmr.created_at DESC
        """, (user_id,))
        
        invitations = cursor.fetchall()
        
        return jsonify({"invitations": invitations}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trip-invitations/<int:invitation_id>/accept', methods=['POST'])
def accept_trip_invitation(invitation_id):
    """Accept a trip invitation (invited friend accepts)"""
    data = request.json
    user_id = data.get('user_id')  # Person accepting (should be friend_id)
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get invitation details and verify user is the invited person
        cursor.execute("""
            SELECT trip_id, friend_id FROM trip_member_requests
            WHERE id = %s AND status = 'pending'
        """, (invitation_id,))
        
        invitation = cursor.fetchone()
        if not invitation:
            return jsonify({"error": "Invitation not found or already processed"}), 404
        
        if invitation['friend_id'] != user_id:
            return jsonify({"error": "You are not authorized to accept this invitation"}), 403
        
        trip_id = invitation['trip_id']
        
        # Mark as friend accepted
        cursor.execute("""
            UPDATE trip_member_requests
            SET friend_accepted = TRUE, updated_at = NOW()
            WHERE id = %s
        """, (invitation_id,))
        
        # Check if owner has also approved
        cursor.execute("""
            SELECT owner_approved FROM trip_member_requests
            WHERE id = %s
        """, (invitation_id,))
        
        request_status = cursor.fetchone()
        
        # If both have approved, add member to trip
        if request_status and request_status['owner_approved']:
            # Add user to trip
            cursor.execute("""
                INSERT INTO trip_participants (trip_id, user_id, role)
                VALUES (%s, %s, 'member')
            """, (trip_id, user_id))
            
            # Add user to trip's group chat
            cursor.execute("""
                SELECT chat_id FROM group_chats WHERE trip_id = %s
            """, (trip_id,))
            
            chat = cursor.fetchone()
            if chat:
                cursor.execute("""
                    INSERT INTO chat_participants (chat_id, user_id)
                    VALUES (%s, %s)
                """, (chat['chat_id'], user_id))
            
            # Update invitation status to approved
            cursor.execute("""
                UPDATE trip_member_requests
                SET status = 'approved', approved_by = %s
                WHERE id = %s
            """, (user_id, invitation_id))
        
        conn.commit()
        
        # Return appropriate message
        if request_status and request_status['owner_approved']:
            return jsonify({"success": True, "message": "Invitation accepted! You've been added to the trip.", "added": True}), 200
        else:
            return jsonify({"success": True, "message": "Invitation accepted! Waiting for trip owner approval.", "added": False}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trip-invitations/<int:invitation_id>/decline', methods=['POST'])
def decline_trip_invitation(invitation_id):
    """Decline a trip invitation (invited friend declines)"""
    data = request.json
    user_id = data.get('user_id')  # Person declining (should be friend_id)
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is the invited person
        cursor.execute("""
            SELECT friend_id FROM trip_member_requests
            WHERE id = %s AND status = 'pending'
        """, (invitation_id,))
        
        invitation = cursor.fetchone()
        if not invitation:
            return jsonify({"error": "Invitation not found or already processed"}), 404
        
        if invitation['friend_id'] != user_id:
            return jsonify({"error": "You are not authorized to decline this invitation"}), 403
        
        # Update invitation status
        cursor.execute("""
            UPDATE trip_member_requests
            SET status = 'rejected', approved_by = %s, updated_at = NOW()
            WHERE id = %s
        """, (user_id, invitation_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Invitation declined"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# ===== CHAT MEMBER REQUEST ROUTES =====

@app.route('/api/chats/<int:chat_id>/member-requests', methods=['POST'])
def request_add_chat_member(chat_id):
    """Request to add a friend to a chat (any chat participant can request, owner must approve)"""
    data = request.json
    requester_id = data.get('requester_id')  # Person making the request
    friend_id = data.get('friend_id')  # Person to be added
    
    if not requester_id or not friend_id:
        return jsonify({"error": "requester_id and friend_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if requester is a participant of the chat
        cursor.execute("""
            SELECT 1 FROM chat_participants
            WHERE chat_id = %s AND user_id = %s
        """, (chat_id, requester_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "You must be a chat participant to request additions"}), 403
        
        # Check if friend is already in the chat
        cursor.execute("""
            SELECT 1 FROM chat_participants
            WHERE chat_id = %s AND user_id = %s
        """, (chat_id, friend_id))
        
        if cursor.fetchone():
            return jsonify({"error": "User is already a member of this chat"}), 400
        
        # Check if request already exists
        cursor.execute("""
            SELECT id FROM chat_member_requests
            WHERE chat_id = %s AND friend_id = %s AND status = 'pending'
        """, (chat_id, friend_id))
        
        if cursor.fetchone():
            return jsonify({"error": "A pending request already exists for this user"}), 400
        
        # Create the request
        cursor.execute("""
            INSERT INTO chat_member_requests (chat_id, requester_id, friend_id, status)
            VALUES (%s, %s, %s, 'pending')
        """, (chat_id, requester_id, friend_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request sent to chat owner"}), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/chats/<int:chat_id>/member-requests', methods=['GET'])
def get_chat_member_requests(chat_id):
    """Get all pending member requests for a chat (owner/admin only for trip chats)"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get chat details to check if it's a trip chat
        cursor.execute("""
            SELECT trip_id FROM group_chats WHERE chat_id = %s
        """, (chat_id,))
        
        chat_info = cursor.fetchone()
        
        # If it's a trip chat, check if user is owner or admin
        if chat_info and chat_info['trip_id']:
            cursor.execute("""
                SELECT role FROM trip_participants
                WHERE trip_id = %s AND user_id = %s
            """, (chat_info['trip_id'], user_id))
            
            user_role = cursor.fetchone()
            if not user_role or user_role['role'] not in ['owner', 'admin']:
                return jsonify({"error": "Only trip owners and admins can view requests"}), 403
        else:
            # For non-trip chats, any participant can view
            cursor.execute("""
                SELECT 1 FROM chat_participants
                WHERE chat_id = %s AND user_id = %s
            """, (chat_id, user_id))
            
            if not cursor.fetchone():
                return jsonify({"error": "You must be a chat participant to view requests"}), 403
        
        # Get all pending requests
        cursor.execute("""
            SELECT 
                cmr.id as request_id,
                cmr.requester_id,
                cmr.friend_id,
                cmr.created_at,
                u1.first_name as requester_first_name,
                u1.last_name as requester_last_name,
                u1.username as requester_username,
                u2.first_name as friend_first_name,
                u2.last_name as friend_last_name,
                u2.username as friend_username
            FROM chat_member_requests cmr
            JOIN users u1 ON cmr.requester_id = u1.user_id
            JOIN users u2 ON cmr.friend_id = u2.user_id
            WHERE cmr.chat_id = %s AND cmr.status = 'pending'
            ORDER BY cmr.created_at DESC
        """, (chat_id,))
        
        requests = cursor.fetchall()
        
        return jsonify({"requests": requests}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/chats/<int:chat_id>/member-requests/<int:request_id>/approve', methods=['POST'])
def approve_chat_member_request(chat_id, request_id):
    """Approve a chat member addition request (owner/admin only for trip chats)"""
    data = request.json
    user_id = data.get('user_id')  # Person approving
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get chat details to check if it's a trip chat
        cursor.execute("""
            SELECT trip_id FROM group_chats WHERE chat_id = %s
        """, (chat_id,))
        
        chat_info = cursor.fetchone()
        
        # If it's a trip chat, check if user is owner or admin
        if chat_info and chat_info['trip_id']:
            cursor.execute("""
                SELECT role FROM trip_participants
                WHERE trip_id = %s AND user_id = %s
            """, (chat_info['trip_id'], user_id))
            
            user_role = cursor.fetchone()
            if not user_role or user_role['role'] not in ['owner', 'admin']:
                return jsonify({"error": "Only trip owners and admins can approve requests"}), 403
        
        # Get request details
        cursor.execute("""
            SELECT friend_id FROM chat_member_requests
            WHERE id = %s AND chat_id = %s AND status = 'pending'
        """, (request_id, chat_id))
        
        request_data = cursor.fetchone()
        if not request_data:
            return jsonify({"error": "Request not found or already processed"}), 404
        
        friend_id = request_data['friend_id']
        
        # Add member to chat
        cursor.execute("""
            INSERT INTO chat_participants (chat_id, user_id)
            VALUES (%s, %s)
        """, (chat_id, friend_id))
        
        # If this is a trip chat, also add to trip
        if chat_info and chat_info['trip_id']:
            # Check if already in trip
            cursor.execute("""
                SELECT 1 FROM trip_participants
                WHERE trip_id = %s AND user_id = %s
            """, (chat_info['trip_id'], friend_id))
            
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO trip_participants (trip_id, user_id, role)
                    VALUES (%s, %s, 'member')
                """, (chat_info['trip_id'], friend_id))
        
        # Update request status
        cursor.execute("""
            UPDATE chat_member_requests
            SET status = 'approved', approved_by = %s, updated_at = NOW()
            WHERE id = %s
        """, (user_id, request_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request approved and member added"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/chats/<int:chat_id>/member-requests/<int:request_id>/reject', methods=['POST'])
def reject_chat_member_request(chat_id, request_id):
    """Reject a chat member addition request (owner/admin only for trip chats)"""
    data = request.json
    user_id = data.get('user_id')  # Person rejecting
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get chat details to check if it's a trip chat
        cursor.execute("""
            SELECT trip_id FROM group_chats WHERE chat_id = %s
        """, (chat_id,))
        
        chat_info = cursor.fetchone()
        
        # If it's a trip chat, check if user is owner or admin
        if chat_info and chat_info['trip_id']:
            cursor.execute("""
                SELECT role FROM trip_participants
                WHERE trip_id = %s AND user_id = %s
            """, (chat_info['trip_id'], user_id))
            
            user_role = cursor.fetchone()
            if not user_role or user_role['role'] not in ['owner', 'admin']:
                return jsonify({"error": "Only trip owners and admins can reject requests"}), 403
        
        # Update request status
        cursor.execute("""
            UPDATE chat_member_requests
            SET status = 'rejected', approved_by = %s, updated_at = NOW()
            WHERE id = %s AND chat_id = %s AND status = 'pending'
        """, (user_id, request_id, chat_id))
        
        if cursor.rowcount == 0:
            return jsonify({"error": "Request not found or already processed"}), 404
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request rejected"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>', methods=['DELETE'])
def delete_trip(trip_id):
    """Delete a trip (only owner can delete)"""
    data = request.json
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Check if user is the owner of the trip
        check_query = """
        SELECT role FROM trip_participants
        WHERE trip_id = %s AND user_id = %s
        """
        cursor.execute(check_query, (trip_id, user_id))
        result = cursor.fetchone()
        
        if not result or result[0] != 'owner':
            return jsonify({"error": "Only the trip owner can delete this trip"}), 403
        
        # Delete related records first (foreign key constraints)
        # Delete planner items
        cursor.execute("DELETE FROM planner WHERE trip_id = %s", (trip_id,))
        
        # Delete chat messages
        cursor.execute("""
            DELETE FROM chat_messages 
            WHERE chat_id IN (SELECT chat_id FROM group_chats WHERE trip_id = %s)
        """, (trip_id,))
        
        # Delete chat participants
        cursor.execute("""
            DELETE FROM chat_participants 
            WHERE chat_id IN (SELECT chat_id FROM group_chats WHERE trip_id = %s)
        """, (trip_id,))
        
        # Delete group chats
        cursor.execute("DELETE FROM group_chats WHERE trip_id = %s", (trip_id,))
        
        # Delete trip participants
        cursor.execute("DELETE FROM trip_participants WHERE trip_id = %s", (trip_id,))
        
        # Finally, delete the trip itself
        cursor.execute("DELETE FROM trips WHERE trip_id = %s", (trip_id,))
        
        conn.commit()
        
        return jsonify({
            "success": True,
            "message": "Trip deleted successfully"
        }), 200
        
    except Exception as e:
        print(f"Database error in delete_trip: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    finally:
        if conn:
            conn.close()

# Planner routes
@app.route('/api/planner/<int:trip_id>', methods=['GET'])
def get_planner_items(trip_id):
    """Get all planner items for a trip"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT p.*, u.username as created_by_username
        FROM planner p
        JOIN users u ON p.created_by = u.user_id
        WHERE p.trip_id = %s
        ORDER BY p.start_date, p.order_index, p.start_time, p.planner_id
        """
        cursor.execute(query, (trip_id,))
        items = cursor.fetchall()
        
        # Convert date and time objects to ISO format strings and fetch photos from Google API
        for item in items:
            
            if item.get('start_date'):
                item['start_date'] = item['start_date'].strftime('%Y-%m-%d') if hasattr(item['start_date'], 'strftime') else str(item['start_date'])[:10]
            if item.get('end_date'):
                item['end_date'] = item['end_date'].strftime('%Y-%m-%d') if hasattr(item['end_date'], 'strftime') else str(item['end_date'])[:10]
            # Convert time objects to string format (HH:MM:SS)
            if item.get('start_time'):
                item['start_time'] = str(item['start_time']) if item['start_time'] else None
            if item.get('end_time'):
                item['end_time'] = str(item['end_time']) if item['end_time'] else None
            
            # Fetch photo from Google Places API if google_place_id exists
            if item.get('google_place_id') and gmaps:
                try:
                    # Get basic place details which includes photos
                    place_details = gmaps.place(place_id=item['google_place_id'])
                    place_data = place_details.get('result', {})
                    photos = place_data.get('photos')
                    if photos and len(photos) > 0:
                        photo_reference = photos[0].get('photo_reference')
                        if photo_reference:
                            item['photo_url'] = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                except Exception as e:
                    print(f"Error fetching photo for {item.get('item_name')}: {e}")
                    item['photo_url'] = None
        
        # Just return items immediately - distance calculation happens separately
        # Frontend will call /api/planner/calculate-distances separately if needed
        
        return jsonify({"items": items})
        
    except Exception as e:
        print(f"Database error in get_planner_items: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items', methods=['POST'])
def create_planner_item():
    """Create a new planner item"""
    data = request.json
    trip_id = data.get('trip_id')
    item_name = data.get('item_name')
    item_type = data.get('item_type', 'custom')
    description = data.get('description')
    location = data.get('location')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    cost = data.get('cost')
    notes = data.get('notes')
    created_by = data.get('created_by')
    google_place_id = data.get('google_place_id')
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    
    print(f"[ADD-ITEM] Creating planner item: {item_name} for trip {trip_id}")
    print(f"[ADD-ITEM] Coordinates: lat={latitude}, lng={longitude}, place_id={google_place_id}")
    
    if not all([trip_id, item_name, start_date, created_by]):
        return jsonify({"error": "Missing required fields"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Get the next order_index for this trip and date
        cursor.execute("""
            SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
            FROM planner
            WHERE trip_id = %s AND start_date = %s
        """, (trip_id, start_date))
        next_order = cursor.fetchone()[0]
        
        # Create planner item
        item_query = """
        INSERT INTO planner (trip_id, item_name, item_type, description, location, 
                           start_date, end_date, start_time, end_time, cost, notes, created_by, google_place_id, latitude, longitude, order_index)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(item_query, (
            trip_id, item_name, item_type, description, location,
            start_date, end_date, start_time, end_time, cost, notes, created_by, google_place_id, latitude, longitude, next_order
        ))
        planner_id = cursor.lastrowid
        
        # If google_place_id is provided, store the place and link it
        if google_place_id:
            # First, get place details from Google API
            if gmaps:
                try:
                    place_details = gmaps.place(google_place_id, fields=['name', 'formatted_address', 'geometry', 'rating', 'types'])
                    place_data = place_details.get('result', {})
                    
                    # Store or update place in google_places table
                    place_query = """
                    INSERT INTO google_places (place_id, name, address, latitude, longitude, place_type, rating)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    name = VALUES(name), address = VALUES(address), 
                    latitude = VALUES(latitude), longitude = VALUES(longitude),
                    place_type = VALUES(place_type), rating = VALUES(rating)
                    """
                    
                    geometry = place_data.get('geometry', {}).get('location', {})
                    place_type = ', '.join(place_data.get('types', []))
                    
                    cursor.execute(place_query, (
                        google_place_id,
                        place_data.get('name', ''),
                        place_data.get('formatted_address', ''),
                        geometry.get('lat'),
                        geometry.get('lng'),
                        place_type,
                        place_data.get('rating')
                    ))
                    
                    # Link planner item to google place
                    link_query = """
                    INSERT INTO planner_places (planner_id, google_place_id)
                    VALUES (%s, %s)
                    """
                    cursor.execute(link_query, (planner_id, google_place_id))
                    
                except Exception as e:
                    print(f"Error fetching place details: {e}")
        
        conn.commit()
        
        # Return the newly created item immediately
        cursor_dict = conn.cursor(dictionary=True)
        cursor_dict.execute("""
            SELECT p.*, u.username as created_by_username
            FROM planner p
            JOIN users u ON p.created_by = u.user_id
            WHERE p.planner_id = %s
        """, (planner_id,))
        new_item = cursor_dict.fetchone()
        
        # Convert dates to string format
        if new_item.get('start_date'):
            new_item['start_date'] = new_item['start_date'].strftime('%Y-%m-%d') if hasattr(new_item['start_date'], 'strftime') else str(new_item['start_date'])[:10]
        if new_item.get('end_date'):
            new_item['end_date'] = new_item['end_date'].strftime('%Y-%m-%d') if hasattr(new_item['end_date'], 'strftime') else str(new_item['end_date'])[:10]
        
        # Mark distance as calculating (will be updated by background fetch)
        new_item['distance_calculating'] = True
        
        print(f"[ADD-ITEM] Successfully created item with ID: {planner_id}")
        print(f"[ADD-ITEM] Returning item: {new_item['item_name']}")
        
        return jsonify({
            "success": True,
            "planner_id": planner_id,
            "message": "Planner item created successfully",
            "item": new_item
        }), 201
        
    except Exception as e:
        print(f"Database error in create_planner_item: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/<int:trip_id>/calculate-distances', methods=['POST'])
def calculate_planner_distances(trip_id):
    """Calculate and cache distances between planner items"""
    if not gmaps:
        return jsonify({"error": "Google Maps API not configured"}), 500
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get all items for this trip, ordered correctly
        query = """
        SELECT planner_id, item_name, location, start_date
        FROM planner
        WHERE trip_id = %s
        ORDER BY start_date, order_index, start_time, planner_id
        """
        cursor.execute(query, (trip_id,))
        items = cursor.fetchall()
        
        if len(items) < 2:
            return jsonify({"message": "Not enough items to calculate distances", "updated": 0})
        
        print(f"[DISTANCE-CACHE] Calculating distances for {len(items)} items")
        
        # Build batch request for Distance Matrix API
        origins = []
        destinations = []
        item_pairs = []
        
        for i in range(len(items) - 1):
            current_item = items[i]
            next_item = items[i + 1]
            
            origin = current_item.get('location') or current_item.get('item_name')
            destination = next_item.get('location') or next_item.get('item_name')
            
            if origin and destination:
                origins.append(origin)
                destinations.append(destination)
                item_pairs.append((current_item, next_item))
        
        if not origins:
            return jsonify({"message": "No valid locations to calculate", "updated": 0})
        
        # Single batch API call
        result = gmaps.distance_matrix(
            origins=origins,
            destinations=destinations,
            mode="driving",
            units="imperial"
        )
        
        if result.get('status') == 'REQUEST_DENIED':
            return jsonify({"error": "Distance Matrix API not enabled"}), 403
        
        updated_count = 0
        
        # Update database with cached distances
        if result.get('rows'):
            for i, row in enumerate(result['rows']):
                if i < len(item_pairs) and row.get('elements') and i < len(row['elements']):
                    # IMPORTANT: For batch Distance Matrix, each row has multiple elements
                    # We want row[i] element[i] to get the correct pair
                    element = row['elements'][i]
                    current_item, next_item = item_pairs[i]
                    
                    if element['status'] == 'OK':
                        distance_text = element['distance']['text']
                        duration_text = element['duration']['text']
                        from_location = current_item.get('item_name')
                        
                        cursor.execute("""
                            UPDATE planner
                            SET distance_from_previous = %s,
                                duration_from_previous = %s,
                                from_location = %s
                            WHERE planner_id = %s
                        """, (
                            distance_text,
                            duration_text,
                            from_location,
                            next_item['planner_id']
                        ))
                        updated_count += 1
                        print(f"[DISTANCE-CACHE] Cached: {duration_text} / {distance_text}")
        
        conn.commit()
        print(f"[DISTANCE-CACHE] Successfully cached distances for {updated_count} items")
        
        return jsonify({"success": True, "updated": updated_count})
        
    except Exception as e:
        print(f"Error calculating distances: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items/reorder', methods=['POST'])
def reorder_planner_items():
    """Update order_index for items after drag and drop"""
    data = request.json
    items_order = data.get('items')  # Array of {planner_id, order_index}
    
    if not items_order:
        return jsonify({"error": "Missing items order"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        print(f"[REORDER] Updating order for {len(items_order)} items")
        
        for item in items_order:
            cursor.execute("""
                UPDATE planner
                SET order_index = %s
                WHERE planner_id = %s
            """, (item['order_index'], item['planner_id']))
            print(f"[REORDER] Set order_index={item['order_index']} for planner_id={item['planner_id']}")
        
        conn.commit()
        
        return jsonify({"success": True, "message": f"Updated order for {len(items_order)} items"})
        
    except Exception as e:
        print(f"Error in reorder_planner_items: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items/fix-categories', methods=['POST'])
def fix_planner_item_categories():
    """Fix categories for existing planner items based on their Google Place ID"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get all planner items with google_place_id
        query = """
        SELECT planner_id, item_name, google_place_id, item_type
        FROM planner
        WHERE google_place_id IS NOT NULL AND google_place_id != ''
        """
        cursor.execute(query)
        items = cursor.fetchall()
        
        updated_count = 0
        skipped_count = 0
        print(f"[FIX-CATEGORIES] Found {len(items)} items with Google Place IDs")
        
        if not gmaps:
            print("[FIX-CATEGORIES] Google Maps API not configured, skipping")
            return jsonify({"error": "Google Maps API not configured"}), 500
        
        for item in items:
            try:
                print(f"[FIX-CATEGORIES] Processing: {item['item_name']} (ID: {item['planner_id']})")
                
                # Get place details from Google
                place = gmaps.place(place_id=item['google_place_id'])
                
                if place.get('status') == 'OK' and place.get('result'):
                    types = place['result'].get('types', [])
                    print(f"[FIX-CATEGORIES] Place types: {types}")
                    
                    # Category mapping (same as in search endpoint)
                    category_map = {
                        'restaurant': 'Restaurants',
                        'cafe': 'Restaurants',
                        'bar': 'Restaurants',
                        'night_club': 'Nightlife',
                        'museum': 'Museums',
                        'art_gallery': 'Museums',
                        'park': 'Parks & Recreation',
                        'amusement_park': 'Parks & Recreation',
                        'zoo': 'Parks & Recreation',
                        'aquarium': 'Parks & Recreation',
                        'shopping_mall': 'Shopping',
                        'store': 'Shopping',
                        'lodging': 'Hotels',
                        'tourist_attraction': 'Attractions',
                        'point_of_interest': 'Attractions'
                    }
                    
                    category = 'Attractions'  # Default
                    for place_type in types:
                        if place_type in category_map:
                            category = category_map[place_type]
                            print(f"[FIX-CATEGORIES] Matched type '{place_type}' -> '{category}'")
                            break
                    
                    # Update the item if category is different
                    if item['item_type'] != category:
                        update_query = """
                        UPDATE planner
                        SET item_type = %s
                        WHERE planner_id = %s
                        """
                        cursor.execute(update_query, (category, item['planner_id']))
                        updated_count += 1
                        print(f"[FIX-CATEGORIES] Updated '{item['item_name']}' from '{item['item_type']}' to '{category}'")
                    else:
                        skipped_count += 1
                        print(f"[FIX-CATEGORIES] Skipped '{item['item_name']}' - already correct ({category})")
                else:
                    skipped_count += 1
                    print(f"[FIX-CATEGORIES] Could not get place details for '{item['item_name']}'")
                
            except Exception as e:
                skipped_count += 1
                print(f"[FIX-CATEGORIES] Error updating item {item['planner_id']}: {str(e)[:200]}")
                continue
        
        conn.commit()
        message = f"Updated {updated_count} items, skipped {skipped_count} items"
        print(f"[FIX-CATEGORIES] {message}")
        return jsonify({"message": message, "updated": updated_count, "skipped": skipped_count})
        
    except Exception as e:
        print(f"Error in fix_planner_item_categories: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/<int:trip_id>/fix-place-ids', methods=['POST'])
def fix_missing_place_ids(trip_id):
    """Find and add Google Place IDs for items that don't have them"""
    if not gmaps:
        return jsonify({"error": "Google Maps API not configured"}), 500
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get all items without google_place_id
        query = """
        SELECT planner_id, item_name, location, item_type
        FROM planner
        WHERE trip_id = %s AND (google_place_id IS NULL OR google_place_id = '')
        """
        cursor.execute(query, (trip_id,))
        items = cursor.fetchall()
        
        print(f"\n[FIX-PLACE-IDS] Found {len(items)} items without Google Place IDs")
        
        updated_count = 0
        skipped_count = 0
        
        for item in items:
            try:
                item_name = item['item_name']
                location = item.get('location', '')
                
                # Search for the place using name and location
                search_query = f"{item_name} {location}" if location else item_name
                print(f"[FIX-PLACE-IDS] Searching for: '{search_query}'")
                
                # Use places text search
                results = gmaps.places(query=search_query)
                
                if results.get('results') and len(results['results']) > 0:
                    # Get the first result (most relevant)
                    place = results['results'][0]
                    place_id = place.get('place_id')
                    place_name = place.get('name', '')
                    
                    print(f"[FIX-PLACE-IDS] Found match: '{place_name}' (Place ID: {place_id})")
                    
                    # Update the planner item with the google_place_id
                    update_query = """
                    UPDATE planner
                    SET google_place_id = %s
                    WHERE planner_id = %s
                    """
                    cursor.execute(update_query, (place_id, item['planner_id']))
                    
                    # Also store the place in google_places table
                    place_details = gmaps.place(place_id=place_id)
                    place_data = place_details.get('result', {})
                    
                    place_query = """
                    INSERT INTO google_places (place_id, name, address, latitude, longitude, place_type, rating)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    name = VALUES(name), address = VALUES(address), 
                    latitude = VALUES(latitude), longitude = VALUES(longitude),
                    place_type = VALUES(place_type), rating = VALUES(rating)
                    """
                    
                    geometry = place_data.get('geometry', {}).get('location', {})
                    place_type = ', '.join(place_data.get('types', []))
                    
                    cursor.execute(place_query, (
                        place_id,
                        place_data.get('name', ''),
                        place_data.get('formatted_address', ''),
                        geometry.get('lat'),
                        geometry.get('lng'),
                        place_type,
                        place_data.get('rating')
                    ))
                    
                    updated_count += 1
                    print(f"[FIX-PLACE-IDS] Updated '{item_name}' with Place ID: {place_id}")
                else:
                    skipped_count += 1
                    print(f"[FIX-PLACE-IDS] No results found for '{item_name}'")
                
            except Exception as e:
                skipped_count += 1
                print(f"[FIX-PLACE-IDS] Error updating item {item['planner_id']}: {str(e)[:200]}")
                continue
        
        conn.commit()
        message = f"Updated {updated_count} items with Google Place IDs, skipped {skipped_count} items"
        print(f"[FIX-PLACE-IDS] {message}")
        return jsonify({"message": message, "updated": updated_count, "skipped": skipped_count})
        
    except Exception as e:
        print(f"Error in fix_missing_place_ids: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items/<int:planner_id>', methods=['PUT'])
def update_planner_item(planner_id):
    """Update a planner item"""
    data = request.json
    user_id = data.get('user_id')
    
    # Check if user has permission to update this item
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is participant in the trip
        check_query = """
        SELECT p.created_by, t.trip_id
        FROM planner p
        JOIN trips t ON p.trip_id = t.trip_id
        JOIN trip_participants tp ON t.trip_id = tp.trip_id
        WHERE p.planner_id = %s AND tp.user_id = %s
        """
        cursor.execute(check_query, (planner_id, user_id))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Permission denied"}), 403
        
        # Update the item
        update_fields = []
        update_values = []
        
        for field in ['item_name', 'item_type', 'description', 'location', 
                     'start_date', 'end_date', 'start_time', 'end_time', 'cost', 'notes']:
            if field in data:
                update_fields.append(f"{field} = %s")
                update_values.append(data[field])
        
        if update_fields:
            update_values.append(planner_id)
            update_query = f"""
            UPDATE planner 
            SET {', '.join(update_fields)}
            WHERE planner_id = %s
            """
            cursor.execute(update_query, update_values)
            conn.commit()
        
        return jsonify({"success": True, "message": "Planner item updated successfully"})
        
    except Exception as e:
        print(f"Database error in update_planner_item: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items/<int:planner_id>/notes', methods=['PUT'])
def update_planner_item_notes(planner_id):
    """Update notes for a planner item"""
    data = request.json
    user_id = data.get('user_id')
    notes = data.get('notes', '')
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user has permission to update this item
        check_query = """
        SELECT p.created_by, t.trip_id
        FROM planner p
        JOIN trips t ON p.trip_id = t.trip_id
        JOIN trip_participants tp ON t.trip_id = tp.trip_id
        WHERE p.planner_id = %s AND tp.user_id = %s
        """
        cursor.execute(check_query, (planner_id, user_id))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Permission denied"}), 403
        
        # Update the notes
        update_query = """
        UPDATE planner 
        SET notes = %s
        WHERE planner_id = %s
        """
        cursor.execute(update_query, (notes, planner_id))
        conn.commit()
        
        return jsonify({"success": True, "message": "Notes updated successfully"})
        
    except Exception as e:
        print(f"Database error in update_planner_item_notes: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items/<int:planner_id>/time', methods=['PUT'])
def update_planner_item_time(planner_id):
    """Update time for a planner item"""
    data = request.json
    user_id = data.get('user_id')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user has permission to update this item
        check_query = """
        SELECT p.created_by, t.trip_id
        FROM planner p
        JOIN trips t ON p.trip_id = t.trip_id
        JOIN trip_participants tp ON t.trip_id = tp.trip_id
        WHERE p.planner_id = %s AND tp.user_id = %s
        """
        cursor.execute(check_query, (planner_id, user_id))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Permission denied"}), 403
        
        # Update the time
        update_query = """
        UPDATE planner 
        SET start_time = %s, end_time = %s
        WHERE planner_id = %s
        """
        cursor.execute(update_query, (start_time, end_time, planner_id))
        conn.commit()
        
        return jsonify({"success": True, "message": "Time updated successfully"})
        
    except Exception as e:
        print(f"Database error in update_planner_item_time: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/recommendations', methods=['POST'])
def get_recommendations():
    """Get nearby place recommendations based on location and type"""
    if not gmaps:
        return jsonify({"error": "Google Maps API not configured"}), 500
    
    data = request.json
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    place_type = data.get('type', 'all')  # Default to all types
    radius = data.get('radius', 5000)  # Default 5km radius
    page_token = data.get('page_token')  # For pagination
    
    # Latitude and longitude are required (for distance calculations)
    # unless we're using page_token without them
    if not latitude or not longitude:
        if not page_token:
            return jsonify({"error": "Latitude and longitude required"}), 400
    
    try:
        # Map of user-friendly names to Google Places API types
        type_mapping = {
            'parks': 'park',
            'museums': 'museum',
            'restaurants': 'restaurant',
            'cafes': 'cafe',
            'shopping': 'shopping_mall',
            'attractions': 'tourist_attraction',
            'entertainment': 'amusement_park',
            'nightlife': 'night_club',
            'landmarks': 'point_of_interest',
            'hikes': 'park',  # Parks often include hiking trails
            'beaches': 'natural_feature',
            'hotels': 'lodging',
            'art': 'art_gallery',
            'food': 'restaurant',
            'nature': 'park',
            'all': None  # No type filter for "all"
        }
        
        # Get the API type from mapping, or use the provided type directly
        api_type = type_mapping.get(place_type.lower(), place_type)
        
        # Search for nearby places
        # For popular places, use rank_by='prominence' to get most popular first
        if page_token:
            # If page_token is provided, use it to get next page
            places_result = gmaps.places_nearby(page_token=page_token)
        elif api_type:
            places_result = gmaps.places_nearby(
                location=(latitude, longitude),
                radius=radius,
                type=api_type
            )
        else:
            # For "all", search without type filter to get most popular places
            places_result = gmaps.places_nearby(
                location=(latitude, longitude),
                radius=radius
            )
        
        recommendations = []
        origin = f"{latitude},{longitude}" if latitude and longitude else None
        
        if places_result.get('results'):
            # Get all results (Google returns up to 20 per request)
            results = places_result['results']
            
            print(f"📍 Fetching {len(results)} results for type '{place_type}' (API type: {api_type})")
            
            # Get place details including photos for each result
            for place in results:
                # Log place types for debugging
                place_types = place.get('types', [])
                print(f"  - {place.get('name')}: types = {place_types}")
                place_location = place['geometry']['location']
                destination = f"{place_location['lat']},{place_location['lng']}"
                
                # Calculate distance (if origin is available)
                distance_text = "N/A"
                duration_text = "N/A"
                
                if origin:
                    distance_result = gmaps.distance_matrix(
                        origins=origin,
                        destinations=destination,
                        mode='driving'
                    )
                    
                    if distance_result['rows'] and distance_result['rows'][0]['elements']:
                        element = distance_result['rows'][0]['elements'][0]
                        if element['status'] == 'OK':
                            distance_text = element['distance']['text']
                            duration_text = element['duration']['text']
                
                # Get photo URL if available
                photo_url = None
                if place.get('photos') and len(place['photos']) > 0:
                    photo_reference = place['photos'][0].get('photo_reference')
                    if photo_reference:
                        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                
                recommendation = {
                    'place_id': place.get('place_id'),
                    'name': place.get('name'),
                    'address': place.get('vicinity', 'Address not available'),
                    'rating': place.get('rating'),
                    'user_ratings_total': place.get('user_ratings_total'),
                    'types': place.get('types', []),
                    'latitude': place_location['lat'],
                    'longitude': place_location['lng'],
                    'distance': distance_text,
                    'duration': duration_text,
                    'photo_url': photo_url,
                    'open_now': place.get('opening_hours', {}).get('open_now')
                }
                
                recommendations.append(recommendation)
        
        # Get next_page_token if available
        next_page_token = places_result.get('next_page_token')
        
        return jsonify({
            'recommendations': recommendations,
            'count': len(recommendations),
            'next_page_token': next_page_token
        }), 200
        
    except Exception as e:
        print(f"Error fetching recommendations: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/planner/items/<int:planner_id>', methods=['DELETE'])
def delete_planner_item(planner_id):
    """Delete a planner item"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user has permission to delete this item
        check_query = """
        SELECT p.created_by, t.trip_id
        FROM planner p
        JOIN trips t ON p.trip_id = t.trip_id
        JOIN trip_participants tp ON t.trip_id = tp.trip_id
        WHERE p.planner_id = %s AND tp.user_id = %s
        """
        cursor.execute(check_query, (planner_id, user_id))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Permission denied"}), 403
        
        # Delete the item
        delete_query = "DELETE FROM planner WHERE planner_id = %s"
        cursor.execute(delete_query, (planner_id,))
        conn.commit()
        
        return jsonify({"success": True, "message": "Planner item deleted successfully"})
        
    except Exception as e:
        print(f"Database error in delete_planner_item: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/notifications/<int:user_id>', methods=['GET'])
def get_notifications(user_id):
    """Get all notifications for a user (friend requests, trip additions, recent messages)"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        notifications = []
        
        # 1. Friend Requests
        cursor.execute("""
            SELECT 
                'friend_request' as type,
                f.id as notification_id,
                u.first_name,
                u.last_name,
                u.username,
                f.user_id as sender_id,
                NULL as trip_id,
                NULL as chat_id,
                NULL as message_preview,
                f.created_at as timestamp
            FROM friends f
            JOIN users u ON f.user_id = u.user_id
            WHERE f.friend_id = %s AND f.status = 'pending'
        """, (user_id,))
        notifications.extend(cursor.fetchall())
        
        # 2. Trip Invitations (for friends being invited)
        cursor.execute("""
            SELECT 
                'trip_invitation' as type,
                tmr.id as notification_id,
                u.first_name,
                u.last_name,
                u.username,
                tmr.requester_id as sender_id,
                tmr.trip_id,
                NULL as chat_id,
                t.trip_name as message_preview,
                t.description as trip_description,
                tmr.created_at as timestamp,
                tmr.owner_approved,
                tmr.friend_accepted
            FROM trip_member_requests tmr
            JOIN users u ON tmr.requester_id = u.user_id
            JOIN trips t ON tmr.trip_id = t.trip_id
            WHERE tmr.friend_id = %s AND tmr.status = 'pending'
        """, (user_id,))
        notifications.extend(cursor.fetchall())
        
        # 2b. Member Addition Requests (for trip owners/admins to approve)
        cursor.execute("""
            SELECT 
                'member_request' as type,
                tmr.id as notification_id,
                u1.first_name,
                u1.last_name,
                u1.username,
                tmr.requester_id as sender_id,
                tmr.trip_id,
                NULL as chat_id,
                CONCAT(u2.first_name, ' ', u2.last_name, ' requested by ', u1.first_name) as message_preview,
                t.trip_name,
                u2.first_name as friend_first_name,
                u2.last_name as friend_last_name,
                tmr.created_at as timestamp
            FROM trip_member_requests tmr
            JOIN users u1 ON tmr.requester_id = u1.user_id
            JOIN users u2 ON tmr.friend_id = u2.user_id
            JOIN trips t ON tmr.trip_id = t.trip_id
            JOIN trip_participants tp ON tmr.trip_id = tp.trip_id
            WHERE tp.user_id = %s 
              AND tp.role IN ('owner', 'admin')
              AND tmr.status = 'pending'
              AND NOT tmr.owner_approved
              AND tmr.requester_id != %s
        """, (user_id, user_id))
        notifications.extend(cursor.fetchall())
        
        # 3. Trip Addition Notifications
        cursor.execute("""
            SELECT 
                'trip_added' as type,
                tn.notification_id,
                u.first_name,
                u.last_name,
                u.username,
                tn.added_by_user_id as sender_id,
                tn.trip_id,
                NULL as chat_id,
                t.trip_name as message_preview,
                tn.created_at as timestamp
            FROM trip_notifications tn
            JOIN users u ON tn.added_by_user_id = u.user_id
            JOIN trips t ON tn.trip_id = t.trip_id
            WHERE tn.user_id = %s AND tn.is_read = FALSE
        """, (user_id,))
        notifications.extend(cursor.fetchall())
        
        # 4. Recent Unread Messages (both group and direct)
        cursor.execute("""
            SELECT 
                'message' as type,
                um.id as notification_id,
                um.chat_id,
                um.chat_type,
                um.unread_count,
                um.last_message_at as timestamp
            FROM unread_messages um
            WHERE um.user_id = %s AND um.unread_count > 0
            ORDER BY um.last_message_at DESC
            LIMIT 10
        """, (user_id,))
        
        unread_messages = cursor.fetchall()
        
        # Get chat names and last message preview for unread messages
        for msg in unread_messages:
            if msg['chat_type'] == 'group':
                # Get group chat name
                cursor.execute("SELECT chat_name FROM group_chats WHERE chat_id = %s", (msg['chat_id'],))
                chat = cursor.fetchone()
                msg['chat_name'] = chat['chat_name'] if chat else 'Group Chat'
                
                # Get last message preview
                cursor.execute("""
                    SELECT cm.message, u.first_name 
                    FROM chat_messages cm
                    JOIN users u ON cm.user_id = u.user_id
                    WHERE cm.chat_id = %s 
                    ORDER BY cm.sent_at DESC 
                    LIMIT 1
                """, (msg['chat_id'],))
                last_message = cursor.fetchone()
                if last_message:
                    preview = last_message['message'][:40] + ('...' if len(last_message['message']) > 40 else '')
                    msg['message_preview'] = f"{last_message['first_name']}: {preview}"
                    msg['sender_name'] = last_message['first_name']
                else:
                    msg['message_preview'] = f"{msg['unread_count']} new message{'s' if msg['unread_count'] > 1 else ''}"
            else:
                # Get other user info for direct chat
                cursor.execute("""
                    SELECT user1_id, user2_id FROM direct_chats WHERE chat_id = %s
                """, (msg['chat_id'],))
                chat = cursor.fetchone()
                if chat:
                    other_user_id = chat['user2_id'] if chat['user1_id'] == user_id else chat['user1_id']
                    cursor.execute("SELECT first_name, last_name FROM users WHERE user_id = %s", (other_user_id,))
                    other_user = cursor.fetchone()
                    msg['chat_name'] = f"{other_user['first_name']} {other_user['last_name']}" if other_user else 'Direct Chat'
                    msg['first_name'] = other_user['first_name'] if other_user else 'User'
                    msg['last_name'] = other_user['last_name'] if other_user else ''
                    
                    # Get last message preview
                    cursor.execute("""
                        SELECT message_content 
                        FROM direct_messages 
                        WHERE chat_id = %s 
                        ORDER BY sent_at DESC 
                        LIMIT 1
                    """, (msg['chat_id'],))
                    last_message = cursor.fetchone()
                    if last_message:
                        preview = last_message['message_content'][:40] + ('...' if len(last_message['message_content']) > 40 else '')
                        msg['message_preview'] = preview
                    else:
                        msg['message_preview'] = f"{msg['unread_count']} new message{'s' if msg['unread_count'] > 1 else ''}"
        
        notifications.extend(unread_messages)
        
        # Sort all notifications by timestamp
        notifications.sort(key=lambda x: x['timestamp'] if x['timestamp'] else '', reverse=True)
        
        # Convert timestamps to ISO format
        for notif in notifications:
            if notif.get('timestamp'):
                notif['timestamp'] = notif['timestamp'].isoformat() if hasattr(notif['timestamp'], 'isoformat') else str(notif['timestamp'])
        
        return jsonify({"notifications": notifications}), 200
        
    except Exception as e:
        print(f"Error fetching notifications: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
def mark_notification_read(notification_id):
    """Mark a trip notification as read"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE trip_notifications 
            SET is_read = TRUE 
            WHERE notification_id = %s
        """, (notification_id,))
        
        conn.commit()
        return jsonify({"success": True}), 200
        
    except Exception as e:
        print(f"Error marking notification as read: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/unread/<int:user_id>/<int:chat_id>/<chat_type>', methods=['DELETE'])
def clear_unread_count(user_id, chat_id, chat_type):
    """Clear unread count for a specific chat"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM unread_messages 
            WHERE user_id = %s AND chat_id = %s AND chat_type = %s
        """, (user_id, chat_id, chat_type))
        
        conn.commit()
        return jsonify({"success": True}), 200
        
    except Exception as e:
        print(f"Error clearing unread count: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

# Serve React App
@app.route('/')
def serve_root():
    print(f"[SERVE] Serving root /")
    return send_from_directory(app.static_folder, 'index.html')

# Explicitly handle SPA routes
@app.route('/search')
@app.route('/friends')
@app.route('/planner')
@app.route('/calendar')
@app.route('/chats')
@app.route('/chats/<chat_id>')
def serve_spa_routes(chat_id=None):
    route = request.path
    print(f"[SERVE] Serving SPA route: {route}")
    return send_from_directory(app.static_folder, 'index.html')

# Catch all for other routes
@app.route('/<path:path>')
def serve_catchall(path):
    print(f"[SERVE] Catchall requested path: '{path}'")
    
    # Don't serve React for API routes
    if path.startswith('api/'):
        return jsonify({"error": "API endpoint not found"}), 404
    
    # Serve static files if they exist (CSS, JS, images, etc.)
    if os.path.exists(os.path.join(app.static_folder, path)):
        print(f"[SERVE] Serving static file: {path}")
        return send_from_directory(app.static_folder, path)
    
    # Serve index.html for all other routes (React Router handles them)
    print(f"[SERVE] Serving index.html for path: {path}")
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5000)

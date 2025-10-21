import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaComments, FaUsers, FaSearch } from 'react-icons/fa';
import Layout from './Layout';
import './styles/Chats.css';
import API_URL from '../config';

const Chats = () => {
  const [chats, setChats] = useState([]);
  const [directChats, setDirectChats] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const currentUserId = currentUser.user_id;
  
  useEffect(() => {
    if (!currentUserId) {
      navigate('/login');
      return;
    }
    
    fetchChats();
    fetchDirectChats();
    fetchFriends();
  }, [currentUserId, navigate]);

  const fetchChats = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/chats/user/${currentUserId}`);
      setChats(response.data.chats || []);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching chats:", error);
      setLoading(false);
    }
  };

  const fetchDirectChats = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/chats/direct/user/${currentUserId}`);
      setDirectChats(response.data.chats || []);
    } catch (error) {
      console.error("Error fetching direct chats:", error);
    }
  };

  const fetchFriends = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/friends/${currentUserId}`);
      setFriends(response.data.friends || []);
    } catch (error) {
      console.error("Error fetching friends:", error);
    }
  };

  const createDirectChat = async (friend) => {
    try {
      // Check if chat already exists
      const existingChat = directChats.find(chat => 
        chat.chat_name === `${friend.first_name} ${friend.last_name}`
      );
      
      if (existingChat) {
        navigate(`/chats/${existingChat.chat_id}?type=direct`);
        return;
      }

      // Create new direct chat
      const response = await axios.post(`${API_URL}/api/chats/direct`, {
        user_id: currentUserId,
        friend_id: friend.user_id
      });

      if (response.data.chat_id) {
        navigate(`/chats/${response.data.chat_id}?type=direct`);
      }
    } catch (error) {
      console.error('Error creating direct chat:', error);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // Less than 24 hours - show time
    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Less than 7 days - show day
    if (diff < 604800000) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    
    // Show date
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Combine all chats (group + direct) and sort by last message time
  const allChats = [
    ...chats.map(c => ({ ...c, chat_type: 'group' })),
    ...directChats.map(c => ({ ...c, chat_type: 'direct' }))
  ].sort((a, b) => {
    const timeA = new Date(a.last_message_time || a.created_at || 0);
    const timeB = new Date(b.last_message_time || b.created_at || 0);
    return timeB - timeA;
  });

  const filteredChats = allChats.filter(chat => {
    const searchLower = searchQuery.toLowerCase();
    return (
      chat.chat_name?.toLowerCase().includes(searchLower) ||
      chat.trip_name?.toLowerCase().includes(searchLower)
    );
  });

  const filteredFriends = friends.filter(friend => {
    const searchLower = searchQuery.toLowerCase();
    // Don't show friends who already have a direct chat
    const hasChat = directChats.some(chat => 
      chat.chat_name === `${friend.first_name} ${friend.last_name}`
    );
    if (hasChat) return false;
    
    return (
      `${friend.first_name} ${friend.last_name}`.toLowerCase().includes(searchLower) ||
      friend.username?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Layout>
      <div className="chats-page">
        <div className="chats-list-container">
          {/* Search Bar */}
          <div className="chats-search">
            <input
              type="text"
              placeholder="Search chats or people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="chats-search-input"
            />
            <button className="chats-search-button" aria-label="Search">
              <FaSearch />
            </button>
          </div>
          
          <div className="chats-header">
            <h1>Messages</h1>
          </div>
          
          <div className="chats-list">
            {loading ? (
              <div className="chats-loading">
                <div className="loading-spinner"></div>
                <p>Loading chats...</p>
              </div>
            ) : filteredChats.length > 0 ? (
              filteredChats.map(chat => (
                <div 
                  key={`${chat.chat_type}-${chat.chat_id}`}
                  className="chat-card"
                  onClick={() => navigate(`/chats/${chat.chat_id}?type=${chat.chat_type}`)}
                >
                  <div className="chat-avatar">
                    {(chat.chat_name || chat.trip_name)?.charAt(0).toUpperCase()}
                  </div>
                  
                  <div className="chat-content">
                    <div className="chat-title-row">
                      <h3 className="chat-title">{chat.chat_name || chat.trip_name}</h3>
                      {chat.last_message_time && (
                        <span className="chat-time">{formatTime(chat.last_message_time)}</span>
                      )}
                    </div>
                    
                    <div className="chat-preview">
                      {chat.last_message ? (
                        <p>
                          {chat.last_sender && <span className="sender-name">{chat.last_sender}: </span>}
                          {chat.last_message}
                        </p>
                      ) : (
                        <p className="no-messages-text">No messages yet</p>
                      )}
                    </div>
                    
                    {chat.chat_type === 'group' && (
                      <div className="chat-meta">
                        <div className="member-count">
                          <FaUsers />
                          <span>{chat.member_count} members</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {chat.unread_count > 0 && (
                    <div className="unread-badge">{chat.unread_count}</div>
                  )}
                </div>
              ))
            ) : searchQuery && filteredFriends.length > 0 ? (
              /* Show friends only when searching */
              <>
                <div className="chat-section-title">People</div>
                {filteredFriends.map(friend => (
                  <div
                    key={friend.user_id}
                    className="chat-card friend-card"
                    onClick={() => createDirectChat(friend)}
                  >
                    <div className="chat-avatar friend-avatar">
                      {friend.first_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="chat-content">
                      <div className="chat-title-row">
                        <h3 className="chat-title">{friend.first_name} {friend.last_name}</h3>
                      </div>
                      <div className="chat-preview">
                        <p className="no-messages-text">Start a conversation</p>
                      </div>
                    </div>
                    <div className="message-icon">
                      <FaComments />
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="no-chats">
                <FaComments className="no-chats-icon" />
                <h3>{searchQuery ? 'No results found' : 'No messages yet'}</h3>
                <p>
                  {searchQuery 
                    ? 'Try searching for a different name'
                    : 'Search for friends to start chatting'}
                </p>
                {!searchQuery && (
                  <button 
                    className="go-home-btn"
                    onClick={() => navigate('/')}
                  >
                    Go to Home
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Chats;

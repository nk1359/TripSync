import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaComments, FaUsers } from 'react-icons/fa';
import Layout from './Layout';
import ChatRoom from './ChatRoom';
import './styles/Chats.css';

const Chats = () => {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const currentUserId = currentUser.user_id;
  
  useEffect(() => {
    if (!currentUserId) {
      navigate('/login');
      return;
    }
    
    fetchChats();
  }, [currentUserId, navigate]);

  const fetchChats = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`http://localhost:5000/api/chats/user/${currentUserId}`);
      setChats(response.data.chats || []);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching chats:", error);
      setLoading(false);
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

    return (
    <Layout>
      <div className="chats-page">
        {!selectedChat ? (
          <div className="chats-list-container">
        <div className="chats-header">
              <h1>Trip Chats</h1>
              <p className="chats-subtitle">Message your trip members</p>
        </div>
        
            <div className="chats-list">
              {loading ? (
                <div className="chats-loading">
                  <div className="loading-spinner"></div>
                  <p>Loading chats...</p>
                </div>
              ) : chats.length === 0 ? (
                <div className="no-chats">
                  <FaComments className="no-chats-icon" />
                  <h3>No chats yet</h3>
                  <p>Create a trip to start chatting with your travel companions</p>
                  <button 
                    className="go-home-btn"
                    onClick={() => navigate('/home')}
                  >
                    Go to Home
                  </button>
            </div>
          ) : (
                chats.map(chat => (
                  <div 
                    key={chat.chat_id}
                    className="chat-card"
                    onClick={() => setSelectedChat(chat)}
                  >
                    <div className="chat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                </div>
                    
                    <div className="chat-content">
                      <div className="chat-title-row">
                        <h3 className="chat-title">{chat.trip_name}</h3>
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
                      
                      <div className="chat-meta">
                        <div className="member-count">
                          <FaUsers />
                          <span>{chat.member_count} members</span>
                        </div>
                </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
        ) : (
          <ChatRoom
            chat={selectedChat}
            onBack={() => setSelectedChat(null)}
          />
        )}
      </div>
    </Layout>
  );
};

export default Chats;

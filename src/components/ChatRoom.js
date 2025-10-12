import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FaArrowLeft, FaPaperPlane, FaUsers } from 'react-icons/fa';
import { useToast } from './ToastContext';
import './styles/ChatRoom.css';

const ChatRoom = ({ chat, onBack }) => {
  const { showToast } = useToast();
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const currentUserId = currentUser.user_id;

  useEffect(() => {
    fetchMessages();
    inputRef.current?.focus();
  }, [chat.chat_id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `http://localhost:5000/api/chats/${chat.chat_id}/messages?user_id=${currentUserId}`
      );
      setMessages(response.data.messages || []);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim()) return;

    const tempMessage = {
      message_id: Date.now(),
      message: messageText.trim(),
      sent_at: new Date().toISOString(),
      user_id: currentUserId,
      first_name: currentUser.first_name,
      last_name: currentUser.last_name,
      username: currentUser.username
    };
    
    setMessages([...messages, tempMessage]);
    setMessageText('');

    try {
      await axios.post(`http://localhost:5000/api/chats/${chat.chat_id}/messages`, {
        user_id: currentUserId,
        message: tempMessage.message
      });
    } catch (error) {
      console.error("Error sending message:", error);
      showToast('Failed to send message', 'error');
      fetchMessages();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateDivider = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  };

  const groupMessagesByDate = () => {
    const groups = {};
    
    messages.forEach(msg => {
      const date = new Date(msg.sent_at).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(msg);
    });
    
    return groups;
  };

  const messageGroups = groupMessagesByDate();

  return (
    <div className="chatroom-container">
      <div className="chatroom-header">
        <button className="back-btn" onClick={onBack}>
          <FaArrowLeft />
        </button>
        <div className="chatroom-info">
          <h2>{chat.trip_name}</h2>
          <p className="chatroom-members">
            <FaUsers />
            {chat.member_count} members
          </p>
        </div>
      </div>

      <div className="chatroom-messages">
        {loading ? (
          <div className="messages-loading">
            <div className="loading-spinner"></div>
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="no-messages">
            <div className="no-messages-icon">💬</div>
            <h3>No messages yet</h3>
            <p>Start the conversation!</p>
          </div>
        ) : (
          Object.entries(messageGroups).map(([date, msgs]) => (
            <div key={date} className="message-date-group">
              <div className="date-divider">
                <span>{formatDateDivider(msgs[0].sent_at)}</span>
              </div>
              
              {msgs.map((msg, index) => {
                const isOwnMessage = msg.user_id === currentUserId;
                const showSender = index === 0 || msgs[index - 1].user_id !== msg.user_id;
                
                return (
                  <div
                    key={msg.message_id}
                    className={`message ${isOwnMessage ? 'message-sent' : 'message-received'}`}
                  >
                    {!isOwnMessage && showSender && (
                      <div className="message-sender">{msg.first_name}</div>
                    )}
                    <div className="message-bubble">
                      <p>{msg.message}</p>
                      <span className="message-time">{formatMessageTime(msg.sent_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chatroom-input">
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyPress={handleKeyPress}
          className="message-input"
        />
        <button 
          onClick={sendMessage}
          disabled={!messageText.trim()}
          className="send-btn"
        >
          <FaPaperPlane />
        </button>
      </div>
    </div>
  );
};

export default ChatRoom;

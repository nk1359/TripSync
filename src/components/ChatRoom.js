import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FaArrowLeft, FaPaperPlane, FaUserPlus, FaEllipsisV } from 'react-icons/fa';
import './styles/ChatRoom.css';

const ChatRoom = ({ groupId, groupName, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const currentUsername = currentUser.username;
  const currentUserId = currentUser.user_id;
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const optionsRef = useRef(null);

  useEffect(() => {
    setIsLoading(true);
    axios
      .get(`http://localhost:5000/api/group_messages/${groupId}?user_id=${currentUserId}`)
      .then((res) => {
        setMessages(res.data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching messages:", err.response?.data || err.message);
        setIsLoading(false);
      });
      
    // Focus input after loading
    setTimeout(() => {
      inputRef.current?.focus();
    }, 300);
    
    // Close options dropdown when clicking outside
    const handleClickOutside = (event) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target)) {
        setShowOptions(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [groupId, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!messageText.trim()) return;

    // Optimistically update UI
    const newMessage = { 
      sender: currentUsername, 
      message: messageText.trim(),
      timestamp: new Date().toISOString() 
    };
    
    setMessages([...messages, newMessage]);
    setMessageText('');

    // Then send to server
    axios
      .post('http://localhost:5000/api/send_message', {
        group_id: groupId,
        sender: currentUsername,
        message: messageText.trim(),
      })
      .catch((err) => {
        console.error("Error sending message:", err.response?.data || err.message);
        alert('Failed to send message. Please try again.');
      });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Calculate message size class based on content length
  const getMessageSizeClass = (content) => {
    if (!content) return '';
    
    const length = content.length;
    if (length <= 10) return 'message-xs';
    if (length <= 30) return 'message-sm';
    if (length <= 100) return 'message-md';
    if (length <= 300) return 'message-lg';
    return 'message-xl';
  };

  // Format timestamp for display
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Format date for message groups
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };
  
  // Group messages by date
  const groupMessagesByDate = () => {
    const groups = {};
    let currentDate = '';
    
    messages.forEach(msg => {
      const msgDate = msg.timestamp ? new Date(msg.timestamp).toDateString() : '';
      
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups[currentDate] = [];
      }
      
      groups[currentDate].push(msg);
    });
    
    return groups;
  };

  const messageGroups = groupMessagesByDate();

  return (
    <div className="chat-room">
      <div className="chat-header">
        <button className="back-button" onClick={onBack} aria-label="Back to chat list">
          <FaArrowLeft />
        </button>
        <h2>{groupName}</h2>
        <div className="header-actions" ref={optionsRef}>
          <button 
            className="options-button" 
            onClick={() => setShowOptions(!showOptions)}
            aria-label="Chat options"
          >
            <FaEllipsisV />
          </button>
          {showOptions && (
            <div className="options-dropdown">
              <button className="option-item">
                <FaUserPlus /> Add Members
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="messages-container">
        {isLoading ? (
          <div className="loading-messages">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="no-messages">
            <div className="welcome-message">
              <h3>Welcome to {groupName}!</h3>
              <p>No messages yet. Be the first to send a message!</p>
            </div>
          </div>
        ) : (
          Object.entries(messageGroups).map(([date, msgs]) => (
            <div key={date} className="message-group">
              <div className="date-divider">
                <span>{formatDate(msgs[0].timestamp)}</span>
              </div>
              
              {msgs.map((msg, index) => {
                const isSent = msg.sender === currentUsername;
                
                // Check if this is a consecutive message from the same sender
                const isConsecutive = index > 0 && msgs[index - 1].sender === msg.sender;
                
                // Get message size class based on content length
                const sizeClass = getMessageSizeClass(msg.message);
                
                return (
                  <div
                    key={index}
                    className={`message ${isSent ? 'sent' : 'received'} ${isConsecutive ? 'consecutive' : ''} ${sizeClass}`}
                  >
                    <div className="message-content">
                      {!isSent && !isConsecutive && <span className="sender-name">{msg.sender}</span>}
                      <p>{msg.message}</p>
                      <span className="message-time">{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
        <input
          type="text"
          placeholder="Type a message..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="message-input"
          ref={inputRef}
          aria-label="Message input"
        />
        <button 
          onClick={sendMessage} 
          className="send-button"
          disabled={!messageText.trim()}
          aria-label="Send message"
        >
          <FaPaperPlane />
        </button>
      </div>
    </div>
  );
};

export default ChatRoom;
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaComments, FaTimes, FaMinus, FaPaperPlane, FaChevronUp } from 'react-icons/fa';
import './styles/FloatingChat.css';

const FloatingChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [openChatWindows, setOpenChatWindows] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};

  useEffect(() => {
    if (currentUser.user_id) {
      fetchChats();
      // Poll for new messages every 10 seconds
      const interval = setInterval(fetchChats, 10000);
      return () => clearInterval(interval);
    }
  }, [currentUser.user_id]);

  const fetchChats = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/chats/user/${currentUser.user_id}`);
      console.log('[FLOATING-CHAT] Fetched chats:', response.data);
      setChats(response.data.chats || []);
    } catch (error) {
      console.error('[FLOATING-CHAT] Error fetching chats:', error);
    }
  };

  const openChat = (chat) => {
    // Don't open if already open
    if (openChatWindows.find(c => c.group_id === chat.group_id)) return;
    
    // Limit to 3 chat windows
    if (openChatWindows.length >= 3) {
      setOpenChatWindows(prev => [...prev.slice(1), { ...chat, minimized: false }]);
    } else {
      setOpenChatWindows(prev => [...prev, { ...chat, minimized: false }]);
    }
  };

  const closeChat = (groupId) => {
    setOpenChatWindows(prev => prev.filter(c => c.group_id !== groupId));
  };

  const toggleMinimize = (groupId) => {
    setOpenChatWindows(prev => prev.map(c => 
      c.group_id === groupId ? { ...c, minimized: !c.minimized } : c
    ));
  };

  const filteredChats = chats.filter(chat => 
    chat.group_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Floating Chat Button */}
      <div className={`floating-chat-toggle ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <FaComments />
        {chats.some(chat => chat.unread_count > 0) && <span className="chat-notification-badge"></span>}
      </div>

      {/* Chat List Panel */}
      {isOpen && (
        <div className="floating-chat-panel">
          <div className="chat-panel-header">
            <h3>Messages</h3>
            <button onClick={() => setIsOpen(false)} className="close-panel-btn">
              <FaTimes />
            </button>
          </div>

          <div className="chat-search">
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="chat-list">
            {filteredChats.length > 0 ? (
              filteredChats.map(chat => (
                <div
                  key={chat.group_id}
                  className="chat-list-item"
                  onClick={() => openChat(chat)}
                >
                  <div className="chat-avatar">
                    {chat.group_name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="chat-info">
                    <div className="chat-name">{chat.group_name}</div>
                    {chat.last_message && (
                      <div className="chat-preview">{chat.last_message}</div>
                    )}
                  </div>
                  {chat.unread_count > 0 && (
                    <div className="unread-badge">{chat.unread_count}</div>
                  )}
                </div>
              ))
            ) : (
              <div className="no-chats">No chats found</div>
            )}
          </div>
        </div>
      )}

      {/* Chat Windows */}
      <div className="chat-windows-container">
        {openChatWindows.map((chat, index) => (
          <ChatWindow
            key={chat.group_id}
            chat={chat}
            index={index}
            onClose={() => closeChat(chat.group_id)}
            onToggleMinimize={() => toggleMinimize(chat.group_id)}
            currentUserId={currentUser.user_id}
          />
        ))}
      </div>
    </>
  );
};

const ChatWindow = ({ chat, index, onClose, onToggleMinimize, currentUserId }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [chat.group_id]);

  const fetchMessages = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/messages/group/${chat.group_id}`);
      setMessages(response.data.messages || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setLoading(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      await axios.post('http://localhost:5000/api/messages', {
        group_id: chat.group_id,
        sender_id: currentUserId,
        message_text: newMessage
      });
      setNewMessage('');
      fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  return (
    <div 
      className={`chat-window ${chat.minimized ? 'minimized' : ''}`}
      style={{ right: `${20 + (index * 330)}px` }}
    >
      <div className="chat-window-header">
        <div className="chat-window-title">{chat.group_name}</div>
        <div className="chat-window-actions">
          <button onClick={onToggleMinimize} className="minimize-btn">
            {chat.minimized ? <FaChevronUp /> : <FaMinus />}
          </button>
          <button onClick={onClose} className="close-btn">
            <FaTimes />
          </button>
        </div>
      </div>

      {!chat.minimized && (
        <>
          <div className="chat-window-messages">
            {loading ? (
              <div className="chat-loading">Loading...</div>
            ) : messages.length > 0 ? (
              messages.map(msg => (
                <div
                  key={msg.message_id}
                  className={`chat-message ${msg.sender_id === currentUserId ? 'own' : 'other'}`}
                >
                  <div className="message-sender">{msg.sender_username}</div>
                  <div className="message-text">{msg.message_text}</div>
                  <div className="message-time">
                    {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-messages">No messages yet</div>
            )}
          </div>

          <form className="chat-window-input" onSubmit={sendMessage}>
            <input
              type="text"
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button type="submit">
              <FaPaperPlane />
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default FloatingChat;


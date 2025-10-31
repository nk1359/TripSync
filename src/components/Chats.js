import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { FaComments, FaUsers, FaSearch, FaArrowLeft, FaPaperPlane } from 'react-icons/fa';
import Layout from './Layout';
import './styles/Chats.css';
import API_URL from '../config';

const Chats = () => {
  const { chatId, type } = useParams();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [directChats, setDirectChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  
  // Current chat state (when viewing individual chat)
  const [currentChat, setCurrentChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const currentUserId = currentUser.user_id;
  
  const messagesEndRef = React.useRef(null);

  // Cache helper functions
  const getCachedMessages = (chatId, type) => {
    try {
      const cacheKey = `chat_messages_${chatId}_${type}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (!cached) return null;
      
      const { messages, timestamp } = JSON.parse(cached);
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      // Check if cache is still valid (within 5 minutes)
      if (now - timestamp < fiveMinutes) {
        return messages;
      } else {
        // Cache expired, remove it
        sessionStorage.removeItem(cacheKey);
        return null;
      }
    } catch (error) {
      console.error('Error reading from cache:', error);
      return null;
    }
  };

  const setCachedMessages = (chatId, type, messages) => {
    try {
      const cacheKey = `chat_messages_${chatId}_${type}`;
      const cacheData = {
        messages,
        timestamp: Date.now()
      };
      sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error writing to cache:', error);
    }
  };

  const clearCachedMessages = (chatId, type) => {
    try {
      const cacheKey = `chat_messages_${chatId}_${type}`;
      sessionStorage.removeItem(cacheKey);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  };

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth <= 768;
      const userAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(width || userAgent);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch chats on mount
  useEffect(() => {
    if (!currentUserId) {
      navigate('/login');
      return;
    }
    
    fetchChats();
    fetchDirectChats();
    
    const interval = setInterval(() => {
      fetchChats();
      fetchDirectChats();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [currentUserId, navigate]);

  // Load individual chat when chatId or type changes
  useEffect(() => {
    if (chatId && type && (chats.length > 0 || directChats.length > 0)) {
      loadChatFromRoute();
    } else if (!chatId) {
      setCurrentChat(null);
      setMessages([]);
    }
  }, [chatId, type, chats.length, directChats.length]);

  // Auto-scroll only on initial load or when user sends a message
  const shouldAutoScroll = React.useRef(true);
  
  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      shouldAutoScroll.current = false;
    }
  }, [messages]);

  // Poll messages when viewing a chat
  useEffect(() => {
    if (currentChat) {
      const interval = setInterval(fetchCurrentChatMessages, 3000);
      return () => clearInterval(interval);
    }
  }, [currentChat]);

  // Listen for openChat event from notifications
  useEffect(() => {
    const handleOpenChat = (event) => {
      const { chat_id, chat_type, chat_name, is_direct } = event.detail;
      navigate(`/chat/${chat_type}/${chat_id}`);
    };

    window.addEventListener('openChat', handleOpenChat);
    return () => window.removeEventListener('openChat', handleOpenChat);
  }, [navigate]);

  const loadChatFromRoute = () => {
    if (!type || !chatId) return;
    
    // Find chat in our existing lists to get the name
    let chatData = null;
    
    if (type === 'group') {
      chatData = chats.find(c => c.chat_id === parseInt(chatId));
      setCurrentChat({
        chat_id: chatId,
        chat_name: chatData?.chat_name || chatData?.trip_name || 'Group Chat',
        chat_type: 'group',
        is_direct: false
      });
    } else if (type === 'direct') {
      chatData = directChats.find(c => c.chat_id === parseInt(chatId));
      setCurrentChat({
        chat_id: chatId,
        chat_name: chatData?.chat_name || 'Direct Chat',
        chat_type: 'direct',
        is_direct: true
      });
    }
    
    // Enable auto-scroll for initial load
    shouldAutoScroll.current = true;
    
    // Check cache immediately for faster loading
    const chatType = type === 'group' ? 'group' : 'direct';
    const cachedMessages = getCachedMessages(chatId, chatType);
    if (cachedMessages) {
      setMessages(cachedMessages);
      setLoadingMessages(false);
    } else {
      setLoadingMessages(true);
    }
    
    // Fetch messages (will use cache if available)
    fetchCurrentChatMessages();
  };

  const fetchChats = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/chats/user/${currentUserId}`);
      setChats(response.data.chats || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching chats:', error);
      setLoading(false);
    }
  };

  const fetchDirectChats = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/chats/direct/user/${currentUserId}`);
      setDirectChats(response.data.chats || []);
    } catch (error) {
      console.error('Error fetching direct chats:', error);
    }
  };

  const fetchCurrentChatMessages = async () => {
    if (!currentChat) return;
    
    const chatType = currentChat.is_direct ? 'direct' : 'group';
    
    // Check cache first
    const cachedMessages = getCachedMessages(currentChat.chat_id, chatType);
    if (cachedMessages) {
      setMessages(cachedMessages);
      setLoadingMessages(false);
      return;
    }
    
    // No cache or expired, show skeleton loading
    setLoadingMessages(true);
    
    try {
      const endpoint = currentChat.is_direct 
        ? `${API_URL}/api/chats/direct/${currentChat.chat_id}/messages?user_id=${currentUserId}`
        : `${API_URL}/api/chats/${currentChat.chat_id}/messages?user_id=${currentUserId}`;
      
      const response = await axios.get(endpoint);
      const messages = response.data.messages || [];
      
      setMessages(messages);
      setLoadingMessages(false);
      
      // Cache the messages
      setCachedMessages(currentChat.chat_id, chatType, messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setLoadingMessages(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !currentChat) return;

    // Keep the message exactly as typed (preserve newlines)
    const messageContent = messageText;
    
    // Store the message content and clear input immediately
    setMessageText('');
    
    // Reset textarea height
    const textarea = document.querySelector('.chat-input');
    if (textarea) {
      textarea.style.height = 'auto';
    }
    
    // Enable auto-scroll when user sends a message
    shouldAutoScroll.current = true;

    try {
      const endpoint = currentChat.is_direct
        ? `${API_URL}/api/chats/direct/${currentChat.chat_id}/messages`
        : `${API_URL}/api/chats/${currentChat.chat_id}/messages`;
      
      const response = await axios.post(endpoint, {
        sender_id: currentUserId,
        message_content: messageContent
      });
      
      // Clear cache after sending message to ensure fresh data
      const chatType = currentChat.is_direct ? 'direct' : 'group';
      clearCachedMessages(currentChat.chat_id, chatType);
      
      // Fetch fresh messages with correct server timestamps
      fetchCurrentChatMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      // Restore the message text if sending failed
      setMessageText(messageContent);
      fetchCurrentChatMessages();
    }
  };


  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    // Parse the timestamp - handle different formats
    let date;
    if (typeof timestamp === 'string') {
      // Handle different string formats
      if (timestamp.includes('GMT')) {
        // GMT format (e.g., "Wed, 22 Oct 2025 15:15:15 GMT")
        // Remove GMT and treat as local time to avoid timezone conversion
        const localTimestamp = timestamp.replace(' GMT', '');
        date = new Date(localTimestamp);
      } else if (timestamp.includes('T')) {
        // ISO string format (e.g., "2024-01-15T15:15:00Z" or "2025-10-22T15:15:15")
        date = new Date(timestamp);
      } else {
        // Try parsing as Unix timestamp string
        const numTimestamp = parseInt(timestamp);
        if (!isNaN(numTimestamp)) {
          // Check if it's seconds or milliseconds
          if (numTimestamp < 10000000000) {
            // Unix timestamp in seconds
            date = new Date(numTimestamp * 1000);
          } else {
            // Unix timestamp in milliseconds
            date = new Date(numTimestamp);
          }
        } else {
          date = new Date(timestamp);
        }
      }
    } else if (typeof timestamp === 'number') {
      // Handle Unix timestamp (check if seconds or milliseconds)
      if (timestamp < 10000000000) {
        // Unix timestamp in seconds
        date = new Date(timestamp * 1000);
      } else {
        // Unix timestamp in milliseconds
        date = new Date(timestamp);
      }
    } else {
      date = new Date(timestamp);
    }
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return '';
    }
    
    const now = new Date();
    const diff = now - date;
    
    // Format the time based on how recent it is
    if (diff < 86400000) { // Less than 24 hours
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 604800000) { // Less than 7 days
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // MessageSkeleton component for loading state
  const MessageSkeleton = () => {
    const skeletonMessages = [
      { isOwn: false, lines: 1 },
      { isOwn: true, lines: 2 },
      { isOwn: false, lines: 1 },
      { isOwn: true, lines: 1 },
      { isOwn: false, lines: 3 },
      { isOwn: true, lines: 1 },
      { isOwn: false, lines: 2 }
    ];

    return (
      <>
        {skeletonMessages.map((msg, index) => (
          <div
            key={index}
            className={`message-skeleton ${msg.isOwn ? 'own' : 'other'}`}
          >
            {!msg.isOwn && (
              <div className="skeleton-sender"></div>
            )}
            <div className="skeleton-bubble">
              {Array.from({ length: msg.lines }).map((_, lineIndex) => (
                <div
                  key={lineIndex}
                  className={`skeleton-line ${lineIndex === msg.lines - 1 ? 'short' : ''}`}
                ></div>
              ))}
            </div>
            <div className="skeleton-time"></div>
          </div>
        ))}
      </>
    );
  };

  // Combine and sort chats
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

  // Calculate total unread count
  const totalUnreadCount = allChats.reduce((total, chat) => {
    return total + (chat.unread_count || 0);
  }, 0);

  // Chat List View
  if (!currentChat) {
    return (
      <Layout>
        <div className="chats-page">
          <div className="chats-search">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="chats-section-label">
            Messages
            {isMobile && totalUnreadCount > 0 && (
              <span className="unread-count-badge">{totalUnreadCount}</span>
            )}
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
                  onClick={() => navigate(`/chat/${chat.chat_type}/${chat.chat_id}`)}
                >
                  <div className="chat-avatar">
                    {chat.chat_type === 'group' ? (
                      <FaUsers />
                    ) : (
                      (chat.chat_name || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="chat-info">
                    <div className="chat-name">{chat.chat_name || chat.trip_name}</div>
                    {chat.last_message && (
                      <div className="chat-preview">{chat.last_message}</div>
                    )}
                  </div>
                  <div className="chat-meta">
                    {chat.last_message_time && (
                      <div className="chat-time">{formatTime(chat.last_message_time)}</div>
                    )}
                    {chat.unread_count > 0 && (
                      <div className="unread-badge">{chat.unread_count}</div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-chats">
                <FaComments className="no-chats-icon" />
                {searchQuery.trim() ? (
                  <>
                    <h3>No results found</h3>
                    <p>Try searching with a different name</p>
                  </>
                ) : (
                  <>
                    <h3>No chats yet</h3>
                    <p>Create a trip or start a conversation with a friend</p>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </Layout>
    );
  }

  // Individual Chat View
  const chatContent = (
    <div className="chat-page-container">
      <div className="chat-page-header">
        <button className="back-btn" onClick={() => navigate('/chats')}>
          {isMobile ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          ) : <FaArrowLeft />}
        </button>
        <div className="chat-header-avatar">
          {currentChat?.chat_type === 'group' ? (
            <FaUsers />
          ) : (
            (currentChat?.chat_name || 'U').charAt(0).toUpperCase()
          )}
        </div>
        <h2 className="chat-title">{currentChat?.chat_name || 'Chat'}</h2>
        <div className="header-spacer"></div>
      </div>

      <div className="chat-messages-container">
        {loadingMessages && messages.length === 0 ? (
          <MessageSkeleton />
        ) : messages.length > 0 ? (
          messages.map((msg) => (
            <div
              key={msg.message_id}
              className={`chat-message ${msg.sender_id === currentUserId ? 'own' : 'other'}`}
            >
              {msg.sender_id !== currentUserId && (
                <div className="message-sender-avatar">
                  {(msg.sender_first_name || msg.sender_username || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="message-content">
                {msg.sender_id !== currentUserId && currentChat?.chat_type === 'group' && (
                  <div className="message-sender">{msg.sender_username || msg.sender_first_name}</div>
                )}
                <div className="message-text">
                  {msg.message_content}
                </div>
                <div className="message-time">
                  {formatTime(msg.sent_at)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="no-messages">
            <FaComments />
            <p>No messages yet. Start the conversation!</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-container" onSubmit={sendMessage}>
        <textarea
          placeholder="Type a message..."
          value={messageText}
          onChange={(e) => {
            setMessageText(e.target.value);
            // Auto-resize textarea
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(e);
            }
          }}
          className="chat-input"
          rows="1"
        />
        <button type="submit" className="send-btn" disabled={!messageText.trim()}>
          <FaPaperPlane />
        </button>
      </form>
    </div>
  );
  
  // Mobile: Full-screen without Layout
  if (isMobile) {
    return chatContent;
  }
  
  // Desktop: With Layout
  return <Layout>{chatContent}</Layout>;
};

export default Chats;

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { FaArrowLeft, FaPaperPlane, FaUsers } from 'react-icons/fa';
import { useToast } from './ToastContext';
import Layout from './Layout';
import useIsMobile from '../hooks/useIsMobile';
import './styles/ChatRoom.css';
import API_URL from '../config';
import { useSwipeable } from 'react-swipeable';

const ChatRoom = () => {
  const { showToast } = useToast();
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [chatInfo, setChatInfo] = useState(null);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const shouldScrollRef = useRef(true); // Track if we should auto-scroll
  
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const currentUserId = currentUser.user_id;
  const chatType = searchParams.get('type') || 'group';
  const isDirect = chatType === 'direct';

  useEffect(() => {
    if (!currentUserId) {
      navigate('/login');
      return;
    }
    fetchChatInfo();
    shouldScrollRef.current = true; // Scroll on initial load
    fetchMessages(true); // Show loading only on initial load
    inputRef.current?.focus();
    
    // Poll for new messages (without showing loading spinner)
    const interval = setInterval(() => fetchMessages(false), 3000);
    return () => clearInterval(interval);
  }, [groupId, currentUserId]);

  useEffect(() => {
    if (shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      shouldScrollRef.current = false; // Reset the flag after scrolling
    }
  }, [messages]);

  const fetchChatInfo = async () => {
    try {
      if (isDirect) {
        // For direct chats, we don't need to fetch chat info separately
        // The chat info comes from the direct chats list
        setChatInfo({
          chat_name: 'Direct Message',
          trip_name: 'Direct Message',
          member_count: null
        });
      } else {
        // For group chats, we need to get the trip info
        // Since there's no groups endpoint, we'll use the trip endpoint
        try {
          const response = await axios.get(`${API_URL}/api/trips/${groupId}`);
          setChatInfo({
            trip_name: response.data.trip_name || 'Unknown Chat',
            chat_name: response.data.trip_name || 'Unknown Chat',
            member_count: response.data.member_count
          });
        } catch (groupError) {
          // Fallback: Set basic chat info without making another API call
          console.warn('Could not fetch trip info, using fallback');
          setChatInfo({
            chat_name: 'Group Chat',
            trip_name: 'Group Chat',
            member_count: null
          });
        }
      }
    } catch (error) {
      console.error("Error fetching chat info:", error);
      // Set fallback chat info to allow chat to still work
      setChatInfo({
        chat_name: isDirect ? 'Direct Message' : 'Group Chat',
        trip_name: isDirect ? 'Direct Message' : 'Group Chat',
        member_count: null
      });
    }
  };

  const fetchMessages = async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const endpoint = isDirect 
        ? `${API_URL}/api/chats/direct/${groupId}/messages?user_id=${currentUserId}`
        : `${API_URL}/api/chats/${groupId}/messages?user_id=${currentUserId}`;
      
      const response = await axios.get(endpoint);
      console.log('[ChatRoom] Fetched messages:', response.data.messages);
      console.log('[ChatRoom] First message sample:', response.data.messages?.[0]);
      setMessages(response.data.messages || []);
      
      // If chat info is provided in the response (for direct chats), update it
      if (response.data.chat_info) {
        setChatInfo(response.data.chat_info);
      }
      
      if (showLoading) {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      if (showLoading) {
        setLoading(false);
      }
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
    shouldScrollRef.current = true; // Scroll when user sends a message

    try {
      const endpoint = isDirect
        ? `${API_URL}/api/chats/direct/${groupId}/messages`
        : `${API_URL}/api/chats/${groupId}/messages`;
      
      await axios.post(endpoint, {
        sender_id: currentUserId,
        user_id: currentUserId,
        message: tempMessage.message,
        message_content: tempMessage.message
      });
      fetchMessages();
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

  // Swipe handler for mobile - swipe right to go back
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => {
      if (isMobile) {
        navigate('/chats');
      }
    },
    preventDefaultTouchmoveEvent: false,
    trackMouse: false,
    delta: 50 // Require at least 50px swipe
  });

  const chatContent = (
    <div {...(isMobile ? swipeHandlers : {})} className={`chatroom-container ${isMobile ? 'mobile-chatroom' : ''}`}>
      <div className="chatroom-header">
        <button className="back-btn" onClick={() => navigate('/chats')}>
          <FaArrowLeft />
        </button>
        <div className="chatroom-info">
          <h2>{chatInfo?.trip_name || chatInfo?.chat_name || 'Chat'}</h2>
          {!isDirect && chatInfo?.member_count && (
            <p className="chatroom-members">
              <FaUsers />
              {chatInfo.member_count} members
            </p>
          )}
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
                
                if (index === 0) {
                  console.log('[ChatRoom] Rendering message:', {
                    message_id: msg.message_id,
                    message: msg.message,
                    user_id: msg.user_id,
                    sent_at: msg.sent_at
                  });
                }
                
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

  // On mobile, hide navbar when viewing individual chat
  if (isMobile) {
    return (
      <Layout hideNavbar={true}>
        {chatContent}
      </Layout>
    );
  }

  // On desktop, show navbar
  return (
    <Layout>
      {chatContent}
    </Layout>
  );
};

export default ChatRoom;

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaComments, FaTimes, FaMinus, FaPaperPlane, FaChevronUp, FaUser } from 'react-icons/fa';
import './styles/FloatingChat.css';

const FloatingChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [friends, setFriends] = useState([]);
  const [directChats, setDirectChats] = useState([]);
  const [openChatWindows, setOpenChatWindows] = useState(() => {
    // Load persisted chat windows from sessionStorage
    const savedChats = sessionStorage.getItem('openChatWindows');
    if (savedChats) {
      const chats = JSON.parse(savedChats);
      // Mark restored chats to skip animation
      return chats.map(chat => ({ ...chat, isRestored: true }));
    }
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};

  useEffect(() => {
    if (currentUser.user_id) {
      fetchChats();
      fetchDirectChats();
      fetchFriends();
      const chatInterval = setInterval(() => {
        fetchChats();
        fetchDirectChats();
      }, 10000);
      const friendsInterval = setInterval(fetchFriends, 30000);
      
      // Listen for custom event to open chat from other components
      const handleOpenChat = (event) => {
        const { chat_id, chat_name, is_direct } = event.detail;
        openChat({ chat_id, chat_name, is_direct });
        setIsOpen(false); // Close the chat list panel
      };
      
      // Listen for refresh event
      const handleRefreshChats = () => {
        fetchChats();
        fetchDirectChats();
      };
      
      window.addEventListener('openChat', handleOpenChat);
      window.addEventListener('refreshChats', handleRefreshChats);
      
      return () => {
        clearInterval(chatInterval);
        clearInterval(friendsInterval);
        window.removeEventListener('openChat', handleOpenChat);
        window.removeEventListener('refreshChats', handleRefreshChats);
      };
    }
  }, [currentUser.user_id]);

  // Clear isRestored flag after first render
  useEffect(() => {
    const hasRestoredChats = openChatWindows.some(chat => chat.isRestored);
    if (hasRestoredChats) {
      // Wait for next tick to clear the flag (after CSS has been applied)
      setTimeout(() => {
        setOpenChatWindows(prev => prev.map(chat => {
          const { isRestored, ...rest } = chat;
          return rest;
        }));
      }, 50);
    }
  }, []); // Run only once on mount

  // Persist open chat windows to sessionStorage
  useEffect(() => {
    if (openChatWindows.length > 0) {
      // Remove isRestored flag before saving
      const chatsToSave = openChatWindows.map(({ isRestored, ...chat }) => chat);
      sessionStorage.setItem('openChatWindows', JSON.stringify(chatsToSave));
      console.log('[FLOATING-CHAT] Persisted chat windows:', chatsToSave);
    } else {
      sessionStorage.removeItem('openChatWindows');
    }
  }, [openChatWindows]);

  const fetchChats = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/chats/user/${currentUser.user_id}`);
      console.log('[FLOATING-CHAT] Fetched chats:', response.data);
      setChats(response.data.chats || []);
    } catch (error) {
      console.error('[FLOATING-CHAT] Error fetching chats:', error);
    }
  };

  const fetchDirectChats = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/chats/direct/user/${currentUser.user_id}?include_archived=${showArchived}`);
      console.log('[FLOATING-CHAT] Fetched direct chats:', response.data);
      setDirectChats(response.data.chats || []);
    } catch (error) {
      console.error('[FLOATING-CHAT] Error fetching direct chats:', error);
    }
  };

  const fetchFriends = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/friends/${currentUser.user_id}`);
      console.log('[FLOATING-CHAT] Fetched friends:', response.data);
      setFriends(response.data.friends || []);
    } catch (error) {
      console.error('[FLOATING-CHAT] Error fetching friends:', error);
    }
  };

  const archiveChat = async (chatId, chatType) => {
    try {
      await axios.post(`http://localhost:5000/api/chats/${chatType}/${chatId}/archive`, {
        user_id: currentUser.user_id
      });
      if (chatType === 'direct') {
        fetchDirectChats();
      } else {
        fetchChats();
      }
    } catch (error) {
      console.error('Error archiving chat:', error);
    }
  };

  const openChat = (chat) => {
    // Don't open if already open
    if (openChatWindows.find(c => c.chat_id === chat.chat_id)) return;
    
    // Close the chat list
    setIsOpen(false);
    
    // Ensure is_direct flag is set correctly
    const chatWithFlag = {
      ...chat,
      is_direct: chat.is_direct || chat.chat_type === 'direct',
      minimized: false
    };
    
    // Limit to 3 chat windows
    if (openChatWindows.length >= 3) {
      setOpenChatWindows(prev => [...prev.slice(1), chatWithFlag]);
    } else {
      setOpenChatWindows(prev => [...prev, chatWithFlag]);
    }
  };

  const createDirectChat = async (friend) => {
    try {
      // Check if chat already exists in direct chats
      const existingChat = directChats.find(chat => 
        chat.chat_name === `${friend.first_name} ${friend.last_name}`
      );
      
      if (existingChat) {
        openChat({ ...existingChat, is_direct: true });
        return;
      }

      // Create new direct chat
      const response = await axios.post('http://localhost:5000/api/chats/direct', {
        user_id: currentUser.user_id,
        friend_id: friend.user_id
      });

      if (response.data.chat_id) {
        // Fetch updated direct chats and open the new one
        await fetchDirectChats();
        const newChat = {
          chat_id: response.data.chat_id,
          chat_name: response.data.chat_name,
          is_direct: true
        };
        openChat(newChat);
      }
    } catch (error) {
      console.error('Error creating direct chat:', error);
    }
  };

  const closeChat = (chatId) => {
    setOpenChatWindows(prev => prev.filter(c => c.chat_id !== chatId));
  };

  const toggleMinimize = (chatId) => {
    setOpenChatWindows(prev => prev.map(c => 
      c.chat_id === chatId ? { ...c, minimized: !c.minimized } : c
    ));
  };

  // Combine all chats and calculate total unread
  const allChats = [
    ...chats.map(c => ({ ...c, chat_type: 'group' })),
    ...directChats.map(c => ({ ...c, chat_type: 'direct' }))
  ].sort((a, b) => {
    const timeA = new Date(a.last_message_time || a.created_at || 0);
    const timeB = new Date(b.last_message_time || b.created_at || 0);
    return timeB - timeA;
  });

  const totalUnread = allChats.reduce((sum, chat) => sum + (chat.unread_count || 0), 0);

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
    <>
      {/* Floating Chat Button */}
      <div className={`floating-chat-toggle ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <FaComments />
        {totalUnread > 0 && <span className="chat-notification-badge">{totalUnread}</span>}
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
              placeholder="Search chats or people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="chat-list">
            {/* All Chats (Group + Direct) */}
            {filteredChats.length > 0 ? (
              filteredChats.map(chat => (
                <div
                  key={`${chat.chat_type}-${chat.chat_id}`}
                  className="chat-list-item"
                  onClick={() => openChat(chat)}
                >
                  <div className="chat-avatar">
                    {(chat.chat_name || chat.trip_name)?.charAt(0).toUpperCase()}
                  </div>
                  <div className="chat-info">
                    <div className="chat-name">{chat.chat_name || chat.trip_name}</div>
                    {chat.last_message && (
                      <div className="chat-preview">{chat.last_message}</div>
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
                    className="chat-list-item friend-item"
                    onClick={() => createDirectChat(friend)}
                  >
                    <div className="chat-avatar friend-avatar">
                      {friend.first_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="chat-info">
                      <div className="chat-name">{friend.first_name} {friend.last_name}</div>
                      <div className="chat-preview">Start a conversation</div>
                    </div>
                    <div className="message-icon">
                      <FaComments />
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="no-chats">
                {searchQuery ? 'No results found' : 'No messages yet'}
                {!searchQuery && (
                  <p className="no-chats-hint">Search for friends to start chatting</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Windows */}
      <div className={`chat-windows-container ${isOpen ? 'panel-open' : ''}`}>
        {openChatWindows.map((chat, index) => (
          <ChatWindow
            key={chat.chat_id}
            chat={chat}
            index={index}
            onClose={() => closeChat(chat.chat_id)}
            onToggleMinimize={() => toggleMinimize(chat.chat_id)}
            currentUserId={currentUser.user_id}
            isRestored={chat.isRestored}
          />
        ))}
      </div>
    </>
  );
};

const ChatWindow = ({ chat, index, onClose, onToggleMinimize, currentUserId, isRestored }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [unreadMessageId, setUnreadMessageId] = useState(null);
  const messagesEndRef = React.useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [chat.chat_id]);

  const fetchMessages = async () => {
    try {
      const endpoint = chat.is_direct 
        ? `http://localhost:5000/api/chats/direct/${chat.chat_id}/messages?user_id=${currentUserId}`
        : `http://localhost:5000/api/chats/${chat.chat_id}/messages?user_id=${currentUserId}`;
      
      const response = await axios.get(endpoint);
      const fetchedMessages = response.data.messages || [];
      
      // Track the first unread message (if we're fetching for the first time)
      if (messages.length === 0 && fetchedMessages.length > 0 && chat.unread_count > 0) {
        const unreadIndex = Math.max(0, fetchedMessages.length - chat.unread_count);
        if (unreadIndex < fetchedMessages.length) {
          setUnreadMessageId(fetchedMessages[unreadIndex].message_id);
        }
      }
      
      setMessages(fetchedMessages);
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
      const endpoint = chat.is_direct
        ? `http://localhost:5000/api/chats/direct/${chat.chat_id}/messages`
        : `http://localhost:5000/api/chats/${chat.chat_id}/messages`;
      
      await axios.post(endpoint, {
        sender_id: currentUserId,
        message_content: newMessage
      });
      setNewMessage('');
      fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  return (
    <div 
      className={`chat-window ${chat.minimized ? 'minimized' : ''} ${isRestored ? 'no-animation' : ''}`}
    >
      <div className="chat-window-header">
        <div className="chat-window-title">{chat.chat_name || chat.trip_name}</div>
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
              <>
                {messages.map((msg, idx) => (
                  <React.Fragment key={msg.message_id}>
                    {unreadMessageId && msg.message_id === unreadMessageId && (
                      <div className="new-messages-divider">
                        <span>New Messages</span>
                      </div>
                    )}
                    <div
                      className={`chat-message ${msg.sender_id === currentUserId ? 'own' : 'other'}`}
                    >
                      <div className="message-sender">{msg.sender_username || msg.sender_first_name}</div>
                      <div className="message-text">{msg.message_content}</div>
                      <div className="message-time">
                        {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </React.Fragment>
                ))}
                <div ref={messagesEndRef} />
              </>
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

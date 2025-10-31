import React, { useState, useEffect, useRef, useContext } from 'react';
import { AuthContext } from './AuthContext';
import { useToast } from './ToastContext';
import { useTripModal } from './TripModalContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FaUser, 
  FaSignOutAlt, 
  FaBars, 
  FaTimes, 
  FaHome, 
  FaCalendarAlt,
  FaComments,
  FaSearch,
  FaCheckCircle,
  FaTimesCircle,
  FaBell,
  FaUserFriends
} from 'react-icons/fa';
import axios from 'axios';
import './styles/Layout.css';
import API_URL from '../config';

const Layout = ({ children }) => {
  const { showTripModal } = useTripModal();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext); 
  const { showToast } = useToast();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Refs for handling outside clicks
  const sidebarRef = useRef(null);
  const menuBtnRef = useRef(null);
  const profileRef = useRef(null);
  const notificationRef = useRef(null);

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Enhanced mobile detection - screen width + device type
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

  // Fetch all notifications
  useEffect(() => {
    if (user?.user_id) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [user]);

  // Fetch unread count for mobile
  useEffect(() => {
    if (user?.user_id && isMobile) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [user, isMobile]);

  const fetchNotifications = () => {
    if (!user?.user_id) return;
    
    axios
      .get(`${API_URL}/api/notifications/${user.user_id}`)
      .then((res) => {
        setNotifications(res.data.notifications || []);
      })
      .catch((err) => console.error('Error fetching notifications:', err));
  };

  // Improved toggle nav function for mobile
  const toggleNav = () => {
    const newNavState = !isNavOpen;
    setIsNavOpen(newNavState);
    
    // Control body scroll when sidebar is open on mobile
    if (isMobile) {
      if (newNavState) {
        document.body.classList.add('sidebar-open');
      } else {
        document.body.classList.remove('sidebar-open');
      }
    }
  };
  
  const handleProfileClick = (e) => {
    e.stopPropagation();
    setDropdownOpen(!dropdownOpen);
    
    // Close notifications if profile dropdown is opened
    if (showNotifications) {
      setShowNotifications(false);
    }
  };

  const handleNotificationBellClick = (e) => {
    e.stopPropagation();
    setShowNotifications(!showNotifications);
    
    // Close profile dropdown if notifications are opened
    if (dropdownOpen) {
      setDropdownOpen(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/');
  };

  // Fetch unread count for mobile bottom nav indicator
  const fetchUnreadCount = async () => {
    if (!user || !isMobile) return;
    
    try {
      const response = await axios.get(`${API_URL}/api/chats/user/${user.user_id}`);
      const chats = response.data.chats || [];
      const directResponse = await axios.get(`${API_URL}/api/chats/direct/user/${user.user_id}`);
      const directChats = directResponse.data.chats || [];
      
      const totalUnread = [...chats, ...directChats].reduce((total, chat) => {
        return total + (chat.unread_count || 0);
      }, 0);
      
      setUnreadCount(totalUnread);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  // Navigation items - show different items based on auth status
  const navItems = user ? [
    { text: "Home", path: "/" },
    { text: "Planner", path: "/planner" },
    { text: "Friends", path: "/friends" }
  ] : [
    { text: "Home", path: "/" }
  ];

  const handleNavigation = (path) => {
    navigate(path);
    if (isMobile) {
      setIsNavOpen(false);
      document.body.classList.remove('sidebar-open');
    }
  };

  // Logo click triggers full page reload
  const handleLogoClick = () => {
    window.location.href = '/';
  };

  // Navigate to Friends page
  const handleAddFriends = () => {
    navigate('/friends');
    setDropdownOpen(false);
  };
  
  // Simple friend search state
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState([]);
  const [friendSearchMessage, setFriendSearchMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Function to perform a friend search
  const handleFriendSearch = () => {
    if (!friendSearchQuery.trim()) {
      setFriendSearchMessage("Please enter a username, first name, or last name.");
      return;
    }
    
    setIsSearching(true);
    setFriendSearchMessage("Searching...");
    
    axios
      .get(`${API_URL}/api/users?search=${encodeURIComponent(friendSearchQuery)}&current_user_id=${user.user_id}`)
      .then((res) => {
        setFriendSearchResults(res.data.users || []);
        setFriendSearchMessage(
          res.data.users && res.data.users.length 
            ? "" 
            : "No users found matching your search."
        );
        setIsSearching(false);
      })
      .catch((err) => {
        console.error(err);
        setFriendSearchMessage("Error searching for users. Please try again.");
        setIsSearching(false);
      });
  };

  // Function to send a friend request
  const sendFriendRequest = (friendId) => {
    if (!user) return;
    
    axios
      .post(`${API_URL}/api/send_friend_request`, {
        user_id: user.user_id,
        friend_id: friendId,
      })
      .then((res) => {
        setFriendSearchMessage(res.data.message || "Friend request sent!");
        
        // Update the friend status in the search results
        setFriendSearchResults(
          friendSearchResults.map(friend => 
            friend.id === friendId 
              ? { ...friend, friendship_status: 'request_sent' } 
              : friend
          )
        );
      })
      .catch((err) => {
        console.error(err);
        setFriendSearchMessage("Error sending friend request. Please try again.");
      });
  };

  // Function to accept a friend request
  const acceptFriendRequest = (requestId) => {
    axios
      .post(`${API_URL}/api/accept_friend_request/${requestId}`, {})
      .then(() => {
        fetchNotifications(); // Refresh notifications
      })
      .catch((err) => {
        console.error(err);
      });
  };

  const rejectFriendRequest = (requestId) => {
    axios
      .post(`${API_URL}/api/reject_friend_request/${requestId}`, {})
      .then(() => {
        fetchNotifications(); // Refresh notifications
      })
      .catch((err) => console.error(err));
  };

  const acceptTripInvitation = (invitationId) => {
    axios
      .post(`${API_URL}/api/trip-invitations/${invitationId}/accept`, {
        user_id: user.user_id
      })
      .then((response) => {
        fetchNotifications(); // Refresh notifications
        const message = response.data?.message || 'Invitation accepted!';
        showToast(message, 'success');
      })
      .catch((err) => {
        console.error(err);
        showToast('Failed to accept invitation', 'error');
      });
  };

  const declineTripInvitation = (invitationId) => {
    axios
      .post(`${API_URL}/api/trip-invitations/${invitationId}/decline`, {
        user_id: user.user_id
      })
      .then(() => {
        fetchNotifications(); // Refresh notifications
        showToast('Invitation declined', 'info');
      })
      .catch((err) => {
        console.error(err);
        showToast('Failed to decline invitation', 'error');
      });
  };

  const handleNotificationClick = (notification) => {
    if (notification.type === 'friend_request') {
      // Already handled by accept/reject buttons
      return;
    } else if (notification.type === 'trip_invitation') {
      // Already handled by accept/decline buttons
      return;
    } else if (notification.type === 'member_request') {
      // Already handled by approve/reject in Manage Members modal
      return;
    } else if (notification.type === 'trip_added') {
      // Mark as read and navigate to planner
      axios.post(`${API_URL}/api/notifications/${notification.notification_id}/read`)
        .then(() => fetchNotifications())
        .catch(err => console.error(err));
      navigate('/planner');
      setShowNotifications(false);
    } else if (notification.type === 'message') {
      // Clear unread count for this chat
      axios.delete(`${API_URL}/api/unread/${user.user_id}/${notification.chat_id}/${notification.chat_type}`)
        .then(() => {
          fetchNotifications(); // Refresh notifications
          // Trigger chat list refresh
          window.dispatchEvent(new CustomEvent('refreshChats'));
        })
        .catch(err => console.error(err));
      
      if (isMobile) {
        // On mobile, navigate to the chat room
        navigate(`/chat/${notification.chat_type}/${notification.chat_id}`);
      } else {
        // On desktop, open the floating chat
        window.dispatchEvent(new CustomEvent('openChat', { 
          detail: { 
            chat_id: notification.chat_id,
            chat_name: notification.chat_name,
            is_direct: notification.chat_type === 'direct'
          } 
        }));
      }
      setShowNotifications(false);
    }
  };

  // Get the appropriate button based on friendship status
  const getFriendActionButton = (friend) => {
    switch (friend.friendship_status) {
      case 'friends':
        return (
          <button disabled className="friend-button friends">
            <FaCheckCircle /> Friends
          </button>
        );
      case 'request_sent':
        return (
          <button disabled className="friend-button pending">
            Request Sent
          </button>
        );
      case 'request_received':
        return (
          <button 
            onClick={() => acceptFriendRequest(friend.request_id)} 
            className="friend-button accept"
          >
            Accept Request
          </button>
        );
      default:
        return (
          <button 
            onClick={() => sendFriendRequest(friend.id)} 
            className="friend-button add"
          >
            <FaUserFriends /> Add Friend
          </button>
        );
    }
  };

  return (
    <div className={`page-wrapper`}>
      <main className="main-section">
        <div className="top-bar">
          <div className="left-area">
            <div className="app-logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
              <img src="/Ravyn-Green.png" alt="TripSync" className="logo-image" />
            </div>
            <div className="logo-separator"></div>
          </div>
          
          <div className="center-area">
            <nav className="top-nav">
              <ul className="nav-list">
                {navItems.map((item, index) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <li key={index} className="nav-item">
                      <div 
                        onClick={() => handleNavigation(item.path)} 
                        className={`nav-link ${isActive ? 'active' : ''}`}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="nav-text">{item.text}</span>
                      </div>
                      {index < navItems.length - 1 && <div className="nav-separator"></div>}
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
          
          <div className="right-area">
            {user ? (
              <>
                {/* Notification Bell - Only for logged-in users */}
                <div 
                  ref={notificationRef}
                  className="notification-bell" 
                  onClick={handleNotificationBellClick}
                >
                  <FaBell />
                  {notifications.length > 0 && (
                    <span className="notification-badge">{notifications.length}</span>
                  )}
                  
                  {showNotifications && (
                    <div className="notification-dropdown">
                      <div className="dropdown-header">
                        <h3>Notifications</h3>
                        <span className="notification-count">{notifications.length}</span>
                      </div>
                      <div className="notification-list">
                        {notifications.length > 0 ? (
                          notifications.map((notification, index) => (
                            <div 
                              key={`${notification.type}-${notification.notification_id || index}`} 
                              className={`notification-item ${notification.type}`}
                              onClick={() => handleNotificationClick(notification)}
                            >
                              <div className="notification-avatar">
                                {notification.type === 'friend_request' && notification.first_name.charAt(0).toUpperCase()}
                                {notification.type === 'trip_invitation' && notification.first_name.charAt(0).toUpperCase()}
                                {notification.type === 'member_request' && notification.first_name.charAt(0).toUpperCase()}
                                {notification.type === 'trip_added' && notification.first_name.charAt(0).toUpperCase()}
                                {notification.type === 'message' && notification.chat_name.charAt(0).toUpperCase()}
                              </div>
                              <div className="notification-content">
                                {notification.type === 'friend_request' && (
                                  <>
                                    <div className="notification-title">
                                      {notification.first_name} {notification.last_name}
                                    </div>
                                    <div className="notification-subtitle">
                                      Sent you a friend request
                                    </div>
                                  </>
                                )}
                                {notification.type === 'trip_invitation' && (
                                  <>
                                    <div className="notification-title">
                                      {notification.message_preview}
                                    </div>
                                    <div className="notification-subtitle">
                                      {notification.first_name} invited you to join this trip
                                    </div>
                                  </>
                                )}
                                {notification.type === 'member_request' && (
                                  <>
                                    <div className="notification-title">
                                      {notification.trip_name}
                                    </div>
                                    <div className="notification-subtitle">
                                      {notification.first_name} wants to add {notification.friend_first_name} to the trip
                                    </div>
                                  </>
                                )}
                                {notification.type === 'trip_added' && (
                                  <>
                                    <div className="notification-title">
                                      {notification.first_name} {notification.last_name}
                                    </div>
                                    <div className="notification-subtitle">
                                      Added you to {notification.message_preview}
                                    </div>
                                  </>
                                )}
                                {notification.type === 'message' && (
                                  <>
                                    <div className="notification-title">
                                      {notification.chat_name}
                                    </div>
                                    <div className="notification-subtitle">
                                      {notification.message_preview}
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="unread-indicator"></div>
                              {notification.type === 'friend_request' && (
                                <div className="notification-actions" onClick={(e) => e.stopPropagation()}>
                                  <button 
                                    className="accept-button" 
                                    onClick={() => acceptFriendRequest(notification.notification_id)}
                                    aria-label="Accept"
                                  >
                                    <FaCheckCircle />
                                  </button>
                                  <button 
                                    className="reject-button"
                                    onClick={() => rejectFriendRequest(notification.notification_id)}
                                    aria-label="Reject"
                                  >
                                    <FaTimesCircle />
                                  </button>
                                </div>
                              )}
                              {notification.type === 'trip_invitation' && (
                                <div className="notification-actions" onClick={(e) => e.stopPropagation()}>
                                  <button 
                                    className="accept-button" 
                                    onClick={() => acceptTripInvitation(notification.notification_id)}
                                    aria-label="Accept"
                                  >
                                    <FaCheckCircle />
                                  </button>
                                  <button 
                                    className="reject-button"
                                    onClick={() => declineTripInvitation(notification.notification_id)}
                                    aria-label="Decline"
                                  >
                                    <FaTimesCircle />
                                  </button>
                                </div>
                              )}
                              {notification.type === 'member_request' && (
                                <div className="notification-actions" onClick={(e) => e.stopPropagation()}>
                                  <button 
                                    className="accept-button" 
                                    onClick={() => {
                                      axios.post(`${API_URL}/api/trips/${notification.trip_id}/member-requests/${notification.notification_id}/approve`, {
                                        user_id: user.user_id
                                      })
                                      .then(() => {
                                        fetchNotifications();
                                        showToast('Request approved!', 'success');
                                      })
                                      .catch(err => {
                                        console.error(err);
                                        showToast('Failed to approve request', 'error');
                                      });
                                    }}
                                    aria-label="Approve"
                                  >
                                    <FaCheckCircle />
                                  </button>
                                  <button 
                                    className="reject-button"
                                    onClick={() => {
                                      axios.post(`${API_URL}/api/trips/${notification.trip_id}/member-requests/${notification.notification_id}/reject`, {
                                        user_id: user.user_id
                                      })
                                      .then(() => {
                                        fetchNotifications();
                                        showToast('Request rejected', 'info');
                                      })
                                      .catch(err => {
                                        console.error(err);
                                        showToast('Failed to reject request', 'error');
                                      });
                                    }}
                                    aria-label="Reject"
                                  >
                                    <FaTimesCircle />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="empty-notifications">
                            <FaBell style={{fontSize: '2rem', color: '#52525b', marginBottom: '0.5rem'}} />
                            <p>No new notifications</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Profile Menu - Only for logged-in users */}
                <div 
                  ref={profileRef}
                  className="profile-icon" 
                  onClick={handleProfileClick}
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt="Profile" className="avatar-img" />
                  ) : (
                    <div className="user-avatar">
                      {user.first_name ? user.first_name.charAt(0).toUpperCase() : <FaUser />}
                    </div>
                  )}
                  
                  {dropdownOpen && (
                    <div className="dropdown-menu simple-profile-dropdown">
                      <button 
                        onClick={handleAddFriends} 
                        className="dropdown-item"
                      >
                        <FaUserFriends className="dropdown-icon" />
                        <span>Add Friends</span>
                      </button>
                      <button onClick={handleSignOut} className="dropdown-item logout-item">
                        <FaSignOutAlt className="dropdown-icon" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Auth buttons for logged-out users */}
                <button 
                  onClick={() => navigate('/login')} 
                  className="auth-button sign-in-btn"
                >
                  Sign In
                </button>
                <button 
                  onClick={() => navigate('/login', { state: { tab: 'register' } })} 
                  className="auth-button get-started-btn"
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
        
        <div className="content">
          {children}
        </div>
        
        {/* Bottom Navigation - Mobile Only */}
        {isMobile && user && (
          <div className={`bottom-nav ${showTripModal ? 'modal-open' : ''}`}>
            <button 
              onClick={() => handleNavigation('/')} 
              className={`bottom-nav-btn ${location.pathname === '/' ? 'active' : ''} ${showTripModal ? 'blurred' : ''}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill={location.pathname === '/' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M19.0167 7.1419C19.6261 7.50161 20 8.15658 20 8.86423V18.0001C20 19.1047 19.1046 20.0001 18 20.0001H16C14.8954 20.0001 14 19.1047 14 18.0001V14C14 12.8955 13.1046 12 12 12V12C10.8954 12 10 12.8955 10 14V18.0001C10 19.1047 9.10457 20.0001 8 20.0001H6C4.89543 20.0001 4 19.1047 4 18.0001V8.86423C4 8.15658 4.37395 7.50161 4.98335 7.1419L10.9833 3.60023C11.6106 3.23 12.3894 3.23 13.0167 3.60023L19.0167 7.1419Z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button 
              onClick={() => handleNavigation('/planner')} 
              className={`bottom-nav-btn ${location.pathname === '/planner' ? 'active' : ''} ${showTripModal ? 'blurred' : ''}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill={location.pathname === '/planner' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M7 3V5M17 3V5M6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4802 21 18.9201 21 17.8V8.2C21 7.07989 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 9H21M6 13H8M6 17H8M11 13H13M11 17H13M16 13H18M16 17H18" stroke={location.pathname === '/planner' ? '#18181b' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button 
              onClick={() => {
                if (showTripModal) {
                  // Close modal
                  window.dispatchEvent(new CustomEvent('closeCreateTripModal'));
                } else {
                  // Open modal
                  window.dispatchEvent(new CustomEvent('openCreateTripModal'));
                }
              }} 
              className={`bottom-nav-btn create-btn ${showTripModal ? 'close-mode' : ''}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" className="line-vertical"></line>
                <line x1="5" y1="12" x2="19" y2="12" className="line-horizontal"></line>
              </svg>
            </button>
            <button 
              onClick={() => handleNavigation('/chats')} 
              className={`bottom-nav-btn ${location.pathname.startsWith('/chat') ? 'active' : ''} ${showTripModal ? 'blurred' : ''}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill={location.pathname.startsWith('/chat') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M21 20L17.6757 18.3378C17.4237 18.2118 17.2977 18.1488 17.1656 18.1044C17.0484 18.065 16.9277 18.0365 16.8052 18.0193C16.6672 18 16.5263 18 16.2446 18H6.2C5.07989 18 4.51984 18 4.09202 17.782C3.71569 17.5903 3.40973 17.2843 3.21799 16.908C3 16.4802 3 15.9201 3 14.8V7.2C3 6.07989 3 5.51984 3.21799 5.09202C3.40973 4.71569 3.71569 4.40973 4.09202 4.21799C4.51984 4 5.0799 4 6.2 4H17.8C18.9201 4 19.4802 4 19.908 4.21799C20.2843 4.40973 20.5903 4.71569 20.782 5.09202C21 5.51984 21 6.0799 21 7.2V20Z" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 9H17M7 13H12" stroke={location.pathname.startsWith('/chat') ? '#18181b' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {unreadCount > 0 && (
                <span className="bottom-nav-indicator"></span>
              )}
            </button>
            <button 
              onClick={() => handleNavigation('/friends')} 
              className={`bottom-nav-btn ${location.pathname === '/friends' ? 'active' : ''} ${showTripModal ? 'blurred' : ''}`}
            >
              <svg width="24" height="24" viewBox="-80 0 1440 1024" fill={location.pathname === '/friends' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="60">
                <path d="M384 512c123.8 0 224-100.2 224-224S507.8 64 384 64 160 164.2 160 288s100.2 224 224 224z m153.6 64h-16.6c-41.6 20-87.8 32-137 32s-95.2-12-137-32h-16.6C103.2 576 0 679.2 0 806.4V864c0 53 43 96 96 96h576c53 0 96-43 96-96v-57.6c0-127.2-103.2-230.4-230.4-230.4zM960 512c106 0 192-86 192-192s-86-192-192-192-192 86-192 192 86 192 192 192z m96 64h-7.6c-27.8 9.6-57.2 16-88.4 16s-60.6-6.4-88.4-16H864c-40.8 0-78.4 11.8-111.4 30.8 48.8 52.6 79.4 122.4 79.4 199.6v76.8c0 4.4-1 8.6-1.2 12.8H1184c53 0 96-43 96-96 0-123.8-100.2-224-224-224z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Layout;
import React, { useState, useEffect, useRef, useContext } from 'react';
import { AuthContext } from './AuthContext';
import { useToast } from './ToastContext';
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
import FloatingChat from './FloatingChat';
import './styles/Layout.css';

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext); 
  const { showToast } = useToast();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Refs for handling outside clicks
  const sidebarRef = useRef(null);
  const menuBtnRef = useRef(null);
  const profileRef = useRef(null);
  const notificationRef = useRef(null);

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Fetch all notifications
  useEffect(() => {
    if (user?.user_id) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchNotifications = () => {
    if (!user?.user_id) return;
    
    axios
      .get(`http://localhost:5000/api/notifications/${user.user_id}`)
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

  // Navigation items - show different items based on auth status
  const navItems = user ? [
    { text: "Home", path: "/home" },
    { text: "Planner", path: "/planner" },
    { text: "Friends", path: "/friends" }
  ] : [
    { text: "Home", path: "/" }
  ];

  const handleNavigation = (path) => {
    navigate(path);
    // Force reload if navigating to home
    if (path === '/home' || path === '/') {
      window.location.href = path;
    }
    if (isMobile) {
      setIsNavOpen(false);
      document.body.classList.remove('sidebar-open');
    }
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
      .get(`http://localhost:5000/api/users?search=${encodeURIComponent(friendSearchQuery)}&current_user_id=${user.user_id}`)
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
      .post('http://localhost:5000/api/send_friend_request', {
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
      .post(`http://localhost:5000/api/accept_friend_request/${requestId}`, {})
      .then(() => {
        fetchNotifications(); // Refresh notifications
      })
      .catch((err) => {
        console.error(err);
      });
  };

  const rejectFriendRequest = (requestId) => {
    axios
      .post(`http://localhost:5000/api/reject_friend_request/${requestId}`, {})
      .then(() => {
        fetchNotifications(); // Refresh notifications
      })
      .catch((err) => console.error(err));
  };

  const acceptTripInvitation = (invitationId) => {
    axios
      .post(`http://localhost:5000/api/trip-invitations/${invitationId}/accept`, {
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
      .post(`http://localhost:5000/api/trip-invitations/${invitationId}/decline`, {
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
      axios.post(`http://localhost:5000/api/notifications/${notification.notification_id}/read`)
        .then(() => fetchNotifications())
        .catch(err => console.error(err));
      navigate('/planner');
      setShowNotifications(false);
    } else if (notification.type === 'message') {
      // Clear unread count for this chat
      axios.delete(`http://localhost:5000/api/unread/${user.user_id}/${notification.chat_id}/${notification.chat_type}`)
        .then(() => {
          fetchNotifications(); // Refresh notifications
          // Trigger chat list refresh
          window.dispatchEvent(new CustomEvent('refreshChats'));
        })
        .catch(err => console.error(err));
      
      // Open the chat
      window.dispatchEvent(new CustomEvent('openChat', { 
        detail: { 
          chat_id: notification.chat_id,
          chat_name: notification.chat_name,
          is_direct: notification.chat_type === 'direct'
        } 
      }));
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
            <div className="app-logo">
              <img src="/Trip Sync.png" alt="TripSync" className="logo-image" />
            </div>
            <div className="logo-separator"></div>
          </div>
          
          <div className="center-area">
            <nav className="top-nav">
              <ul className="nav-list">
                {navItems.map((item, index) => {
                  const isActive = location.pathname === item.path || 
                    (item.path === '/home' && location.pathname === '/');
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
                                      axios.post(`http://localhost:5000/api/trips/${notification.trip_id}/member-requests/${notification.notification_id}/approve`, {
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
                                      axios.post(`http://localhost:5000/api/trips/${notification.trip_id}/member-requests/${notification.notification_id}/reject`, {
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
                  onClick={() => navigate('/register')} 
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
      </main>

      
      {/* Floating Chat - Available on all pages */}
      {user && <FloatingChat />}
    </div>
  );
};

export default Layout;
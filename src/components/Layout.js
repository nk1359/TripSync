import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);

  // Friend request notification state
  const [friendRequests, setFriendRequests] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Friend search modal state
  const [showFriendSearchModal, setShowFriendSearchModal] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState([]);
  const [friendSearchMessage, setFriendSearchMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
    } else {
      // Redirect to login if no user is found
      navigate('/');
    }
    
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.profile-icon')) {
        setDropdownOpen(false);
      }
      if (showNotifications && !event.target.closest('.notification-bell') && !event.target.closest('.notification-dropdown')) {
        setShowNotifications(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen, showNotifications, navigate]);

  // Fetch pending friend requests once the user is loaded
  useEffect(() => {
    if (user?.user_id) {
      fetchFriendRequests();
    }
  }, [user]);

  const fetchFriendRequests = () => {
    if (!user?.user_id) return;
    
    axios
      .get(`http://localhost:5000/api/friend_requests/${user.user_id}`)
      .then((res) => {
        setFriendRequests(res.data.friend_requests || []);
      })
      .catch((err) => console.error(err));
  };

  const toggleNav = () => setIsNavOpen(!isNavOpen);
  
  const handleProfileClick = (e) => {
    e.stopPropagation();
    setDropdownOpen(!dropdownOpen);
  };

  const handleNotificationClick = (e) => {
    e.stopPropagation();
    setShowNotifications(!showNotifications);
  };

  const handleSignOut = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  // Only include Home, Chat, and Calendar in the sidebar navigation
  const navItems = [
    { icon: <FaHome />, text: "Home", path: "/home" },
    { icon: <FaComments />, text: "Chat", path: "/chats" },
    { icon: <FaCalendarAlt />, text: "Calendar", path: "/calendar" }
  ];

  const isMobile = window.innerWidth <= 768;
  const handleNavigation = (path) => {
    navigate(path);
    if (isMobile) {
      setIsNavOpen(false);
    }
  };

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
      .post('http://localhost:5000/api/accept_friend_request', {
        request_id: requestId
      })
      .then(() => {
        // Remove the accepted request from the notification bar
        setFriendRequests(friendRequests.filter(fr => fr.id !== requestId));
        // Show a success message
        setFriendSearchMessage("Friend request accepted!");
      })
      .catch((err) => {
        console.error(err);
        setFriendSearchMessage("Error accepting friend request.");
      });
  };

  // Function to reject a friend request
  const rejectFriendRequest = (requestId) => {
    axios
      .post('http://localhost:5000/api/reject_friend_request', {
        request_id: requestId
      })
      .then(() => {
        // Remove the rejected request from the list
        setFriendRequests(friendRequests.filter(fr => fr.id !== requestId));
      })
      .catch((err) => console.error(err));
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
      <div className={`sidebar ${isNavOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1 className="app-logo">Explorer</h1>
          {isMobile && (
            <button className="close-nav" onClick={toggleNav} aria-label="Close navigation">
              <FaTimes />
            </button>
          )}
        </div>
        
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {navItems.map((item, index) => (
              <li key={index} className="nav-item">
                <div 
                  onClick={() => handleNavigation(item.path)} 
                  className="nav-link"
                  style={{ cursor: 'pointer' }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-text">{item.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      
      {isNavOpen && isMobile && (
        <div className="mobile-overlay" onClick={toggleNav}></div>
      )}
      
      <main className="main-section">
        <div className="top-bar">
          <div className="left-area">
            {isMobile && (
              <button className="menu-toggle" onClick={toggleNav} aria-label="Toggle menu">
                <FaBars />
              </button>
            )}
          </div>
          
          <div className="center-area">
            {isMobile && <h1 className="app-title">Explorer</h1>}
          </div>
          
          <div className="right-area">
            {/* Notification Bell */}
            <div className="notification-bell" onClick={handleNotificationClick}>
              <FaBell />
              {friendRequests.length > 0 && (
                <span className="notification-badge">{friendRequests.length}</span>
              )}
              
              {showNotifications && friendRequests.length > 0 && (
                <div className="notification-dropdown">
                  <div className="dropdown-header">
                    Friend Requests
                  </div>
                  <div className="notification-list">
                    {friendRequests.map((request) => (
                      <div key={request.id} className="notification-item">
                        <div className="notification-content">
                          <div className="notification-avatar">
                            {request.first_name.charAt(0)}
                          </div>
                          <div className="notification-details">
                            <div className="notification-title">
                              {request.first_name} {request.last_name}
                            </div>
                            <div className="notification-subtitle">
                              @{request.username}
                            </div>
                          </div>
                        </div>
                        <div className="notification-actions">
                          <button 
                            className="accept-button" 
                            onClick={() => acceptFriendRequest(request.id)}
                            aria-label="Accept friend request"
                          >
                            <FaCheckCircle />
                          </button>
                          <button 
                            className="reject-button"
                            onClick={() => rejectFriendRequest(request.id)}
                            aria-label="Reject friend request"
                          >
                            <FaTimesCircle />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {showNotifications && friendRequests.length === 0 && (
                <div className="notification-dropdown">
                  <div className="dropdown-header">
                    Notifications
                  </div>
                  <div className="empty-notifications">
                    No pending friend requests.
                  </div>
                </div>
              )}
            </div>
            
            {/* Profile Menu */}
            <div className="profile-icon" onClick={handleProfileClick}>
              {user && user.avatar ? (
                <img src={user.avatar} alt="Profile" className="avatar-img" />
              ) : (
                <div className="user-avatar">
                  {user && user.first_name ? user.first_name.charAt(0).toUpperCase() : <FaUser />}
                </div>
              )}
              
              {dropdownOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    Hello, {user ? user.first_name : 'Explorer'}
                  </div>
                  <button 
                    onClick={() => { setShowFriendSearchModal(true); setDropdownOpen(false); }} 
                    className="dropdown-item"
                  >
                    <FaUserFriends className="dropdown-icon" />
                    <span>Add Friends</span>
                  </button>
                  <button onClick={handleSignOut} className="dropdown-item">
                    <FaSignOutAlt className="dropdown-icon" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="content">
          {children}
        </div>
      </main>

      {/* Friend Search Modal */}
      {showFriendSearchModal && (
        <div className="modal-overlay" onClick={() => setShowFriendSearchModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Find Friends</h2>
              <button 
                className="close-modal" 
                onClick={() => setShowFriendSearchModal(false)}
                aria-label="Close modal"
              >
                <FaTimes />
              </button>
            </div>
            
            <div className="search-container">
              <div className="search-input-wrapper">
                <input
                  type="text"
                  placeholder="Search by name or username..."
                  value={friendSearchQuery}
                  onChange={(e) => setFriendSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFriendSearch()}
                  className="friend-search-input"
                />
                <button
                  onClick={handleFriendSearch}
                  className="search-button"
                  disabled={isSearching}
                >
                  {isSearching ? "Searching..." : <FaSearch />}
                </button>
              </div>
              
              {friendSearchMessage && (
                <div className="search-message">{friendSearchMessage}</div>
              )}
            </div>
            
            <div className="search-results">
              {friendSearchResults.length > 0 && (
                <div className="results-list">
                  {friendSearchResults.map((friend) => (
                    <div key={friend.id} className="friend-result-item">
                      <div className="friend-result-avatar">
                        {friend.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="friend-result-details">
                        <div className="friend-result-name">{friend.name}</div>
                        {friend.username && (
                          <div className="friend-result-username">@{friend.username}</div>
                        )}
                      </div>
                      <div className="friend-result-actions">
                        {getFriendActionButton(friend)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
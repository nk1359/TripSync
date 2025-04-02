import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaUser, 
  FaSignOutAlt, 
  FaBars, 
  FaTimes, 
  FaHome, 
  FaCalendarAlt,
  FaComments
} from 'react-icons/fa';
import './styles/Layout.css';

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const darkModePreference = localStorage.getItem('darkMode') === 'true';
    
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    
    setIsDarkMode(darkModePreference);
    
    if (darkModePreference) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.profile-icon')) {
        setDropdownOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  const toggleNav = () => setIsNavOpen(!isNavOpen);
  
  const handleProfileClick = (e) => {
    e.stopPropagation();
    setDropdownOpen(!dropdownOpen);
  };

  const handleSignOut = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem('darkMode', newDarkMode);
    
    if (newDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  };

  // Updated navItems to match routes in App.js
  const navItems = [
    { icon: <FaHome />, text: "Home", path: "/home" },
    { icon: <FaComments />, text: "Chat", path: "/chats" }, // Fixed: changed from "/chat" to "/chats"
    { icon: <FaCalendarAlt />, text: "Calendar", path: "/calendar" },
  ];

  const isMobile = window.innerWidth <= 768;

  // Changed <a> tags to use navigate function to prevent page reload
  const handleNavigation = (path) => {
    navigate(path);
    if (isMobile) {
      setIsNavOpen(false);
    }
  };

  return (
    <div className={`page-wrapper ${isDarkMode ? 'dark-mode' : ''}`}>
      <div className={`sidebar ${isNavOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1 className="app-logo">Explorer</h1>
          {isMobile && (
            <button className="close-nav" onClick={toggleNav}>
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
        
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleDarkMode}>
            {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </div>
      </div>
      
      {isNavOpen && isMobile && (
        <div className="mobile-overlay" onClick={toggleNav}></div>
      )}
      
      <main className="main-section">
        <div className="top-bar">
          <div className="left-area">
            {isMobile && (
              <button className="menu-toggle" onClick={toggleNav}>
                <FaBars />
              </button>
            )}
          </div>
          
          <div className="center-area">
            {isMobile && <h1 className="app-title">Explorer</h1>}
          </div>
          
          <div className="right-area">
            <div className="profile-icon" onClick={handleProfileClick}>
              {user && user.avatar ? (
                <img src={user.avatar} alt="Profile" className="avatar-img" />
              ) : (
                <FaUser />
              )}
              
              {dropdownOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    Hello, {user ? user.first_name : 'Explorer'}
                  </div>
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
    </div>
  );
};

export default Layout;
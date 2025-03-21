import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSearch, FaUser, FaSignOutAlt } from 'react-icons/fa';
import Sidebar from './Sidebar';
import './styles/Layout.css'; // You can combine these styles with Home.css if desired

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const toggleNav = () => setIsNavOpen(!isNavOpen);
  const handleSearchButtonClick = () => setIsSearchActive(true);
  const handleSearchBlur = () => setIsSearchActive(false);
  const handleProfileClick = () => setDropdownOpen(!dropdownOpen);
  const handleSignOut = () => {
    // Optional: Clear any authentication tokens or state here.
    navigate('/');
  };

  return (
    <div className="page-wrapper">
      <Sidebar isNavOpen={isNavOpen} toggleNav={toggleNav} />
      <main className="main-section">
        <div className={`top-bar ${isSearchActive ? 'search-active' : ''}`}>
          <div className="left-area"></div>
          <div className="center-area">
            <div className="search-container">
              <FaSearch className="search-icon" />
              <input 
                type="text" 
                placeholder="Search..."
                autoFocus={isSearchActive}
                onBlur={handleSearchBlur}
              />
            </div>
          </div>
          <div className="right-area">
            <button className="search-button" onClick={handleSearchButtonClick}>
              <FaSearch />
            </button>
            <div className="profile-icon" onClick={handleProfileClick}>
              <FaUser />
              {dropdownOpen && (
                <div className="dropdown-menu">
                  <button onClick={handleSignOut}>
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

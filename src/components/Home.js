import React, { useState } from 'react';
import {
  FaBars,
  FaHome,
  FaComments,
  FaCalendarAlt,
  FaSearch,
  FaUser,
} from 'react-icons/fa';
import './styles/Home.css';

const Home = () => {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);

  const handleNavToggle = () => {
    setIsNavOpen(!isNavOpen);
  };

  const handleSearchButtonClick = () => {
    setIsSearchActive(true);
  };

  const handleSearchBlur = () => {
    setIsSearchActive(false);
  };

  return (
    <div className="home-wrapper">
      {/* Sidebar remains visible unless in search mode on small screens */}
      <aside className={`sidebar ${isNavOpen ? 'open' : ''} ${isSearchActive ? 'hidden' : ''}`}>
        <div className="hamburger" onClick={handleNavToggle}>
          <FaBars />
        </div>
        <ul className="nav-list">
          <li>
            <FaHome className="icon" />
            {isNavOpen && <span>Home</span>}
          </li>
          <li>
            <FaComments className="icon" />
            {isNavOpen && <span>Chats</span>}
          </li>
          <li>
            <FaCalendarAlt className="icon" />
            {isNavOpen && <span>Calendar</span>}
          </li>
        </ul>
      </aside>

      <main className="main-section">
        <div className={`top-bar ${isSearchActive ? 'search-active' : ''}`}>
          {/* Left Area – used only for spacing on large screens */}
          <div className="left-area"></div>

          {/* Center Area – always rendered but its visibility is controlled via CSS */}
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

          {/* Right Area – contains the search button and profile icon */}
          <div className="right-area">
            <button className="search-button" onClick={handleSearchButtonClick}>
              <FaSearch />
            </button>
            <div className="profile-icon">
              <FaUser />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;

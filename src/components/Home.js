import React from 'react';
import './styles/Home.css'; 
import searchIcon from '../assets/images/search.png'; // adjust the path as needed

const Home = () => {
  return (
    <div className="app-container">
      {/* Top Bar / Search */}
      <div className="search-container">
        <div className="search-wrapper">
          <img src={searchIcon} alt="Search Icon" className="search-icon" />
          <input 
            type="text" 
            className="search-box" 
            placeholder="Search" 
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="content">
        <h2>Welcome to TripSync!</h2>
      </div>

      {/* Bottom Navigation */}
      <div className="nav-bar">
        <a href="#" className="nav-button"><i className="fas fa-home"></i></a>
        <a href="#" className="nav-button"><i className="fas fa-comments"></i></a>
        <a href="#" className="nav-button"><i className="fas fa-calendar-alt"></i></a>
        <a href="#" className="nav-button"><i className="fas fa-user"></i></a>
      </div>
    </div>
  );
};

export default Home;

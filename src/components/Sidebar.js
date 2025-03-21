import React from 'react';
import { NavLink } from 'react-router-dom';
import { FaHome, FaComments, FaCalendarAlt, FaBars } from 'react-icons/fa';
import './styles/Sidebar.css';

const Sidebar = ({ isNavOpen, toggleNav }) => {
  return (
    <aside className={`sidebar ${isNavOpen ? 'open' : ''}`}>
      <div className="hamburger" onClick={toggleNav}>
        <FaBars />
      </div>
      <ul className="nav-list">
        <li>
          <NavLink to="/home" className={({ isActive }) => isActive ? 'active' : ''}>
            <FaHome className="icon" />
            {isNavOpen && <span>Home</span>}
          </NavLink>
        </li>
        <li>
          <NavLink to="/chats" className={({ isActive }) => isActive ? 'active' : ''}>
            <FaComments className="icon" />
            {isNavOpen && <span>Chats</span>}
          </NavLink>
        </li>
        <li>
          <NavLink to="/calendar" className={({ isActive }) => isActive ? 'active' : ''}>
            <FaCalendarAlt className="icon" />
            {isNavOpen && <span>Calendar</span>}
          </NavLink>
        </li>
      </ul>
    </aside>
  );
};

export default Sidebar;

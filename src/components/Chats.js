import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaSearch, FaTrash } from 'react-icons/fa';
import Layout from './Layout';
import ChatRoom from './ChatRoom';
import './styles/Chats.css';

const Chats = () => {
  const [groups, setGroups] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const currentUser = JSON.parse(localStorage.getItem('user')).username;
  const navigate = useNavigate();

  useEffect(() => {
    fetchGroups();
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchGroups = () => {
    axios
      .get('http://localhost:5000/api/get_groups')
      .then((res) => setGroups(res.data.groups))
      .catch((err) => console.error(err));
  };

  // Create new group chat
  const handleNewGroup = () => {
    const groupName = prompt('Enter the new group name:');
    if (!groupName) return;
    axios
      .post('http://localhost:5000/api/create_group', {
        group_name: groupName,
        created_by: currentUser,
      })
      .then(() => fetchGroups())
      .catch((err) => console.error(err));
  };

  const removeGroup = (groupId) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return;

    axios
      .delete(`http://localhost:5000/api/delete_group/${groupId}`)
      .then(() => {
        setGroups(groups.filter((group) => group.id !== groupId));
      })
      .catch((err) => console.error(err));
  };

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="chats-container">
        {(!isMobile || !selectedGroup) && (
          <div className="chat-list-container">
            <div className="chats-header">
              <div className="search-bar">
                <FaSearch className="search-icon" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <button className="new-group-button" onClick={handleNewGroup}>
                + New Group
              </button>
            </div>

            <div className="chat-list">
              {filteredGroups.map((group) => (
                <div
                  key={group.id}
                  className="chat-item"
                  onClick={() => setSelectedGroup(group)}
                >
                  <div className="chat-details">
                    <h4>{group.name}</h4>
                    <p>Tap to open chat</p>
                  </div>
                  <button
                    className="delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeGroup(group.id);
                    }}
                  >
                    <FaTrash className="trash-icon" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedGroup && (
          <div className="chat-room-wrapper">
            <ChatRoom
              groupId={selectedGroup.id}
              groupName={selectedGroup.name}
              onBack={() => setSelectedGroup(null)}
            />
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Chats;

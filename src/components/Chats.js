import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  FaPlus, 
  FaUserPlus, 
  FaInfoCircle, 
  FaSignOutAlt, 
  FaComments, 
  FaTimes,
  FaCheckCircle,
  FaUsers,
  FaExclamationTriangle,
  FaSearch
} from 'react-icons/fa';
import Layout from './Layout';
import ChatRoom from './ChatRoom';
import './styles/Chats.css';

// Chat Search Bar Component
const ChatSearchBar = ({ onSearch }) => {
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setChatSearchQuery(query);
    onSearch(query);
  };
  
  return (
    <div className="chat-search-container">
      <div className="chat-search-input-wrapper">
        <FaSearch className="chat-search-icon" />
        <input
          type="text"
          placeholder="Search conversations..."
          value={chatSearchQuery}
          onChange={handleSearchChange}
          className="chat-search-input"
        />
        {chatSearchQuery && (
          <button 
            onClick={() => { setChatSearchQuery(''); onSearch(''); }} 
            className="chat-search-clear"
          >
            <FaTimes />
          </button>
        )}
      </div>
    </div>
  );
};

const Chats = () => {
  // State management
  const [groups, setGroups] = useState([]);
  const [filteredGroups, setFilteredGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [showLeaveGroupModal, setShowLeaveGroupModal] = useState(false);
  const [groupToLeave, setGroupToLeave] = useState(null);
  
  // Form states
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Get user data from localStorage
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const currentUserId = currentUser.user_id;
  
  const navigate = useNavigate();

  // Check authentication and set up event listeners
  useEffect(() => {
    if (!currentUserId) {
      navigate('/');
      return;
    }
    
    // Load data
    fetchGroups();
    fetchFriends();
    
    // Handle responsive layout
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [currentUserId, navigate]);

  // API Calls
  const fetchGroups = useCallback(() => {
    setIsLoading(true);
    axios.get(`http://localhost:5000/api/get_groups?user_id=${currentUserId}`)
      .then(response => {
        const fetchedGroups = response.data.groups || [];
        setGroups(fetchedGroups);
        setFilteredGroups(fetchedGroups);
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Error fetching groups:", error.response?.data || error.message);
        setIsLoading(false);
      });
  }, [currentUserId]);

  const fetchFriends = useCallback(() => {
    axios.get(`http://localhost:5000/api/friends/${currentUserId}`)
      .then(response => {
        setFriends(response.data.friends || []);
      })
      .catch(error => {
        console.error("Error fetching friends:", error.response?.data || error.message);
      });
  }, [currentUserId]);

  const fetchGroupMembers = useCallback((groupId) => {
    setIsLoadingMembers(true);
    axios.get(`http://localhost:5000/api/group_members/${groupId}`)
      .then(response => {
        setGroupMembers(response.data.members || []);
        setIsLoadingMembers(false);
      })
      .catch(error => {
        console.error("Error fetching group members:", error.response?.data || error.message);
        setIsLoadingMembers(false);
      });
  }, []);

  // Search functionality
  const handleGroupSearch = (searchTerm) => {
    if (!searchTerm.trim()) {
      setFilteredGroups(groups);
      return;
    }
    
    const lowerCaseSearch = searchTerm.toLowerCase();
    const filtered = groups.filter(group => 
      group.name.toLowerCase().includes(lowerCaseSearch)
    );
    
    setFilteredGroups(filtered);
  };

  const createGroup = useCallback(() => {
    if (!newGroupName.trim() || selectedFriends.length === 0) return;
    
    const payload = {
      group_name: newGroupName.trim(),
      created_by: currentUserId,
      members: selectedFriends
    };
    
    axios.post('http://localhost:5000/api/create_group', payload)
      .then(response => {
        fetchGroups();
        setShowCreateModal(false);
        setNewGroupName('');
        setSelectedFriends([]);
        
        // Select the newly created group
        if (response.data?.group_id) {
          setSelectedGroup({
            id: response.data.group_id,
            name: newGroupName.trim()
          });
        }
      })
      .catch(error => {
        console.error("Error creating group:", error.response?.data || error.message);
        alert("Failed to create group: " + (error.response?.data?.error || "Unknown error"));
      });
  }, [currentUserId, fetchGroups, newGroupName, selectedFriends]);

  const addMembersToGroup = useCallback(() => {
    if (!selectedGroup || selectedFriends.length === 0) return;
  
    const addPromises = selectedFriends.map(friendId => 
      axios.post('http://localhost:5000/api/add_friend_to_group', {
        group_id: selectedGroup.id,
        friend_id: friendId,
        user_id: currentUserId
      })
    );
  
    Promise.all(addPromises)
      .then(() => {
        setShowAddMembersModal(false);
        setSelectedFriends([]);
        fetchGroupMembers(selectedGroup.id);
      })
      .catch(error => {
        console.error("Error adding members:", error.response?.data || error.message);
        alert("Failed to add members: " + (error.response?.data?.error || "Unknown error"));
      });
  }, [currentUserId, fetchGroupMembers, selectedFriends, selectedGroup]);

  const leaveGroup = useCallback((groupId) => {
    if (!groupId) return;
    
    axios.post('http://localhost:5000/api/leave_group', { 
      group_id: groupId,
      user_id: currentUserId 
    })
      .then(() => {
        setGroups(prevGroups => {
          const updatedGroups = prevGroups.filter(group => group.id !== groupId);
          setFilteredGroups(updatedGroups);
          return updatedGroups;
        });
        
        if (selectedGroup?.id === groupId) {
          setSelectedGroup(null);
        }
        
        setShowLeaveGroupModal(false);
        setGroupToLeave(null);
      })
      .catch(error => {
        console.error("Error leaving group:", error.response?.data || error.message);
        alert("Failed to leave group: " + (error.response?.data?.error || "Unknown error"));
      });
  }, [currentUserId, selectedGroup]);

  // Helper Functions
  const toggleFriendSelection = useCallback((friendId) => {
    setSelectedFriends(prevSelected => 
      prevSelected.includes(friendId)
        ? prevSelected.filter(id => id !== friendId)
        : [...prevSelected, friendId]
    );
  }, []);

  const isFriendInGroup = useCallback((friendId) => {
    return groupMembers.some(member => member.user_id === friendId);
  }, [groupMembers]);

  const getInitial = (name) => name.charAt(0).toUpperCase();

  // Modal Handlers
  const openCreateModal = () => {
    setNewGroupName('');
    setSelectedFriends([]);
    setShowCreateModal(true);
  };

  const openInfoModal = (groupId) => {
    fetchGroupMembers(groupId);
    setShowInfoModal(true);
  };

  const openAddMembersModal = (groupId) => {
    fetchGroupMembers(groupId);
    setSelectedFriends([]);
    setShowAddMembersModal(true);
  };

  const openLeaveGroupModal = (group) => {
    setGroupToLeave(group);
    setShowLeaveGroupModal(true);
  };

  // Renderers
  const renderSidebar = () => {
    const shouldShowSidebar = !isMobile || !selectedGroup;
    
    if (!shouldShowSidebar) return null;
    
    return (
      <div className={`sidebar ${isMobile && selectedGroup ? 'hidden' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">Your Chats</h2>
          <button 
            className="create-group-btn" 
            onClick={openCreateModal}
            aria-label="Create new group"
          >
            <FaPlus /> New Group
          </button>
        </div>
        
        {/* Add Search Bar Component */}
        <ChatSearchBar onSearch={handleGroupSearch} />
        
        <div className="groups-list">
          {isLoading ? (
            <div className="status-message">Loading groups...</div>
          ) : filteredGroups.length === 0 ? (
            <div className="status-message">
              {groups.length === 0 ? 
                "No groups yet. Create one to start chatting!" : 
                "No groups match your search."}
            </div>
          ) : (
            filteredGroups.map(group => (
              <div 
                key={group.id}
                className={`group-item ${selectedGroup?.id === group.id ? 'active' : ''}`}
                onClick={() => setSelectedGroup(group)}
              >
                <div className="group-avatar">
                  {getInitial(group.name)}
                </div>
                <div className="group-info">
                  <div className="tooltip">
                    <h3 className="group-name">{group.name}</h3>
                    <span className="tooltip-text">{group.name}</span>
                  </div>
                  <p className="group-message">Tap to open chat</p>
                </div>
                <div className="group-actions">
                  <button
                    className="action-btn info"
                    onClick={(e) => {
                      e.stopPropagation();
                      openInfoModal(group.id);
                      setSelectedGroup(group);
                    }}
                    aria-label={`Group info for ${group.name}`}
                  >
                    <FaInfoCircle />
                  </button>
                  <button
                    className="action-btn add"
                    onClick={(e) => {
                      e.stopPropagation();
                      openAddMembersModal(group.id);
                      setSelectedGroup(group);
                    }}
                    aria-label={`Add members to ${group.name}`}
                  >
                    <FaUserPlus />
                  </button>
                  <button
                    className="action-btn leave"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLeaveGroupModal(group);
                    }}
                    aria-label={`Leave ${group.name} group`}
                  >
                    <FaSignOutAlt />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderChatRoom = () => {
    if (selectedGroup) {
      return (
        <div className="chat-room">
          <ChatRoom
            groupId={selectedGroup.id}
            groupName={selectedGroup.name}
            onBack={() => setSelectedGroup(null)}
          />
        </div>
      );
    }
    
    if (!isMobile) {
      return (
        <div className="chat-room">
          <div className="empty-state">
            <FaComments className="empty-state-icon" />
            <h2 className="empty-state-title">Select a chat to start messaging</h2>
            <p className="empty-state-desc">
              Choose an existing group or create a new one to begin chatting
            </p>
          </div>
        </div>
      );
    }
    
    return null;
  };

  const renderCreateGroupModal = () => {
    if (!showCreateModal) return null;
    
    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">Create New Group</h2>
            <button 
              className="modal-close" 
              onClick={() => setShowCreateModal(false)}
              aria-label="Close modal"
            >
              <FaTimes />
            </button>
          </div>
          
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label" htmlFor="group-name">Group Name</label>
              <input
                id="group-name"
                className="form-input"
                type="text"
                placeholder="Enter a name for your group"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Select Friends to Add</label>
              <div className="friend-selection">
                {friends.length === 0 ? (
                  <div className="status-message">
                    You have no friends yet. Add friends to create groups with them.
                  </div>
                ) : (
                  <div className="friend-list">
                    {friends.map(friend => (
                      <div 
                        key={friend.user_id}
                        className={`friend-item ${selectedFriends.includes(friend.user_id) ? 'selected' : ''}`}
                        onClick={() => toggleFriendSelection(friend.user_id)}
                      >
                        <div className="friend-avatar">
                          {friend.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="friend-details">
                          <div className="friend-name">{friend.first_name} {friend.last_name}</div>
                          <div className="friend-username">@{friend.username}</div>
                        </div>
                        {selectedFriends.includes(friend.user_id) && (
                          <FaCheckCircle className="check-icon" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="modal-footer">
            <button 
              className="chat-btn chat-btn-secondary" 
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </button>
            <button 
              className="chat-btn chat-btn-primary"
              onClick={createGroup}
              disabled={!newGroupName.trim() || selectedFriends.length === 0}
            >
              Create Group
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAddMembersModal = () => {
    if (!showAddMembersModal || !selectedGroup) return null;
    
    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">Add Members to "{selectedGroup.name}"</h2>
            <button 
              className="modal-close" 
              onClick={() => setShowAddMembersModal(false)}
              aria-label="Close modal"
            >
              <FaTimes />
            </button>
          </div>
          
          <div className="modal-body">
            <div className="friend-selection">
              {isLoadingMembers ? (
                <div className="status-message">Loading members...</div>
              ) : friends.length === 0 ? (
                <div className="status-message">
                  You have no friends to add. Add some friends first!
                </div>
              ) : (
                <div className="friend-list">
                  {friends.map(friend => {
                    const isAlreadyMember = isFriendInGroup(friend.user_id);
                    return (
                      <div 
                        key={friend.user_id}
                        className={`friend-item ${isAlreadyMember ? 'disabled' : ''} ${selectedFriends.includes(friend.user_id) ? 'selected' : ''}`}
                        onClick={() => !isAlreadyMember && toggleFriendSelection(friend.user_id)}
                      >
                        <div className="friend-avatar">
                          {friend.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="friend-details">
                          <div className="friend-name">{friend.first_name} {friend.last_name}</div>
                          <div className="friend-username">@{friend.username}</div>
                        </div>
                        {isAlreadyMember ? (
                          <span className="badge member-badge">Already Member</span>
                        ) : selectedFriends.includes(friend.user_id) ? (
                          <FaCheckCircle className="check-icon" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          
          <div className="modal-footer">
            <button 
              className="chat-btn chat-btn-secondary" 
              onClick={() => setShowAddMembersModal(false)}
            >
              Cancel
            </button>
            <button 
              className="chat-btn chat-btn-primary"
              onClick={addMembersToGroup}
              disabled={selectedFriends.length === 0}
            >
              <FaUserPlus /> Add to Group
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGroupInfoModal = () => {
    if (!showInfoModal || !selectedGroup) return null;
    
    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">{selectedGroup.name}</h2>
            <button 
              className="modal-close" 
              onClick={() => setShowInfoModal(false)}
              aria-label="Close modal"
            >
              <FaTimes />
            </button>
          </div>
          
          <div className="modal-body">
            <div className="group-info-content">
              <div className="group-avatar-large">
                {getInitial(selectedGroup.name)}
              </div>
              
              <div className="member-count">
                <FaUsers /> {groupMembers.length} {groupMembers.length === 1 ? 'Member' : 'Members'}
              </div>
              
              <div className="members-container">
                <h3 className="members-title">Members</h3>
                {isLoadingMembers ? (
                  <div className="status-message">Loading members...</div>
                ) : (
                  <div className="members-list">
                    {groupMembers.map(member => (
                      <div key={member.user_id} className="member-item">
                        <div className="friend-avatar">
                          {member.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="friend-details">
                          <div className="friend-name">{member.first_name} {member.last_name}</div>
                          <div className="friend-username">@{member.username}</div>
                        </div>
                        {member.username === currentUser.username && (
                          <span className="badge you-badge">You</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="modal-footer">
            <button 
              className="chat-btn chat-btn-secondary" 
              onClick={() => setShowInfoModal(false)}
            >
              Close
            </button>
            <button 
              className="chat-btn chat-btn-primary"
              onClick={() => {
                setShowInfoModal(false);
                openAddMembersModal(selectedGroup.id);
              }}
            >
              <FaUserPlus /> Add Members
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderLeaveGroupModal = () => {
    if (!showLeaveGroupModal || !groupToLeave) return null;
    
    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">Leave Group</h2>
            <button 
              className="modal-close" 
              onClick={() => {
                setShowLeaveGroupModal(false);
                setGroupToLeave(null);
              }}
              aria-label="Close modal"
            >
              <FaTimes />
            </button>
          </div>
          
          <div className="modal-body">
            <div className="confirm-modal-content">
              <FaExclamationTriangle className="confirm-icon" />
              <h3 className="confirm-title">Leave "{groupToLeave.name}"?</h3>
              <p className="confirm-message">
                You will no longer be able to see messages or participate in this group. 
                You can be added back by another group member.
              </p>
            </div>
          </div>
          
          <div className="modal-footer">
            <button 
              className="chat-btn chat-btn-secondary" 
              onClick={() => {
                setShowLeaveGroupModal(false);
                setGroupToLeave(null);
              }}
            >
              Cancel
            </button>
            <button 
              className="chat-btn chat-btn-danger"
              onClick={() => leaveGroup(groupToLeave.id)}
            >
              <FaSignOutAlt /> Leave Group
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="chats-container">
        {renderSidebar()}
        {renderChatRoom()}
        {renderCreateGroupModal()}
        {renderAddMembersModal()}
        {renderGroupInfoModal()}
        {renderLeaveGroupModal()}
      </div>
    </Layout>
  );
};

export default Chats;
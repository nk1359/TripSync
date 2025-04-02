import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  FaSearch, 
  FaTrash, 
  FaComments, 
  FaUserPlus, 
  FaTimes, 
  FaCheckCircle,
  FaUsers,
  FaPlus,
  FaUserFriends,
  FaInfoCircle
} from 'react-icons/fa';
import Layout from './Layout';
import ChatRoom from './ChatRoom';
import './styles/Chats.css';

const Chats = () => {
  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isLoading, setIsLoading] = useState(true);
  
  // Group modal states
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState([]);
  
  // Add members modal states
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Info modal state
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);

  // Get current user information from localStorage
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const currentUserId = currentUser?.user_id;

  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUserId) {
      navigate('/');
      return;
    }
    
    fetchGroups();
    fetchFriends();
    
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentUserId, navigate]);

  // Fetch groups where the current user is a member
  const fetchGroups = () => {
    setIsLoading(true);
    axios
      .get(`http://localhost:5000/api/get_groups?user_id=${currentUserId}`)
      .then((res) => {
        setGroups(res.data.groups || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching groups:", err.response?.data || err.message);
        setIsLoading(false);
      });
  };

  // Fetch the current user's friend list
  const fetchFriends = () => {
    axios
      .get(`http://localhost:5000/api/friends/${currentUserId}`)
      .then((res) => {
        setFriends(res.data.friends || []);
      })
      .catch((err) => console.error("Error fetching friends:", err.response?.data || err.message));
  };

  // Fetch members of a specific group
  const fetchGroupMembers = (groupId) => {
    setIsLoadingMembers(true);
    axios
      .get(`http://localhost:5000/api/group_members/${groupId}`)
      .then((res) => {
        setGroupMembers(res.data.members || []);
        setIsLoadingMembers(false);
      })
      .catch((err) => {
        console.error("Error fetching group members:", err.response?.data || err.message);
        setIsLoadingMembers(false);
      });
  };

  // Open the modal to create a new group
  const handleNewGroup = () => {
    setNewGroupName('');
    setSelectedFriends([]);
    setShowGroupModal(true);
  };

  // Open the modal to add members to a group
  const handleAddMembers = (groupId) => {
    setSelectedGroup({ ...selectedGroup });
    setSelectedFriends([]);
    fetchGroupMembers(groupId);
    setShowAddMemberModal(true);
  };

  // Open group info modal
  const handleGroupInfo = (groupId) => {
    fetchGroupMembers(groupId);
    setShowGroupInfoModal(true);
  };

  // Submit the new group creation request with the selected friends
  const handleGroupCreationSubmit = () => {
    if (!newGroupName.trim()) return;

    console.log("Creating group with name:", newGroupName);
    console.log("Selected friends:", selectedFriends);

    const payload = {
      group_name: newGroupName.trim(),
      created_by: currentUserId,
      members: selectedFriends, // Array of friend user_ids
    };

    axios
      .post('http://localhost:5000/api/create_group', payload)
      .then((response) => {
        console.log("Group creation response:", response.data);
        fetchGroups();
        setShowGroupModal(false);
        setNewGroupName('');
        setSelectedFriends([]);
        if (response.data && response.data.group_id) {
          setSelectedGroup({
            id: response.data.group_id,
            name: newGroupName.trim()
          });
        }
      })
      .catch((err) => {
        console.error("Error creating group:", err.response?.data || err.message);
        alert("Failed to create group: " + (err.response?.data?.error || "Unknown error"));
      });
  };

  // Add selected friends to an existing group
  const handleAddMembersSubmit = () => {
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
        setShowAddMemberModal(false);
        setSelectedFriends([]);
        // Refresh the group members list
        fetchGroupMembers(selectedGroup.id);
      })
      .catch(err => {
        console.error("Error adding friends to group:", err.response?.data || err.message);
        alert("Failed to add members: " + (err.response?.data?.error || "Unknown error"));
      });
  };

  // Toggle the selection of a friend in the modal
  const toggleFriendSelection = (friendId) => {
    if (selectedFriends.includes(friendId)) {
      setSelectedFriends(selectedFriends.filter(id => id !== friendId));
    } else {
      setSelectedFriends([...selectedFriends, friendId]);
    }
  };

  // Check if a friend is already a member of the group
  const isFriendInGroup = (friendId) => {
    return groupMembers.some(member => member.user_id === friendId);
  };

  // Remove a group
  const removeGroup = (groupId) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return;

    axios
      .delete(`http://localhost:5000/api/delete_group/${groupId}`)
      .then(() => {
        setGroups(groups.filter((group) => group.id !== groupId));
        if (selectedGroup && selectedGroup.id === groupId) {
          setSelectedGroup(null);
        }
      })
      .catch((err) => {
        console.error("Error deleting group:", err.response?.data || err.message);
        alert("Failed to delete group: " + (err.response?.data?.error || "Unknown error"));
      });
  };

  // Filter groups based on search term
  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get the first letter of the group name for the avatar display
  const getInitial = (name) => name.charAt(0).toUpperCase();

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
                  placeholder="Search groups..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                  aria-label="Search groups"
                />
              </div>
              <button 
                className="new-group-button" 
                onClick={handleNewGroup}
                aria-label="Create new group"
              >
                <FaPlus /> New Group
              </button>
            </div>

            <div className="chat-list">
              {isLoading ? (
                <div className="loading-message">Loading groups...</div>
              ) : filteredGroups.length === 0 ? (
                <div className="empty-message">
                  {searchTerm ? 'No matching groups found' : 'No groups yet. Create one to start chatting!'}
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <div
                    key={group.id}
                    className={`chat-item ${selectedGroup && selectedGroup.id === group.id ? 'active' : ''}`}
                    onClick={() => setSelectedGroup(group)}
                  >
                    <div className="chat-avatar">
                      {getInitial(group.name)}
                    </div>
                    <div className="chat-details">
                      <h4>{group.name}</h4>
                      <p>Tap to open chat</p>
                    </div>
                    <div className="chat-actions">
                      <button
                        className="info-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGroupInfo(group.id);
                        }}
                        aria-label={`Group info for ${group.name}`}
                      >
                        <FaInfoCircle />
                      </button>
                      <button
                        className="add-member-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddMembers(group.id);
                          setSelectedGroup(group);
                        }}
                        aria-label={`Add members to ${group.name}`}
                      >
                        <FaUserPlus />
                      </button>
                      <button
                        className="delete-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeGroup(group.id);
                        }}
                        aria-label={`Delete ${group.name} group`}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {selectedGroup ? (
          <div className="chat-room-wrapper">
            <ChatRoom
              groupId={selectedGroup.id}
              groupName={selectedGroup.name}
              onBack={() => setSelectedGroup(null)}
            />
          </div>
        ) : (
          !isMobile && (
            <div className="chat-room-wrapper">
              <div className="empty-state">
                <FaComments />
                <h3>Select a chat to start messaging</h3>
                <p>Choose an existing group or create a new one to begin chatting</p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Group Creation Modal */}
      {showGroupModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create New Group</h2>
              <button 
                className="close-modal" 
                onClick={() => setShowGroupModal(false)}
                aria-label="Close modal"
              >
                <FaTimes />
              </button>
            </div>
            
            <div className="group-form">
              <div className="form-group">
                <label htmlFor="group-name">Group Name</label>
                <input
                  id="group-name"
                  type="text"
                  placeholder="Enter group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label className="friend-selection-label">
                  <FaUserFriends /> Select Friends to Add
                </label>
                <div className="friend-selection">
                  {friends.length === 0 ? (
                    <p className="no-friends-message">You have no friends yet. Add friends to create groups with them.</p>
                  ) : (
                    <div className="friend-list">
                      {friends.map((friend) => (
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
                          <div className="friend-select">
                            {selectedFriends.includes(friend.user_id) && <FaCheckCircle className="check-icon" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="cancel-button" 
                onClick={() => setShowGroupModal(false)}
              >
                Cancel
              </button>
              <button 
                className="create-button"
                onClick={handleGroupCreationSubmit}
                disabled={!newGroupName.trim()}
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Members Modal */}
      {showAddMemberModal && selectedGroup && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add Friends to "{selectedGroup.name}"</h2>
              <button 
                className="close-modal" 
                onClick={() => setShowAddMemberModal(false)}
                aria-label="Close modal"
              >
                <FaTimes />
              </button>
            </div>
            
            <div className="friend-selection">
              {isLoadingMembers ? (
                <div className="loading-message">Loading members...</div>
              ) : friends.length === 0 ? (
                <p className="no-friends-message">You have no friends to add. Add some friends first!</p>
              ) : (
                <div className="friend-list">
                  {friends.map((friend) => {
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
                        <div className="friend-status">
                          {isAlreadyMember ? (
                            <span className="already-member">Already Member</span>
                          ) : selectedFriends.includes(friend.user_id) ? (
                            <FaCheckCircle className="check-icon" />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button 
                className="cancel-button" 
                onClick={() => setShowAddMemberModal(false)}
              >
                Cancel
              </button>
              <button 
                className="add-button"
                onClick={handleAddMembersSubmit}
                disabled={selectedFriends.length === 0}
              >
                Add to Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Info Modal */}
      {showGroupInfoModal && selectedGroup && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{selectedGroup.name}</h2>
              <button 
                className="close-modal" 
                onClick={() => setShowGroupInfoModal(false)}
                aria-label="Close modal"
              >
                <FaTimes />
              </button>
            </div>
            
            <div className="group-info">
              <div className="group-avatar large">
                {getInitial(selectedGroup.name)}
              </div>
              
              <div className="member-count">
                <FaUsers /> {groupMembers.length} {groupMembers.length === 1 ? 'Member' : 'Members'}
              </div>
              
              <div className="member-list-container">
                <h3>Members</h3>
                {isLoadingMembers ? (
                  <div className="loading-message">Loading members...</div>
                ) : (
                  <div className="member-list">
                    {groupMembers.map((member) => (
                      <div key={member.user_id} className="member-item">
                        <div className="member-avatar">
                          {member.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="member-details">
                          <div className="member-name">{member.first_name} {member.last_name}</div>
                          <div className="member-username">@{member.username}</div>
                        </div>
                        {member.username === currentUser.username && (
                          <span className="you-badge">You</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="close-button" 
                onClick={() => setShowGroupInfoModal(false)}
              >
                Close
              </button>
              <button 
                className="add-members-button"
                onClick={() => {
                  setShowGroupInfoModal(false);
                  handleAddMembers(selectedGroup.id);
                }}
              >
                <FaUserPlus /> Add Members
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Chats;
import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from './AuthContext';
import { useToast } from './ToastContext';
import Layout from './Layout';
import axios from 'axios';
import { FaUserFriends, FaSearch, FaTimesCircle, FaCheckCircle, FaComments } from 'react-icons/fa';
import './styles/Friends.css';

const Friends = () => {
  const { user } = useContext(AuthContext);
  const { showConfirm } = useToast();
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'suggested' | 'requests' | 'search'
  const [requestsSubTab, setRequestsSubTab] = useState('incoming'); // 'incoming' | 'pending'
  const [friends, setFriends] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [friendsFilter, setFriendsFilter] = useState(''); // Filter for My Friends tab

  useEffect(() => {
    if (user?.user_id) {
      fetchFriends();
      fetchSuggestions();
      fetchFriendRequests();
      fetchSentRequests();
    }
  }, [user]);

  const fetchFriends = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/friends/${user.user_id}`);
      setFriends(response.data.friends || []);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/friend_suggestions/${user.user_id}`);
      setSuggestions(response.data.suggestions || []);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  const fetchFriendRequests = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/friend_requests/${user.user_id}`);
      setFriendRequests(response.data || []);
    } catch (error) {
      console.error('Error fetching friend requests:', error);
    }
  };

  const fetchSentRequests = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/friend_requests_sent/${user.user_id}`);
      setSentRequests(response.data || []);
    } catch (error) {
      console.error('Error fetching sent requests:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchMessage('Please enter a name or username');
      return;
    }

    setIsSearching(true);
    setSearchMessage('Searching...');

    try {
      const response = await axios.get(`http://localhost:5000/api/users?search=${encodeURIComponent(searchQuery)}&current_user_id=${user.user_id}`);
      setSearchResults(response.data.users || []);
      setSearchMessage(response.data.users && response.data.users.length ? '' : 'No users found');
      setIsSearching(false);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchMessage('Error searching. Please try again.');
      setIsSearching(false);
    }
  };

  const sendFriendRequest = async (friendId) => {
    try {
      const response = await axios.post('http://localhost:5000/api/send_friend_request', {
        user_id: user.user_id,
        friend_id: friendId
      });
      
      const requestId = response.data.request_id;
      
      // Update UI - keep person in suggestions but update status
      setSearchResults(prev => 
        prev.map(u => u.id === friendId ? { ...u, friendship_status: 'request_sent', request_id: requestId } : u)
      );
      setSuggestions(prev => 
        prev.map(s => s.id === friendId ? { ...s, friendship_status: 'request_sent', request_id: requestId } : s)
      );
      fetchSentRequests();
      setSearchMessage('Friend request sent!');
    } catch (error) {
      console.error('Error sending friend request:', error);
      setSearchMessage('Error sending request');
    }
  };

  const removeFriend = async (friendId) => {
    const confirmed = await showConfirm({
      title: 'Remove Friend',
      message: 'Are you sure you want to remove this friend? This action cannot be undone.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      type: 'danger'
    });
    
    if (!confirmed) return;

    try {
      await axios.post('http://localhost:5000/api/remove_friend', {
        user_id: user.user_id,
        friend_id: friendId
      });
      fetchFriends();
      fetchSuggestions();
    } catch (error) {
      console.error('Error removing friend:', error);
    }
  };

  const startDirectMessage = async (friend) => {
    try {
      const response = await axios.post('http://localhost:5000/api/chats/direct', {
        user_id: user.user_id,
        friend_id: friend.user_id
      });
      
      if (response.data.chat_id) {
        // Trigger floating chat to open
        window.dispatchEvent(new CustomEvent('openChat', { 
          detail: { 
            chat_id: response.data.chat_id,
            chat_name: response.data.chat_name,
            is_direct: true  // Add is_direct flag for proper message loading
          } 
        }));
      }
    } catch (error) {
      console.error('Error creating direct chat:', error);
    }
  };

  const acceptFriendRequest = async (requestId) => {
    try {
      await axios.post(`http://localhost:5000/api/accept_friend_request/${requestId}`, {});
      
      // Update UI
      setSearchResults(prev => 
        prev.map(u => u.request_id === requestId ? { ...u, friendship_status: 'friends' } : u)
      );
      fetchFriends();
      fetchFriendRequests();
      fetchSuggestions();
    } catch (error) {
      console.error('Error accepting friend request:', error);
    }
  };

  const rejectFriendRequest = async (requestId) => {
    try {
      await axios.post(`http://localhost:5000/api/reject_friend_request/${requestId}`, {});
      
      // Refresh friend requests list
      fetchFriendRequests();
      fetchSuggestions();
    } catch (error) {
      console.error('Error rejecting friend request:', error);
    }
  };

  const cancelFriendRequest = async (requestId, friendId = null) => {
    try {
      await axios.post(`http://localhost:5000/api/cancel_friend_request/${requestId}`, {});
      
      // Update all relevant UI
      if (friendId) {
        setSearchResults(prev => 
          prev.map(u => u.id === friendId ? { ...u, friendship_status: 'none', request_id: undefined } : u)
        );
        setSuggestions(prev => 
          prev.map(s => s.id === friendId ? { ...s, friendship_status: 'none', request_id: undefined } : s)
        );
      }
      fetchSentRequests();
      fetchSuggestions();
    } catch (error) {
      console.error('Error canceling friend request:', error);
    }
  };

  const getFriendActionButton = (person) => {
    switch (person.friendship_status) {
      case 'friends':
        return <button disabled className="friend-btn friends-btn">Friends</button>;
      case 'request_sent':
        return (
          <button 
            onClick={() => cancelFriendRequest(person.request_id, person.id)} 
            className="friend-btn cancel-btn"
          >
            <FaTimesCircle /> Cancel Request
          </button>
        );
      case 'request_received':
        return (
          <button onClick={() => acceptFriendRequest(person.request_id)} className="friend-btn accept-btn">
            <FaCheckCircle /> Accept
          </button>
        );
      default:
        return (
          <button onClick={() => sendFriendRequest(person.id)} className="friend-btn add-btn">
            <FaUserFriends /> Add Friend
          </button>
        );
    }
  };

  const renderPersonCard = (person, showRemove = false) => (
    <div key={person.user_id || person.id} className="person-card">
      <div className="person-avatar">
        {(person.first_name || person.name?.split(' ')[0] || 'U').charAt(0).toUpperCase()}
      </div>
      <div className="person-info">
        <div className="person-name">{person.first_name ? `${person.first_name} ${person.last_name}` : person.name}</div>
        <div className="person-username">@{person.username}</div>
      </div>
      <div className="person-actions">
        {showRemove ? (
          <>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                startDirectMessage(person);
              }} 
              className="friend-btn message-icon-btn"
              title="Send message"
            >
              <FaComments />
            </button>
            <button onClick={() => removeFriend(person.user_id)} className="friend-btn remove-btn">
              <FaTimesCircle /> Remove
            </button>
          </>
        ) : (
          getFriendActionButton(person)
        )}
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="friends-page">
        <div className="friends-container">
          <div className="friends-header">
            <h1>Friends</h1>
            <p>Manage your friends and connect with new people</p>
          </div>

          {/* Tabs */}
          <div className="friends-tabs">
            <button 
              className={`friends-tab ${activeTab === 'friends' ? 'active' : ''}`}
              onClick={() => setActiveTab('friends')}
            >
              <FaUserFriends /> My Friends ({friends.length})
            </button>
            <button 
              className={`friends-tab ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => setActiveTab('requests')}
            >
              Requests {friendRequests.length > 0 && `(${friendRequests.length})`}
            </button>
            <button 
              className={`friends-tab ${activeTab === 'suggested' ? 'active' : ''}`}
              onClick={() => setActiveTab('suggested')}
            >
              Suggested
            </button>
            <button 
              className={`friends-tab ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              <FaSearch /> Search
            </button>
          </div>

          {/* Tab Content */}
          <div className="friends-content">
            {/* My Friends Tab */}
            {activeTab === 'friends' && (
              <>
                {friends.length > 0 && (
                  <div className="search-input-container friends-filter-container">
                    <input
                      type="text"
                      placeholder="Filter friends..."
                      value={friendsFilter}
                      onChange={(e) => setFriendsFilter(e.target.value)}
                      className="search-input"
                    />
                    <FaSearch className="search-icon-static" />
                  </div>
                )}
                <div className="friends-grid">
                  {friends.length > 0 ? (
                    friends
                      .filter(friend => 
                        friendsFilter === '' || 
                        `${friend.first_name} ${friend.last_name}`.toLowerCase().includes(friendsFilter.toLowerCase()) ||
                        friend.username.toLowerCase().includes(friendsFilter.toLowerCase())
                      )
                      .map(friend => renderPersonCard(friend, true))
                  ) : (
                    <div className="empty-state">
                      <FaUserFriends className="empty-icon" />
                      <h3>No friends yet</h3>
                      <p>Search for friends or check out suggestions to get started</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Friend Requests Tab */}
            {activeTab === 'requests' && (
              <>
                {/* Sub-tabs for Requests */}
                <div className="requests-subtabs">
                  <button
                    className={`requests-subtab ${requestsSubTab === 'incoming' ? 'active' : ''}`}
                    onClick={() => setRequestsSubTab('incoming')}
                  >
                    Incoming {friendRequests.length > 0 && `(${friendRequests.length})`}
                  </button>
                  <button
                    className={`requests-subtab ${requestsSubTab === 'pending' ? 'active' : ''}`}
                    onClick={() => setRequestsSubTab('pending')}
                  >
                    Pending {sentRequests.length > 0 && `(${sentRequests.length})`}
                  </button>
                </div>

                {/* Incoming Requests */}
                {requestsSubTab === 'incoming' && (
                  <div className="friends-grid">
                    {friendRequests.length > 0 ? (
                      friendRequests.map(request => (
                        <div key={request.id} className="person-card">
                          <div className="person-avatar">
                            {request.first_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="person-info">
                            <div className="person-name">{request.first_name} {request.last_name}</div>
                            <div className="person-username">@{request.username}</div>
                          </div>
                          <div className="person-actions">
                            <button 
                              onClick={() => acceptFriendRequest(request.id)} 
                              className="friend-btn accept-btn"
                            >
                              <FaCheckCircle /> Accept
                            </button>
                            <button 
                              onClick={() => rejectFriendRequest(request.id)} 
                              className="friend-btn reject-btn"
                            >
                              <FaTimesCircle /> Reject
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state">
                        <FaUserFriends className="empty-icon" />
                        <h3>No incoming requests</h3>
                        <p>No one has sent you a friend request yet</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Pending Requests */}
                {requestsSubTab === 'pending' && (
                  <div className="friends-grid">
                    {sentRequests.length > 0 ? (
                      sentRequests.map(request => (
                        <div key={request.id} className="person-card">
                          <div className="person-avatar">
                            {request.first_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="person-info">
                            <div className="person-name">{request.first_name} {request.last_name}</div>
                            <div className="person-username">@{request.username}</div>
                          </div>
                          <div className="person-actions">
                            <button 
                              onClick={() => cancelFriendRequest(request.id, request.friend_id)} 
                              className="friend-btn cancel-btn"
                            >
                              <FaTimesCircle /> Cancel Request
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state">
                        <FaComments className="empty-icon" />
                        <h3>No pending requests</h3>
                        <p>You haven't sent any friend requests</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Suggestions Tab */}
            {activeTab === 'suggested' && (
              <div className="friends-grid">
                {suggestions.length > 0 ? (
                  suggestions.map(suggestion => renderPersonCard({...suggestion, friendship_status: suggestion.friendship_status || 'none'}, false))
                ) : (
                  <div className="empty-state">
                    <FaSearch className="empty-icon" />
                    <h3>No suggestions available</h3>
                    <p>Try searching for friends manually</p>
                  </div>
                )}
              </div>
            )}

            {/* Search Tab */}
            {activeTab === 'search' && (
              <div className="search-tab">
                <div className="search-input-container">
                  <input
                    type="text"
                    placeholder="Search by name or username..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="search-input"
                  />
                  <button onClick={handleSearch} className="search-btn" disabled={isSearching}>
                    {isSearching ? '...' : <FaSearch />}
                  </button>
                </div>

                {searchMessage && (
                  <div className="search-message">{searchMessage}</div>
                )}

                <div className="friends-grid">
                  {searchResults.map(person => renderPersonCard(person, false))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Friends;


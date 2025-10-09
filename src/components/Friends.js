import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from './AuthContext';
import Layout from './Layout';
import axios from 'axios';
import { FaUserFriends, FaSearch, FaTimesCircle, FaCheckCircle } from 'react-icons/fa';
import './styles/Friends.css';

const Friends = () => {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'suggested' | 'search'
  const [friends, setFriends] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  useEffect(() => {
    if (user?.user_id) {
      fetchFriends();
      fetchSuggestions();
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
      await axios.post('http://localhost:5000/api/send_friend_request', {
        user_id: user.user_id,
        friend_id: friendId
      });
      
      // Update UI
      setSearchResults(prev => 
        prev.map(u => u.id === friendId ? { ...u, friendship_status: 'request_sent' } : u)
      );
      setSuggestions(prev => prev.filter(s => s.id !== friendId));
      setSearchMessage('Friend request sent!');
    } catch (error) {
      console.error('Error sending friend request:', error);
      setSearchMessage('Error sending request');
    }
  };

  const removeFriend = async (friendId) => {
    if (!window.confirm('Remove this friend?')) return;

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

  const acceptFriendRequest = async (requestId) => {
    try {
      await axios.post('http://localhost:5000/api/accept_friend_request', {
        request_id: requestId
      });
      
      // Update UI
      setSearchResults(prev => 
        prev.map(u => u.request_id === requestId ? { ...u, friendship_status: 'friends' } : u)
      );
      fetchFriends();
    } catch (error) {
      console.error('Error accepting friend request:', error);
    }
  };

  const getFriendActionButton = (person) => {
    switch (person.friendship_status) {
      case 'friends':
        return <button disabled className="friend-btn friends-btn">Friends</button>;
      case 'request_sent':
        return <button disabled className="friend-btn pending-btn">Request Sent</button>;
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
          <button onClick={() => removeFriend(person.user_id)} className="friend-btn remove-btn">
            <FaTimesCircle /> Remove
          </button>
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
              <div className="friends-grid">
                {friends.length > 0 ? (
                  friends.map(friend => renderPersonCard(friend, true))
                ) : (
                  <div className="empty-state">
                    <FaUserFriends className="empty-icon" />
                    <h3>No friends yet</h3>
                    <p>Search for friends or check out suggestions to get started</p>
                  </div>
                )}
              </div>
            )}

            {/* Suggestions Tab */}
            {activeTab === 'suggested' && (
              <div className="friends-grid">
                {suggestions.length > 0 ? (
                  suggestions.map(suggestion => renderPersonCard({...suggestion, friendship_status: 'none'}, false))
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


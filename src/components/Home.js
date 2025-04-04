import React, { useEffect, useState } from 'react';
import Layout from './Layout';
import './styles/Home.css';
import { FaSearch, FaCalendarPlus, FaStar, FaMapMarkerAlt, FaCity, FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';

const AddToCalendarModal = ({ place, onClose }) => {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eventForm, setEventForm] = useState({
    title: place?.place_name || '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    location: place?.city_name || '',
    placeId: place?.place_id || '',
    groupId: ''
  });

  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const currentUserId = currentUser.user_id;

  useEffect(() => {
    fetchGroups();
    if (place && place.place_id) {
      fetchPlaceDetails(place.place_id);
    }
  }, [place]);

  const fetchPlaceDetails = async (placeId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/place/${placeId}`);
      const data = await response.json();
      
      if (data) {
        const fullAddress = data.address || `${data.name}, ${data.city_name}`;
        setEventForm(prev => ({
          ...prev,
          location: fullAddress
        }));
      }
    } catch (error) {
      console.error("Error fetching place details:", error);
    }
  };

  const fetchGroups = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/calendar/groups/${currentUserId}`);
      const data = await response.json();
      setGroups(data.groups || []);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching groups:", error);
      setIsLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setEventForm({
      ...eventForm,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!eventForm.title.trim() || !eventForm.startDate || !eventForm.groupId) {
      alert('Please fill in all required fields');
      return;
    }
    
    try {
      await fetch('http://localhost:5000/api/calendar/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: eventForm.title,
          description: eventForm.description,
          start_date: eventForm.startDate,
          end_date: eventForm.endDate || null,
          location: eventForm.location,
          place_id: eventForm.placeId,
          group_id: eventForm.groupId,
          created_by: currentUserId
        }),
      });
      
      alert('Event added to calendar successfully!');
      onClose();
    } catch (error) {
      console.error("Error creating event:", error);
      alert(`Failed to add event: Unknown error`);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content calendar-modal">
        <div className="modal-header">
          <h2>Add to Calendar</h2>
          <button 
            className="close-modal" 
            onClick={onClose}
          >
            <FaTimes />
          </button>
        </div>
        
        {isLoading ? (
          <div className="modal-loading">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        ) : (
          <form className="event-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="title">Event Title *</label>
              <input
                id="title"
                name="title"
                type="text"
                value={eventForm.title}
                onChange={handleFormChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                placeholder="Add a description..."
                value={eventForm.description}
                onChange={handleFormChange}
              />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="startDate">Date *</label>
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={eventForm.startDate}
                  onChange={handleFormChange}
                  required
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                name="location"
                type="text"
                value={eventForm.location}
                onChange={handleFormChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="groupId">Group Calendar *</label>
              <select
                id="groupId"
                name="groupId"
                value={eventForm.groupId}
                onChange={handleFormChange}
                required
              >
                <option value="">Select a group</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              {groups.length === 0 && (
                <p className="no-groups-message">
                  You don't have any groups yet. Join or create a group to add events to a calendar.
                </p>
              )}
            </div>
            
            <div className="modal-footer">
              <button type="button" className="cancel-button" onClick={onClose}>
                Cancel
              </button>
              <button 
                type="submit" 
                className="add-calendar-button" 
                disabled={groups.length === 0}
              >
                <FaCalendarPlus /> Add to Calendar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const Home = () => {
  const [topCities, setTopCities] = useState({});
  const [categories, setCategories] = useState([]);
  const [places, setPlaces] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [viewMode, setViewMode] = useState('homepage'); // 'homepage', 'category', 'search'
  const [pagination, setPagination] = useState({
    page: 1,
    perPage: 10,
    total: 0,
    totalPages: 0
  });
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);

  // Fetch categories on component mount
  useEffect(() => {
    fetchCategories();
  }, []);

  // Fetch top cities data when component mounts
  useEffect(() => {
    fetchTopCities();
  }, []);

  // Fetch places when category, search, or page changes
  useEffect(() => {
    if (viewMode === 'category' || viewMode === 'search') {
      fetchPlaces();
    }
  }, [activeCategory, searchTerm, pagination.page, viewMode]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/categories');
      const data = await response.json();
      setCategories(['All', ...data]);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchTopCities = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/top-cities');
      const data = await response.json();
      setTopCities(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching top cities:', error);
      setLoading(false);
    }
  };

  const fetchPlaces = async () => {
    setLoading(true);
    try {
      let url = `http://localhost:5000/api/places?page=${pagination.page}&per_page=${pagination.perPage}`;
      
      if (activeCategory !== 'All') {
        url += `&category=${encodeURIComponent(activeCategory)}`;
      }
      
      if (searchTerm) {
        url += `&search=${encodeURIComponent(searchTerm)}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      setPlaces(data.places);
      setPagination({
        ...pagination,
        total: data.total,
        totalPages: data.total_pages
      });
      setLoading(false);
    } catch (error) {
      console.error('Error fetching places:', error);
      setLoading(false);
    }
  };

  const handleCategoryClick = (category) => {
    setActiveCategory(category);
    setPagination({ ...pagination, page: 1 });
    setViewMode(searchTerm ? 'search' : 'category');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination({ ...pagination, page: 1 });
    setViewMode('search');
  };

  const handlePageChange = (newPage) => {
    setPagination({ ...pagination, page: newPage });
    window.scrollTo(0, 0);
  };

  const handleAddToCalendar = (place) => {
    setSelectedPlace(place);
    setShowCalendarModal(true);
  };

  const handleResetToHomepage = () => {
    setSearchTerm('');
    setActiveCategory('All');
    setViewMode('homepage');
    setPagination({ ...pagination, page: 1 });
  };

  const renderPlaceCard = (place) => (
    <div key={place.place_id} className="place-card">
      <div className="place-image-container">
        <img
          src={place.image_url || 'https://via.placeholder.com/300x200?text=No+Image'}
          alt={place.place_name}
          className="place-image"
        />
        <div className="rating">
          <FaStar className="star-icon" />
          <span>{place.rating || '4.5'}</span>
        </div>
      </div>
      <div className="place-details">
        <h3 className="place-name">{place.place_name}</h3>
        <p className="place-category">
          <FaMapMarkerAlt className="location-icon" />
          <span>{place.city_name}</span>
        </p>
        <button 
          className="calendar-button"
          onClick={() => handleAddToCalendar(place)}
        >
          <FaCalendarPlus className="calendar-icon" />
          Add to Calendar
        </button>
      </div>
    </div>
  );

  const renderPagination = () => {
    const { page, totalPages } = pagination;
    
    return (
      <div className="pagination">
        <button 
          className="pagination-button"
          onClick={() => handlePageChange(page - 1)}
          disabled={page <= 1}
        >
          <FaChevronLeft />
        </button>
        <span className="pagination-info">
          Page {page} of {totalPages}
        </span>
        <button 
          className="pagination-button"
          onClick={() => handlePageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <FaChevronRight />
        </button>
      </div>
    );
  };

  const renderHomepage = () => (
    <>
      {Object.keys(topCities).map((city) => (
        <div key={city} className="city-section">
          <h2 className="city-title">
            <FaCity className="city-icon" />
            {city}
          </h2>
          <div className="places-grid">
            {topCities[city].map(place => renderPlaceCard(place))}
          </div>
        </div>
      ))}
    </>
  );

  const renderCategoryView = () => (
    <>
      <div className="category-section">
        <h2 className="category-title">
          {activeCategory === 'All' ? 'All Places' : activeCategory}
        </h2>
        {places.length > 0 ? (
          <>
            <div className="places-grid">
              {places.map(place => renderPlaceCard(place))}
            </div>
            {renderPagination()}
          </>
        ) : (
          <div className="no-results">
            <div className="no-results-icon">🔍</div>
            <h3>No places found</h3>
            <p>Try adjusting your search terms or select a different category.</p>
          </div>
        )}
      </div>
    </>
  );

  if (loading && Object.keys(topCities).length === 0 && places.length === 0) {
    return (
      <Layout>
        <div className="home-page">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p className="loading-message">Discovering amazing places for you...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="home-page">
        <div className="hero-section">
          <h1>Discover Remarkable Places</h1>
          <p className="hero-subtitle">Explore attractions and hidden gems by category</p>
          
          <form className="search-container" onSubmit={handleSearch}>
            <FaSearch className="search-icon" />
            <input
              type="text"
              className="place-search"
              placeholder="Search for places, cities, or attractions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button type="submit" className="search-button">Search</button>
          </form>
        </div>

        <div className="category-tabs">
          {categories.map(category => (
            <button 
              key={category} 
              className={`category-tab ${category === activeCategory ? 'active' : ''}`}
              onClick={() => handleCategoryClick(category)}
            >
              {category}
            </button>
          ))}
        </div>

        {viewMode !== 'homepage' && (
          <div className="back-to-home">
            <button onClick={handleResetToHomepage} className="back-button">
              &larr; Back to Homepage
            </button>
          </div>
        )}

        <div className="places-container">
          {viewMode === 'homepage' && renderHomepage()}
          {(viewMode === 'category' || viewMode === 'search') && renderCategoryView()}
        </div>
      </div>
      
      {showCalendarModal && (
        <AddToCalendarModal 
          place={selectedPlace} 
          onClose={() => setShowCalendarModal(false)} 
        />
      )}
    </Layout>
  );
};

export default Home;
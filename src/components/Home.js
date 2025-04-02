import React, { useEffect, useState } from 'react';
import Layout from './Layout';
import './styles/Home.css';
import { FaSearch, FaCalendarPlus, FaStar, FaMapMarkerAlt, FaCity, FaChevronLeft, FaChevronRight } from 'react-icons/fa';

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

  const handleAddToCalendar = (placeName) => {
    // Implement calendar functionality
    alert(`${placeName} has been added to your calendar!`);
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
          onClick={() => handleAddToCalendar(place.place_name)}
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
    </Layout>
  );
};

export default Home;
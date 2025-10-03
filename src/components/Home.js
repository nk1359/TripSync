import React, { useEffect, useState } from 'react';
import Layout from './Layout';
import './styles/Home.css';
import AddToCalendarModal from './AddToCalendarModal';
import { FaSearch, FaCalendarPlus, FaStar, FaMapMarkerAlt, FaCity, FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';

const Home = () => {
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [welcomeData, setWelcomeData] = useState(null);
  const [nearbySpots, setNearbySpots] = useState([]);
  const [localEvents, setLocalEvents] = useState([]);
  const [featuredCards, setFeaturedCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [viewMode, setViewMode] = useState('homepage');
  const [pagination, setPagination] = useState({
    page: 1,
    perPage: 20,
    total: 0,
    totalPages: 0
  });
  const [selectedPlace, setSelectedPlace] = useState(null);

  // New search state
  const [searchForm, setSearchForm] = useState({
    placeType: '',
    state: '',
    city: '',
    zipCode: '',
    selectedCategories: []
  });
  const [searchResults, setSearchResults] = useState([]);
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [cityAutocompleteResults, setCityAutocompleteResults] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [showCityAutocomplete, setShowCityAutocomplete] = useState(false);
  
  // Available categories
  const availableCategories = [
    'Restaurants', 'Hotels', 'Parks', 'Museums', 'Shopping Centers',
    'Entertainment', 'Sports Venues', 'Tourist Attractions', 'Beaches',
    'Hiking Trails', 'Bars & Nightlife', 'Coffee Shops', 'Gas Stations',
    'Hospitals', 'Schools', 'Libraries', 'Gyms', 'Salons', 'Banks'
  ];

  // Load homepage content efficiently - one section at a time
  useEffect(() => {
    loadHomepageContent();
  }, []);

  // Load homepage content efficiently
  const loadHomepageContent = async () => {
    setLoading(true);
    
    // Load welcome data first (instant)
    loadWelcomeData();
    
    // Load other sections with delays to avoid overwhelming
    setTimeout(() => loadFeaturedCards(), 100);
    setTimeout(() => loadNearbySpots(), 200);
    setTimeout(() => loadLocalEvents(), 300);
    
    setLoading(false);
  };

  // Handle URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const placeType = urlParams.get('place_type');
    const state = urlParams.get('state');
    const city = urlParams.get('city');
    
    if (placeType && (state || city)) {
      setSearchForm({
        placeType: placeType,
        state: state || '',
        city: city || '',
        zipCode: ''
      });
      setViewMode('search');
      // Trigger search after a short delay to ensure form is set
      setTimeout(() => {
        handleSearch();
      }, 100);
    }
  }, []);

  // Removed fetchStates - no longer needed for new homepage

  // Load user dashboard data (instant - no API calls)
  const loadWelcomeData = () => {
    const dashboardData = {
      greeting: "Welcome back!",
      userName: "Ready for your next adventure?",
      recentActivity: [
        {
          type: "event",
          message: "You have 2 upcoming events this weekend",
          time: "2 hours ago",
          action: "View Calendar"
        },
        {
          type: "group",
          message: "3 new messages in 'NYC Trip Planning' group",
          time: "4 hours ago",
          action: "Check Messages"
        },
        {
          type: "place",
          message: "Central Park was added to your favorites",
          time: "Yesterday",
          action: "View Places"
        },
        {
          type: "friend",
          message: "Sarah accepted your friend request",
          time: "2 days ago",
          action: "View Profile"
        }
      ],
      quickStats: {
        upcomingEvents: 2,
        savedPlaces: 12,
        groupChats: 3,
        friends: 8
      }
    };
    setWelcomeData(dashboardData);
  };

  // Load featured cards (lightweight - no API calls)
  const loadFeaturedCards = () => {
    const cards = [
      {
        icon: "🔍",
        title: "Quick Search",
        description: "Find restaurants, attractions, or any place you're looking for",
        action: "Search Now",
        color: "linear-gradient(45deg, #ff6b6b, #ee5a24)"
      },
      {
        icon: "📅",
        title: "Upcoming Events",
        description: "2 events this weekend - NYC Food Tour & Central Park Picnic",
        action: "View Calendar",
        color: "linear-gradient(45deg, #4ecdc4, #44a08d)"
      },
      {
        icon: "💬",
        title: "Group Messages",
        description: "3 new messages in your trip planning groups",
        action: "Check Messages",
        color: "linear-gradient(45deg, #a8edea, #fed6e3)"
      },
      {
        icon: "⭐",
        title: "Saved Places",
        description: "12 places saved - ready for your next adventure",
        action: "View Favorites",
        color: "linear-gradient(45deg, #ffecd2, #fcb69f)"
      }
    ];
    setFeaturedCards(cards);
  };

  // Load nearby spots (lightweight - minimal API calls)
  const loadNearbySpots = async () => {
    try {
      // Get user's location if available
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            // Simple nearby search with minimal API calls
            const response = await fetch(`http://localhost:5000/api/search?place_type=popular attractions&page=1&per_page=4`);
            const data = await response.json();
            setNearbySpots(data.places?.slice(0, 4) || []);
          },
          () => {
            // Fallback to popular spots without location
            setNearbySpots([
              { place_name: "Central Park", city_name: "New York", category: "Parks" },
              { place_name: "Golden Gate Bridge", city_name: "San Francisco", category: "Attractions" },
              { place_name: "Times Square", city_name: "New York", category: "Attractions" },
              { place_name: "Hollywood Walk of Fame", city_name: "Los Angeles", category: "Attractions" }
            ]);
          }
        );
      } else {
        // Fallback to popular spots
        setNearbySpots([
          { place_name: "Central Park", city_name: "New York", category: "Parks" },
          { place_name: "Golden Gate Bridge", city_name: "San Francisco", category: "Attractions" },
          { place_name: "Times Square", city_name: "New York", category: "Attractions" },
          { place_name: "Hollywood Walk of Fame", city_name: "Los Angeles", category: "Attractions" }
        ]);
      }
    } catch (error) {
      console.error('Error loading nearby spots:', error);
      setNearbySpots([]);
    }
  };

  // Load local events (lightweight - static data for now)
  const loadLocalEvents = () => {
    // For now, use static data. Could be enhanced with real event APIs later
    const events = [
      {
        title: "Food Festival Downtown",
        date: "This Weekend",
        location: "City Center",
        type: "Food & Drink"
      },
      {
        title: "Art Gallery Opening",
        date: "Next Friday",
        location: "Museum District",
        type: "Arts & Culture"
      },
      {
        title: "Music in the Park",
        date: "Sunday Evening",
        location: "Central Park",
        type: "Entertainment"
      }
    ];
    setLocalEvents(events);
  };

  const fetchAutocomplete = async (query) => {
    if (query.length < 2) {
      setAutocompleteResults([]);
      setShowAutocomplete(false);
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/autocomplete?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      setAutocompleteResults(data.places || []);
      setShowAutocomplete(true);
    } catch (error) {
      console.error('Error fetching autocomplete:', error);
      setAutocompleteResults([]);
      setShowAutocomplete(false);
    }
  };

  const fetchCityAutocomplete = async (query) => {
    if (query.length < 2) {
      setCityAutocompleteResults([]);
      setShowCityAutocomplete(false);
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/autocomplete/cities?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      setCityAutocompleteResults(data.cities || []);
      setShowCityAutocomplete(true);
    } catch (error) {
      console.error('Error fetching city autocomplete:', error);
      setCityAutocompleteResults([]);
      setShowCityAutocomplete(false);
    }
  };

  const handleSearch = async (page = 1) => {
    if (!searchForm.placeType && searchForm.selectedCategories.length === 0) {
      alert('Please fill in the place type field or select categories');
      return;
    }

    if (searchForm.selectedCategories.length > 0 && !searchForm.city) {
      alert('When using categories, please select a city');
      return;
    }

    setSearchLoading(true);
    setViewMode('search');
    
    try {
      const params = new URLSearchParams({
        page: page,
        per_page: pagination.perPage
      });

      if (searchForm.placeType) {
        params.append('place_type', searchForm.placeType);
      }
      
      if (searchForm.selectedCategories.length > 0) {
        params.append('categories', searchForm.selectedCategories.join(','));
      }

      if (searchForm.state) {
        params.append('state', searchForm.state);
      }
      
      if (searchForm.city) {
        params.append('city', searchForm.city);
      }

      console.log('🔍 Searching with params:', params.toString());

      const response = await fetch(`http://localhost:5000/api/search?${params}`);
      const data = await response.json();
      
      console.log('🔍 Search results:', data);
      console.log('🔍 Places array:', data.places);
      console.log('🔍 Places length:', data.places ? data.places.length : 'undefined');
      
      setSearchResults(data.places || []);
      setPagination({
        ...pagination,
        page: data.page || page,
        total: data.total || 0,
        totalPages: data.total_pages || 1
      });
      setSearchLoading(false);
      
      // Update URL with search parameters
      const urlParams = new URLSearchParams();
      urlParams.set('place_type', searchForm.placeType);
      if (searchForm.state) urlParams.set('state', searchForm.state);
      if (searchForm.city) urlParams.set('city', searchForm.city);
      if (page > 1) urlParams.set('page', page.toString());
      
      const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
      window.history.pushState({}, '', newUrl);
      
      console.log('🔍 Search results set:', data.places || []);
      console.log('🔍 View mode:', 'search');
    } catch (error) {
      console.error('❌ Error searching places:', error);
      setSearchLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setSearchForm(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Trigger autocomplete for place type
    if (field === 'placeType') {
      fetchAutocomplete(value);
    }
    
    // Trigger autocomplete for city
    if (field === 'city') {
      fetchCityAutocomplete(value);
    }
  };

  const handleCitySelect = (city) => {
    setSearchForm(prev => ({
      ...prev,
      city: city.city,
      state: city.state
    }));
    setShowCityAutocomplete(false);
  };

  const handleCategoryToggle = (category) => {
    setSearchForm(prev => ({
      ...prev,
      selectedCategories: prev.selectedCategories.includes(category)
        ? prev.selectedCategories.filter(c => c !== category)
        : [...prev.selectedCategories, category]
    }));
  };

  const handlePlaceSelect = async (place) => {
    // Set the place name and trigger immediate search
    setSearchForm(prev => ({
      ...prev,
      placeType: place.main_text
    }));
    setSelectedPlace(place);
    setShowAutocomplete(false);
    
    // Trigger immediate search for this specific place
    await handleDirectPlaceSearch(place);
  };

  const handleDirectPlaceSearch = async (place) => {
    setSearchLoading(true);
    setViewMode('search');
    
    try {
      // Search for the specific place using its name
      const params = new URLSearchParams({
        place_type: place.main_text,
        page: 1,
        per_page: pagination.perPage
      });

      console.log('🔍 Direct place search for:', place.main_text);

      const response = await fetch(`http://localhost:5000/api/search?${params}`);
      const data = await response.json();
      
      console.log('🔍 Direct search results:', data);
      
      setSearchResults(data.places || []);
      setPagination({
        ...pagination,
        page: data.page || 1,
        total: data.total || 0,
        totalPages: data.total_pages || 1
      });
      setSearchLoading(false);
      
      // Update URL with search parameters
      const urlParams = new URLSearchParams();
      urlParams.set('place_type', place.main_text);
      
      const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
      window.history.pushState({}, '', newUrl);
      
    } catch (error) {
      console.error('❌ Error in direct place search:', error);
      setSearchLoading(false);
    }
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
          onClick={() => {
            setSelectedPlace(place);
            setIsCalendarModalOpen(true);
          }}
        >
          <FaCalendarPlus className="calendar-icon" />
          Add to Calendar
        </button>
      </div>
    </div>
  );


  const renderSkeletonCard = () => (
    <div className="place-card skeleton-card">
      <div className="skeleton-image"></div>
      <div className="skeleton-content">
        <div className="skeleton-title"></div>
        <div className="skeleton-text"></div>
        <div className="skeleton-rating"></div>
      </div>
    </div>
  );

  const renderHomepageSkeleton = () => (
    <>
      {/* Welcome skeleton */}
      <div className="welcome-section skeleton">
        <div className="skeleton-title" style={{width: '300px', height: '40px', margin: '0 auto 1rem'}}></div>
        <div className="skeleton-text" style={{width: '400px', height: '20px', margin: '0 auto'}}></div>
      </div>
      
      {/* Featured cards skeleton */}
      <div className="featured-section">
        <div className="skeleton-title" style={{width: '200px', height: '30px', margin: '0 auto 1.5rem'}}></div>
        <div className="featured-cards-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="featured-card skeleton">
              <div className="skeleton-icon" style={{width: '60px', height: '60px', margin: '0 auto 1rem'}}></div>
              <div className="skeleton-title" style={{width: '150px', height: '25px', margin: '0 auto 1rem'}}></div>
              <div className="skeleton-text" style={{width: '100%', height: '60px', marginBottom: '1rem'}}></div>
              <div className="skeleton-button" style={{width: '120px', height: '35px', margin: '0 auto'}}></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  const renderSearchSkeleton = () => (
    <div className="places-grid">
      {[1, 2, 3, 4, 5, 6].map(i => renderSkeletonCard())}
      </div>
    );

  const renderHomepage = () => (
    <>
      {/* User Dashboard */}
      {welcomeData && (
        <div className="dashboard-section">
          <div className="dashboard-content">
            <div className="dashboard-header">
              <h2 className="dashboard-greeting">{welcomeData.greeting}</h2>
              <p className="dashboard-subtitle">{welcomeData.userName}</p>
            </div>
            
            <div className="dashboard-grid">
              {/* Quick Stats */}
              <div className="stats-section">
                <h3 className="section-title">Your Overview</h3>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">📅</div>
                    <div className="stat-number">{welcomeData.quickStats.upcomingEvents}</div>
                    <div className="stat-label">Upcoming Events</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">⭐</div>
                    <div className="stat-number">{welcomeData.quickStats.savedPlaces}</div>
                    <div className="stat-label">Saved Places</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">💬</div>
                    <div className="stat-number">{welcomeData.quickStats.groupChats}</div>
                    <div className="stat-label">Active Groups</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-number">{welcomeData.quickStats.friends}</div>
                    <div className="stat-label">Friends</div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="activity-section">
                <h3 className="section-title">Recent Activity</h3>
                <div className="activity-feed">
                  {welcomeData.recentActivity.map((activity, index) => (
                    <div key={index} className="activity-item">
                      <div className="activity-icon">
                        {activity.type === 'event' && '📅'}
                        {activity.type === 'group' && '💬'}
                        {activity.type === 'place' && '📍'}
                        {activity.type === 'friend' && '👥'}
                      </div>
                      <div className="activity-content">
                        <p className="activity-message">{activity.message}</p>
                        <div className="activity-meta">
                          <span className="activity-time">{activity.time}</span>
                          <button className="activity-action">{activity.action}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {featuredCards.length > 0 && (
        <div className="featured-section">
          <h2 className="section-title">Quick Actions</h2>
          <div className="featured-cards-grid">
            {featuredCards.map((card, index) => (
              <div key={index} className="featured-card">
                <div className="card-icon">{card.icon}</div>
                <h3 className="card-title">{card.title}</h3>
                <p className="card-description">{card.description}</p>
                <button 
                  className="card-action"
                  onClick={() => setViewMode('search')}
                >
                  {card.action}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nearby Popular Spots */}
      {nearbySpots.length > 0 && (
        <div className="nearby-section">
          <h2 className="section-title">Popular Spots</h2>
          <div className="places-grid">
            {nearbySpots.map((spot, index) => (
              <div key={index} className="place-card">
                <div className="place-content">
                  <h3 className="place-name">{spot.place_name}</h3>
                  <p className="place-location">
                    <FaMapMarkerAlt className="location-icon" />
                    {spot.city_name}
                  </p>
                  <span className="place-category">{spot.category}</span>
                </div>
                <button 
                  className="add-to-calendar-btn"
                  onClick={() => setSelectedPlace(spot)}
                >
                  <FaCalendarPlus />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Local Events */}
      {localEvents.length > 0 && (
        <div className="events-section">
          <h2 className="section-title">Local Events</h2>
          <div className="events-grid">
            {localEvents.map((event, index) => (
              <div key={index} className="event-card">
                <div className="event-content">
                  <h3 className="event-title">{event.title}</h3>
                  <p className="event-date">{event.date}</p>
                  <p className="event-location">
                    <FaMapMarkerAlt className="location-icon" />
                    {event.location}
                  </p>
                  <span className="event-type">{event.type}</span>
          </div>
        </div>
      ))}
          </div>
        </div>
      )}
    </>
  );

  const renderSearchForm = () => (
    <div className="search-form-container">
      <div className="search-form">
        <h3>Find Places</h3>
        
        {/* Place Type Search */}
        <div className="form-group">
          <label htmlFor="placeType">What are you looking for?</label>
          <div className="autocomplete-container">
            <input
              id="placeType"
              type="text"
              placeholder="e.g., McDonald's, Starbucks, Central Park..."
              value={searchForm.placeType}
              onChange={(e) => handleInputChange('placeType', e.target.value)}
              onFocus={() => searchForm.placeType.length >= 2 && setShowAutocomplete(true)}
              onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
              className="form-input"
            />
            {showAutocomplete && autocompleteResults.length > 0 && (
              <div className="autocomplete-dropdown">
                <div className="autocomplete-header">
                  Click to search this place directly
                </div>
                {autocompleteResults.map((place) => (
                  <div
                    key={place.place_id}
                    className="autocomplete-item"
                    onClick={() => handlePlaceSelect(place)}
                  >
                    <div className="autocomplete-main">{place.main_text}</div>
                    <div className="autocomplete-secondary">{place.secondary_text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <small className="form-help">
            Search for specific places by name
          </small>
        </div>

        {/* Categories Section */}
        <div className="form-group">
          <label>Categories (Select Multiple)</label>
          <div className="categories-grid">
            {availableCategories.map((category) => (
              <div
                key={category}
                className={`category-chip ${searchForm.selectedCategories.includes(category) ? 'selected' : ''}`}
                onClick={() => handleCategoryToggle(category)}
              >
                {category}
              </div>
            ))}
          </div>
          <small className="form-help">
            {searchForm.selectedCategories.length > 0 && !searchForm.city && 
              "When using categories, please select a city below"}
          </small>
        </div>

        {/* Location Section */}
        <div className="form-group">
          <label htmlFor="city">City (Required for Categories)</label>
          <div className="autocomplete-container">
            <input
              id="city"
              type="text"
              placeholder="e.g., Los Angeles, New York, Chicago..."
              value={searchForm.city}
              onChange={(e) => handleInputChange('city', e.target.value)}
              onFocus={() => searchForm.city.length >= 2 && setShowCityAutocomplete(true)}
              onBlur={() => setTimeout(() => setShowCityAutocomplete(false), 200)}
              className="form-input"
            />
            {showCityAutocomplete && cityAutocompleteResults.length > 0 && (
              <div className="autocomplete-dropdown">
                <div className="autocomplete-header">
                  Click to select city and auto-fill state
                </div>
                {cityAutocompleteResults.map((city) => (
                  <div
                    key={city.place_id}
                    className="autocomplete-item"
                    onClick={() => handleCitySelect(city)}
                  >
                    <div className="autocomplete-main">{city.city}</div>
                    <div className="autocomplete-secondary">{city.state}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <small className="form-help">
            {searchForm.selectedCategories.length > 0 ? 
              "Required when using categories" : 
              "Optional - search within a specific city"}
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="state">State</label>
          <input
            id="state"
            type="text"
            placeholder="e.g., California, New York, Texas..."
            value={searchForm.state}
            onChange={(e) => handleInputChange('state', e.target.value)}
            className="form-input"
          />
          <small className="form-help">
            Auto-filled when you select a city
          </small>
        </div>

        <button 
          type="button"
          onClick={() => handleSearch()}
          className="search-button"
          disabled={(!searchForm.placeType && searchForm.selectedCategories.length === 0) || searchLoading}
        >
          <FaSearch />
          {searchLoading ? 'Searching...' : 'Search Places'}
        </button>
      </div>
    </div>
  );

  const renderSearchResults = () => {
    console.log('🔍 Rendering search results - searchLoading:', searchLoading);
    console.log('🔍 Rendering search results - searchResults:', searchResults);
    console.log('🔍 Rendering search results - searchResults.length:', searchResults.length);
    
    return (
      <>
        <div className="search-results-header">
          <h2>Search Results</h2>
          <button 
            onClick={() => {
              setViewMode('homepage');
              setSearchResults([]);
              setSearchForm({ placeType: '', state: '', city: '', zipCode: '' });
              setSearchLoading(false);
              // Clear URL parameters
              window.history.pushState({}, '', window.location.pathname);
            }}
            className="back-button"
          >
            <FaTimes />
            New Search
          </button>
        </div>
        
        {searchLoading ? (
          renderSearchSkeleton()
        ) : searchResults.length > 0 ? (
          <>
            <div className="places-grid">
              {searchResults.map(place => renderPlaceCard(place))}
            </div>
            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button 
                  className="pagination-button"
                  onClick={() => handleSearch(pagination.page - 1)}
                  disabled={pagination.page <= 1 || searchLoading}
                >
                  <FaChevronLeft />
                </button>
                <span className="pagination-info">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button 
                  className="pagination-button"
                  onClick={() => handleSearch(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || searchLoading}
                >
                  <FaChevronRight />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="no-results">
            <div className="no-results-icon">🔍</div>
            <h3>No places found</h3>
            <p>Try adjusting your search terms or selecting a different location.</p>
          </div>
        )}
    </>
  );
  };

  if (loading && !welcomeData) {
    return (
      <Layout>
        <div className="home-page">
          <div className="hero-section">
            <h1>Discover Remarkable Places</h1>
            <p className="hero-subtitle">Find the perfect spots for your next adventure</p>
          </div>
          <div className="places-container">
            {renderHomepageSkeleton()}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="home-page">
        <div className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">Discover Remarkable Places</h1>
            <p className="hero-subtitle">Find the perfect spots for your next adventure with friends</p>
            
            {viewMode === 'homepage' && (
              <div className="hero-actions">
            <button 
                  className="hero-search-button"
                  onClick={() => setViewMode('search')}
            >
                  <FaSearch className="button-icon" />
                  Start Exploring
            </button>
                <button className="hero-secondary-button">
                  Learn More
            </button>
          </div>
        )}
          </div>
          <div className="hero-visual">
            <div className="floating-cards">
              <div className="floating-card card-1">🏛️</div>
              <div className="floating-card card-2">🍽️</div>
              <div className="floating-card card-3">🏔️</div>
              <div className="floating-card card-4">🎭</div>
            </div>
          </div>
        </div>

        <div className="places-container">
          {console.log('🔍 Main render - viewMode:', viewMode, 'searchResults.length:', searchResults.length)}
          {viewMode === 'homepage' && renderHomepage()}
          {viewMode === 'search' && searchResults.length === 0 && renderSearchForm()}
          {viewMode === 'search' && searchResults.length > 0 && renderSearchResults()}
        </div>
      </div>
      
      {isCalendarModalOpen && selectedPlace && (
      <AddToCalendarModal 
        place={selectedPlace} 
        onClose={() => setIsCalendarModalOpen(false)} 
      />
      )}
    </Layout>
  );
};

export default Home;
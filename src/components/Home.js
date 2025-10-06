import React, { useEffect, useState, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './AuthContext';
import Layout from './Layout';
import './styles/Home.css';
import AddToCalendarModal from './AddToCalendarModal';
import { FaSearch, FaCalendarPlus, FaStar, FaMapMarkerAlt, FaCity, FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';

const Home = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [welcomeData, setWelcomeData] = useState(null);
  
  // Ref for smooth scrolling to search section
  const searchSectionRef = useRef(null);
  
  // Smooth scroll function
  const scrollToSearch = () => {
    if (searchSectionRef.current) {
      searchSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };
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
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  
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
    
    // Load welcome data first (instant) - only for logged-in users
    if (user) {
      loadWelcomeData();
    }
    
    // Load other sections with delays to avoid overwhelming
    setTimeout(() => loadFeaturedCards(), 100);
    setTimeout(() => loadNearbySpots(), 200);
    
    // Only load events for logged-in users
    if (user) {
      setTimeout(() => loadLocalEvents(), 300);
    }
    
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
    const cards = user ? [
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
    ] : [
      {
        icon: "🗺️",
        title: "Itinerary Builder",
        description: "Create detailed day-by-day plans with destinations, activities, and bookings",
        action: "Get Started"
      },
      {
        icon: "👥",
        title: "Collaborate",
        description: "Invite friends and family to plan together with real-time updates",
        action: "Get Started"
      },
      {
        icon: "📍",
        title: "Save Places",
        description: "Bookmark hotels, restaurants, and attractions for easy reference",
        action: "Get Started"
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
          src={place.image_url || 'https://via.placeholder.com/400x250/1a1a2e/ffffff?text=No+Image'}
          alt={place.place_name}
          className="place-image"
          onError={(e) => {
            e.target.src = 'https://via.placeholder.com/400x250/1a1a2e/6366f1?text=No+Image+Available';
          }}
        />
        <div className="place-image-overlay"></div>
        <div className="place-rating-overlay">
          <FaStar className="rating-stars" />
          <span>{place.rating || '4.5'}</span>
        </div>
      </div>
      
      <div className="place-content">
        <h3 className="place-name">{place.place_name}</h3>
        
        <div className="place-location">
          <FaMapMarkerAlt className="location-icon" />
          <span>{place.city_name}</span>
        </div>
        
        <div className="place-category">
          {place.category}
        </div>

        <div className="place-actions">
        <button
            className="add-to-calendar-btn"
          onClick={() => {
            setSelectedPlace(place);
            setIsCalendarModalOpen(true);
          }}
        >
            <FaCalendarPlus />
          Add to Calendar
        </button>
          
          <button 
            className="view-details-btn"
            onClick={() => window.open(place.google_maps_url, '_blank')}
          >
            <FaMapMarkerAlt />
            View on Maps
          </button>
        </div>
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
    </>
  );

  const renderSearchForm = () => (
    <div className="search-page">
      <div className="search-form-container">
        <div className="search-form-card">
          {/* Place Type Search */}
          <div className="form-section">
            <div className="form-section-header">
              <svg className="form-section-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <h3>What are you looking for?</h3>
            </div>
            <div className="autocomplete-container">
              <div className="input-wrapper">
                <FaSearch className="input-icon" />
                <input
                  id="placeType"
                  type="text"
                  placeholder="Search for places... (e.g., McDonald's, Central Park, hotels)"
                  value={searchForm.placeType}
                  onChange={(e) => handleInputChange('placeType', e.target.value)}
                  onFocus={() => searchForm.placeType.length >= 2 && setShowAutocomplete(true)}
                  onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
                  className="modern-input"
                />
              </div>
              {showAutocomplete && autocompleteResults.length > 0 && (
                <div className="autocomplete-dropdown modern-dropdown">
                  <div className="autocomplete-header">
                    <span className="header-icon">⚡</span>
                    Click to search this place directly
                  </div>
                  {autocompleteResults.map((place) => (
                    <div
                      key={place.place_id}
                      className="autocomplete-item modern-item"
                      onClick={() => handlePlaceSelect(place)}
                    >
                      <div className="item-icon">🏢</div>
                      <div className="item-content">
                        <div className="autocomplete-main">{place.main_text}</div>
                        <div className="autocomplete-secondary">{place.secondary_text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Line Separator */}
          <div className="form-separator"></div>

          {/* Categories Section */}
          <div className="form-section">
            <div className="form-section-header" onClick={() => setShowCategoryDropdown(!showCategoryDropdown)} style={{ cursor: 'pointer' }}>
              <svg className="form-section-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
              </svg>
              <h3>Category</h3>
              <svg className="dropdown-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 'auto', transform: showCategoryDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
            {showCategoryDropdown && (
              <div className="categories-grid modern-categories">
                {availableCategories.map((category) => (
                  <div
                    key={category}
                    className={`category-chip modern-chip ${searchForm.selectedCategories.includes(category) ? 'selected' : ''}`}
                    onClick={() => handleCategoryToggle(category)}
                  >
                    <span className="chip-text">{category}</span>
                  </div>
                ))}
              </div>
            )}
            {searchForm.selectedCategories.length > 0 && !searchForm.city && (
              <div className="form-help modern-help">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem', flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                When using categories, please select a city below
              </div>
            )}
          </div>

          {/* Line Separator */}
          <div className="form-separator"></div>

          {/* Location Section */}
          <div className="form-section">
            <div className="form-section-header">
              <svg className="form-section-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <h3>Where?</h3>
            </div>
            
            <div className="location-inputs">
              <div className="input-group">
                <div className="input-wrapper">
                  <FaMapMarkerAlt className="input-icon" />
                  <input
                    id="city"
                    type="text"
                    placeholder="City (e.g., Los Angeles, New York)"
                    value={searchForm.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    onFocus={() => searchForm.city.length >= 2 && setShowCityAutocomplete(true)}
                    onBlur={() => setTimeout(() => setShowCityAutocomplete(false), 200)}
                    className="modern-input"
                  />
                </div>
                {showCityAutocomplete && cityAutocompleteResults.length > 0 && (
                  <div className="autocomplete-dropdown modern-dropdown">
                    <div className="autocomplete-header">
                      <span className="header-icon">🏙️</span>
                      Click to select city and auto-fill state
                    </div>
                    {cityAutocompleteResults.map((city) => (
                      <div
                        key={city.place_id}
                        className="autocomplete-item modern-item"
                        onClick={() => handleCitySelect(city)}
                      >
                        <div className="item-icon">🏙️</div>
                        <div className="item-content">
                          <div className="autocomplete-main">{city.city}</div>
                          <div className="autocomplete-secondary">{city.state}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="input-group">
                <div className="input-wrapper">
                  <span className="input-icon">🗺️</span>
                  <input
                    id="state"
                    type="text"
                    placeholder="State (e.g., California, New York)"
                    value={searchForm.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className="modern-input"
                  />
                </div>
              </div>
            </div>

            <div className="form-help modern-help">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem', flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              {searchForm.selectedCategories.length > 0 ? 
                "City is required when using categories" : 
                "Location is optional - search nationwide or in specific areas"}
            </div>
          </div>

          <button 
            type="button"
            onClick={() => handleSearch()}
            className="search-button modern-search-btn"
            disabled={(!searchForm.placeType && searchForm.selectedCategories.length === 0) || searchLoading}
          >
            <div className="btn-content">
              {searchLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <FaSearch className="btn-icon" />
                  <span>Find Places</span>
                </>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  const renderSearchResults = () => {
    console.log('🔍 Rendering search results - searchLoading:', searchLoading);
    console.log('🔍 Rendering search results - searchResults:', searchResults);
    console.log('🔍 Rendering search results - searchResults.length:', searchResults.length);
    
    return (
      <>
        <div className="search-results-page">
          <div className="search-results-header">
            <div className="results-header-content">
              <div className="results-title-section">
                <h2 className="results-title">
                  <span className="results-icon">🎯</span>
                  Search Results
        </h2>
                <p className="results-count">
                  Found {searchResults.length} amazing places
                </p>
              </div>
              <button 
                onClick={() => {
                  setViewMode('homepage');
                  setSearchResults([]);
                  setSearchForm({ placeType: '', state: '', city: '', zipCode: '', selectedCategories: [] });
                  setSearchLoading(false);
                  // Clear URL parameters
                  window.history.pushState({}, '', window.location.pathname);
                }}
                className="back-button modern-back-btn"
              >
                <FaTimes className="btn-icon" />
                <span>New Search</span>
              </button>
            </div>
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
      </div>
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
        {viewMode === 'homepage' && (
          <div className="hero-section">
            <div className="hero-content">
              <h1 className="hero-title">{user ? 'Discover Remarkable Places' : 'Plan your next adventure'}</h1>
              <p className="hero-subtitle">{user ? 'Find the perfect spots for your next adventure with friends' : 'Organize trips, collaborate with friends, and keep all your travel plans in one place'}</p>
              
              <div className="hero-actions">
                {user ? (
                  <>
                    <button 
                      className="hero-search-button"
                      onClick={() => {
                        setViewMode('search');
                        setTimeout(scrollToSearch, 100);
                      }}
                    >
                      <FaSearch className="button-icon" />
                      Start Exploring
                    </button>
                    <button className="hero-secondary-button">
                      Learn More
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      className="hero-search-button"
                      onClick={() => navigate('/register')}
                    >
                      Get Started
                    </button>
                    <button 
                      className="hero-secondary-button"
                      onClick={() => navigate('/login')}
                    >
                      Sign In
                    </button>
                  </>
                )}
              </div>
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
        )}

        <div className="places-container" ref={searchSectionRef}>
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
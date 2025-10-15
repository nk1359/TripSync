import React, { useEffect, useState, useContext } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthContext } from './AuthContext';
import { useToast } from './ToastContext';
import Layout from './Layout';
import AddToCalendarModal from './AddToCalendarModal';
import DateRangePicker from './DateRangePicker';
import { FaSearch, FaCalendarPlus, FaStar, FaMapMarkerAlt, FaCity, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import './styles/Home.css';
import API_URL from '../config';

const Search = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  
  const [searchForm, setSearchForm] = useState({
    placeType: '',
    city: '',
    state: '',
    zipCode: '',
    selectedCategories: []
  });
  
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [selectedPlaceForModal, setSelectedPlaceForModal] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [placeImages, setPlaceImages] = useState([]);
  const [viewMode, setViewMode] = useState('search'); // 'search' or 'results'
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [cityAutocompleteResults, setCityAutocompleteResults] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [showCityAutocomplete, setShowCityAutocomplete] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [plannerContext, setPlannerContext] = useState(null);
  const [showTripSelector, setShowTripSelector] = useState(false);
  const [selectedTripForPlanner, setSelectedTripForPlanner] = useState(null);
  const [selectedDayForPlanner, setSelectedDayForPlanner] = useState('');
  const [trips, setTrips] = useState([]);
  const [slideDirection, setSlideDirection] = useState('next');
  const [imagesLoading, setImagesLoading] = useState(false);
  
  // Trip creation states
  const [showTripModal, setShowTripModal] = useState(false);
  const [tripForm, setTripForm] = useState({
    tripName: '',
    description: '',
    startDate: '',
    endDate: '',
    memberIds: []
  });
  const [tripFriends, setTripFriends] = useState([]);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [tripLocations, setTripLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState({
    destination: '',
    place_id: '',
    lat: null,
    lng: null,
    startDate: '',
    endDate: ''
  });
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  const availableCategories = [
    'Restaurants', 'Hotels', 'Parks', 'Museums', 
    'Shopping', 'Nightlife', 'Attractions', 'Entertainment',
    'Cafes', 'Bars', 'Bakeries', 'Spas', 'Gyms',
    'Beaches', 'Trails', 'Landmarks', 'Galleries',
    'Stadiums', 'Theaters', 'Zoos'
  ];

  // Check for planner context
  useEffect(() => {
    if (location.state?.fromPlanner) {
      setPlannerContext(location.state);
    }
  }, [location.state]);

  // Fetch trips on mount
  useEffect(() => {
    if (user?.user_id) {
      fetchTrips();
    }
  }, [user]);

  // Check for URL search parameters on mount and when URL changes
  useEffect(() => {
    const queryParam = searchParams.get('q');
    
    // If no user is logged in but URL params exist, keep them until login
    if (!user?.user_id) {
      if (queryParam) {
        showToast('Please log in to view search results', 'info');
      }
      return;
    }
    
    // If logged in and URL params exist, perform search
    if (queryParam) {
      // Parse the query format (e.g., "hotels-in-syracuse" or "restaurants-in-new-york-ny")
      const parts = queryParam.split('-in-');
      if (parts.length >= 2) {
        const placeType = parts[0].replace(/-/g, ' ');
        const locationParts = parts[1].split('-');
        
        // Parse location (could be "city", "city-state", or multi-word city)
        let city = '';
        let state = '';
        
        if (locationParts.length >= 2) {
          const lastPart = locationParts[locationParts.length - 1].toUpperCase();
          // Check if last part is a state abbreviation (2 letters)
          if (lastPart.length === 2) {
            state = lastPart;
            city = locationParts.slice(0, -1).join(' ');
          } else {
            city = locationParts.join(' ');
          }
        } else {
          city = locationParts.join(' ');
        }
        
        // Set the form and perform search
        setSearchForm({
          placeType: placeType,
          city: city,
          state: state,
          zipCode: '',
          selectedCategories: []
        });
        
        // Trigger search automatically
        performSearchFromURL(placeType, city, state);
      }
    }
  }, [user, searchParams]);

  const fetchTrips = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`${API_URL}/api/trips/${user.user_id}`);
      const data = await response.json();
      setTrips(data.trips || []);
    } catch (error) {
      console.error('Error fetching trips:', error);
    }
  };

  // Helper to parse date string without timezone conversion
  const parseDateString = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const getTripDays = (trip) => {
    if (!trip || !trip.start_date || !trip.end_date) return [];
    
    const start = parseDateString(trip.start_date);
    const end = parseDateString(trip.end_date);
    const days = [];
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      days.push(new Date(date).toISOString().split('T')[0]);
    }
    
    return days;
  };

  const handleOpenPlannerSelector = (place) => {
    setSelectedPlaceForModal(place);
    setShowTripSelector(true);
    
    // Pre-select trip and day if from planner
    if (plannerContext) {
      const trip = trips.find(t => t.trip_id === plannerContext.tripId);
      setSelectedTripForPlanner(trip);
      setSelectedDayForPlanner(plannerContext.selectedDay);
    }
  };

  // Trip creation helper functions
  const fetchFriendsForTrip = async () => {
    try {
      const response = await fetch(`${API_URL}/api/friends/${user.user_id}`);
      const data = await response.json();
      setTripFriends(data.friends || []);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  };

  const toggleFriendSelection = (friendId) => {
    setSelectedFriends(prev => 
      prev.includes(friendId) 
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const fetchLocationSuggestions = async (query) => {
    if (query.length < 2) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/autocomplete/places?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const formatted = (data || []).map(item => {
        const parts = item.description.split(',').map(p => p.trim());
        return {
          place_id: item.place_id,
          main_text: parts[0],
          secondary_text: parts.slice(1).join(', '),
          description: item.description
        };
      });
      
      setLocationSuggestions(formatted);
      setShowLocationSuggestions(true);
    } catch (error) {
      console.error('Error fetching location suggestions:', error);
    }
  };

  const handleAddLocation = () => {
    if (!currentLocation.destination || !currentLocation.startDate) {
      showToast('Please enter destination and start date', 'info');
      return;
    }

    if (editingLocationId) {
      setTripLocations(tripLocations.map(loc => 
        loc.id === editingLocationId ? { ...currentLocation, id: editingLocationId } : loc
      ));
      setEditingLocationId(null);
    } else {
      setTripLocations([...tripLocations, { ...currentLocation, id: Date.now() }]);
    }
    
    setCurrentLocation({ destination: '', place_id: '', lat: null, lng: null, startDate: '', endDate: '' });
  };

  const handleEditLocation = (locationId) => {
    const locationToEdit = tripLocations.find(loc => loc.id === locationId);
    if (locationToEdit) {
      setCurrentLocation(locationToEdit);
      setEditingLocationId(locationId);
    }
  };

  const handleRemoveLocation = (locationId) => {
    setTripLocations(tripLocations.filter(loc => loc.id !== locationId));
    if (editingLocationId === locationId) {
      setEditingLocationId(null);
      setCurrentLocation({ destination: '', place_id: '', lat: null, lng: null, startDate: '', endDate: '' });
    }
  };

  const handleLocationSelect = async (location) => {
    try {
      // Fetch place details to get coordinates
      const response = await fetch(`${API_URL}/api/place-details?place_id=${location.place_id}`);
      const data = await response.json();
      
      setCurrentLocation(prev => ({
        ...prev,
        destination: location.description,
        place_id: location.place_id,
        lat: data.lat,
        lng: data.lng
      }));
      setShowLocationSuggestions(false);
    } catch (error) {
      console.error('Error fetching place details:', error);
      // Fallback: just set the text without coordinates
      setCurrentLocation(prev => ({
        ...prev,
        destination: location.description,
        place_id: location.place_id
      }));
      setShowLocationSuggestions(false);
    }
  };

  const handleCreateTrip = async () => {
    if (!tripForm.tripName.trim()) {
      showToast('Please enter a trip name', 'info');
      return;
    }

    // Auto-add current location if it has data
    let finalLocations = [...tripLocations];
    if (currentLocation.destination && currentLocation.startDate) {
      finalLocations.push({ ...currentLocation, id: Date.now() });
    }

    if (finalLocations.length === 0) {
      showToast('Please add at least one destination', 'info');
      return;
    }

    // Calculate trip dates from destinations
    const startDates = finalLocations.map(loc => loc.startDate).filter(date => date);
    const endDates = finalLocations.map(loc => loc.endDate || loc.startDate).filter(date => date);
    
    if (startDates.length === 0) {
      showToast('Please ensure all destinations have dates', 'info');
      return;
    }

    const tripStartDate = new Date(Math.min(...startDates.map(date => new Date(date))));
    const tripEndDate = new Date(Math.max(...endDates.map(date => new Date(date))));

    try {
      const response = await fetch(`${API_URL}/api/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_name: tripForm.tripName,
          description: tripForm.description,
          start_date: tripStartDate.toISOString().split('T')[0],
          end_date: tripEndDate.toISOString().split('T')[0],
          created_by: user.user_id,
          member_ids: [],
          destinations: finalLocations.map(loc => ({
            destination: loc.destination,
            place_id: loc.place_id,
            lat: loc.lat,
            lng: loc.lng,
            start_date: loc.startDate,
            end_date: loc.endDate || loc.startDate
          }))
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        const newTripId = data.trip_id;
        
        if (selectedFriends.length > 0) {
          const requestPromises = selectedFriends.map(friendId =>
            fetch(`${API_URL}/api/trips/${newTripId}/member-requests`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requester_id: user.user_id,
                friend_id: friendId
              })
            })
          );
          
          try {
            await Promise.all(requestPromises);
            showToast(`Trip created! ${selectedFriends.length} friend invitation${selectedFriends.length > 1 ? 's' : ''} sent.`, 'success');
          } catch (error) {
            console.error('Error sending friend invitations:', error);
            showToast('Trip created, but some invitations failed to send', 'error');
          }
        } else {
          showToast('Trip created successfully!', 'success');
        }
        
        // Close trip creation modal and refresh trips
        setShowTripModal(false);
        setTripForm({ tripName: '', description: '', startDate: '', endDate: '', memberIds: [] });
        setTripLocations([]);
        setCurrentLocation({ destination: '', place_id: '', lat: null, lng: null, startDate: '', endDate: '' });
        setSelectedFriends([]);
        setFriendSearchQuery('');
        setShowAllFriends(false);
        fetchTrips();

        // Select the newly created trip and open day selector
        const newTrip = { trip_id: newTripId, trip_name: tripForm.tripName, start_date: tripStartDate.toISOString().split('T')[0], end_date: tripEndDate.toISOString().split('T')[0] };
        setSelectedTripForPlanner(newTrip);
        setShowTripSelector(true);
      } else {
        showToast(data.error || 'Failed to create trip', 'error');
      }
    } catch (error) {
      console.error('Error creating trip:', error);
      showToast('Failed to create trip', 'error');
    }
  };

  // Fetch friends when trip modal opens
  useEffect(() => {
    if (showTripModal && user?.user_id) {
      fetchFriendsForTrip();
    }
  }, [showTripModal, user]);

  const handleAddToPlanner = async () => {
    if (!selectedTripForPlanner || !selectedDayForPlanner) {
      showToast('Please select a trip and date', 'info');
      return;
    }
    
    const itemData = {
      trip_id: selectedTripForPlanner.trip_id,
      item_name: selectedPlaceForModal.place_name,
      item_type: selectedPlaceForModal.category || 'attraction',
      description: '',
      location: selectedPlaceForModal.address || selectedPlaceForModal.city_name || '',
      start_date: selectedDayForPlanner,
      end_date: selectedDayForPlanner,
      start_time: null,
      end_time: null,
      cost: null,
      notes: '',
      created_by: user.user_id,
      google_place_id: selectedPlaceForModal.place_id,
      latitude: selectedPlaceForModal.lat,
      longitude: selectedPlaceForModal.lng
    };
    
    try {
      const response = await fetch(`${API_URL}/api/planner/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });

      const data = await response.json();

      if (response.ok) {
        if (data.item) {
          sessionStorage.setItem('newPlannerItem', JSON.stringify(data.item));
        }
        
        setShowTripSelector(false);
        setSelectedPlaceForModal(null);
        
        // Show success message - user can manually navigate back when ready
        showToast(`Added ${selectedPlaceForModal.place_name} to your trip!`, 'success');
      } else {
        showToast(data.error || 'Failed to add to planner', 'error');
      }
    } catch (error) {
      console.error('Error adding to planner:', error);
      showToast('Failed to add to planner', 'error');
    }
  };

  // Fetch autocomplete for place type
  const fetchAutocomplete = async (query) => {
    if (query.length < 2) {
      setAutocompleteResults([]);
      setShowAutocomplete(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/autocomplete?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const formatted = (data || []).map(item => {
        const parts = item.description.split(',');
        return {
          place_id: item.place_id,
          main_text: parts[0].trim(),
          secondary_text: parts.slice(1).join(',').trim()
        };
      });
      
      setAutocompleteResults(formatted);
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
      const response = await fetch(`${API_URL}/api/autocomplete/cities?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const formatted = (data || []).map(item => {
        const parts = item.description.split(',').map(p => p.trim());
        return {
          place_id: item.place_id,
          city: parts[0],
          state: parts.length > 1 ? parts[parts.length - 2] : '',
          description: item.description
        };
      });
      
      setCityAutocompleteResults(formatted);
      setShowCityAutocomplete(true);
    } catch (error) {
      console.error('Error fetching city autocomplete:', error);
      setCityAutocompleteResults([]);
      setShowCityAutocomplete(false);
    }
  };

  const handleInputChange = (field, value) => {
    setSearchForm(prev => ({ ...prev, [field]: value }));
    
    if (field === 'placeType') {
      fetchAutocomplete(value);
    } else if (field === 'city') {
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
    setSearchForm(prev => {
      const isSelected = prev.selectedCategories.includes(category);
      return {
        ...prev,
        selectedCategories: isSelected
          ? prev.selectedCategories.filter(c => c !== category)
          : [...prev.selectedCategories, category]
      };
    });
  };

  const handlePlaceSelect = async (place) => {
    // Search for this specific place
    setSearchLoading(true);
    setViewMode('results');
    setSearchResults([]);
    setNextPageToken(null);
    
    try {
      const response = await fetch(`${API_URL}/api/search?place_type=${encodeURIComponent(place.main_text)}`);
      const data = await response.json();
      
      setSearchResults(data.places || []);
      setNextPageToken(data.next_page_token || null);
      setSearchLoading(false);
      setShowAutocomplete(false);
    } catch (error) {
      console.error('Error searching place:', error);
      setSearchLoading(false);
    }
  };

  const performSearchFromURL = async (placeType, city, state) => {
    setSearchLoading(true);
    setViewMode('results');
    setSearchResults([]);
    setNextPageToken(null);
    
    try {
      const params = new URLSearchParams();
      if (placeType) params.append('place_type', placeType);
      if (city) params.append('city', city);
      if (state) params.append('state', state);

      const response = await fetch(`${API_URL}/api/search?${params}`);
      const data = await response.json();
      
      setSearchResults(data.places || []);
      setNextPageToken(data.next_page_token || null);
      setSearchLoading(false);
    } catch (error) {
      console.error('Error searching places:', error);
      setSearchLoading(false);
      showToast('Failed to search places', 'error');
    }
  };

  const handleSearch = async () => {
    if (!searchForm.placeType && searchForm.selectedCategories.length === 0) {
      showToast('Please enter what you\'re looking for or select a category', 'info');
      return;
    }

    if (searchForm.selectedCategories.length > 0 && !searchForm.city) {
      showToast('Please select a city when using categories', 'info');
      return;
    }

    // Update URL with search parameters
    if (searchForm.placeType) {
      const placeTypeSlug = searchForm.placeType.toLowerCase().replace(/\s+/g, '-');
      let queryString = placeTypeSlug;
      
      if (searchForm.city) {
        const citySlug = searchForm.city.toLowerCase().replace(/\s+/g, '-');
        const stateSlug = searchForm.state ? `-${searchForm.state.toLowerCase()}` : '';
        queryString = `${placeTypeSlug}-in-${citySlug}${stateSlug}`;
      }
      
      setSearchParams({ q: queryString });
    }

    setSearchLoading(true);
    setViewMode('results');
    setSearchResults([]);
    setNextPageToken(null);
    
    try {
      const params = new URLSearchParams();
      if (searchForm.placeType) params.append('place_type', searchForm.placeType);
      if (searchForm.city) params.append('city', searchForm.city);
      if (searchForm.state) params.append('state', searchForm.state);
      if (searchForm.selectedCategories.length > 0) {
        params.append('categories', searchForm.selectedCategories.join(','));
      }

      const response = await fetch(`${API_URL}/api/search?${params}`);
      const data = await response.json();
      
      setSearchResults(data.places || []);
      setNextPageToken(data.next_page_token || null);
      setSearchLoading(false);
    } catch (error) {
      console.error('Error searching places:', error);
      setSearchLoading(false);
      showToast('Failed to search places', 'error');
    }
  };

  const handleLoadMore = async () => {
    if (!nextPageToken || loadingMore) return;

    setLoadingMore(true);
    
    try {
      const response = await fetch(`${API_URL}/api/search?page_token=${nextPageToken}`);
      const data = await response.json();
      
      setSearchResults(prev => [...prev, ...(data.places || [])]);
      setNextPageToken(data.next_page_token || null);
      setLoadingMore(false);
    } catch (error) {
      console.error('Error loading more results:', error);
      setLoadingMore(false);
      showToast('Failed to load more results', 'error');
    }
  };

  const handlePlaceCardClick = async (place) => {
    setSelectedPlaceForModal(place);
    setCurrentImageIndex(0);
    setSlideDirection('next');
    setImagesLoading(true);
    setPlaceImages([]); // Clear previous images
    
    try {
      const response = await fetch(`${API_URL}/api/place/${place.place_id}`);
      const data = await response.json();
      
      let images = [];
      if (data.photos && data.photos.length > 0) {
        images = data.photos;
      } else if (place.image_url) {
        images = [place.image_url];
      } else {
        images = ['https://via.placeholder.com/600x400/1a1a2e/ffffff?text=No+Image'];
      }
      
      setPlaceImages(images);
      setImagesLoading(false);
    } catch (error) {
      console.error('Error fetching place details:', error);
      setPlaceImages([place.image_url || 'https://via.placeholder.com/600x400/1a1a2e/ffffff?text=No+Image']);
      setImagesLoading(false);
    }
  };

  // Display all results without restriction
  const getDisplayableResults = (results) => {
    return results;
  };

  const renderPlaceCard = (place) => (
    <div 
      key={place.place_id} 
      className="place-card"
      onClick={() => handlePlaceCardClick(place)}
      style={{ cursor: 'pointer' }}
    >
      <div className="place-image-container">
        <img
          src={place.image_url || 'https://via.placeholder.com/400x250/1a1a2e/ffffff?text=No+Image'}
          alt={place.place_name}
          className="place-image"
          onError={(e) => {
            e.target.src = 'https://via.placeholder.com/400x250/1a1a2e/6366f1?text=No+Image+Available';
          }}
        />
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

  const renderSearchSkeleton = () => (
    <div className="places-grid">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <React.Fragment key={i}>{renderSkeletonCard()}</React.Fragment>
      ))}
    </div>
  );

  const renderSearchForm = () => (
    <div className="search-page">
      <div className="back-to-home">
        <button 
          onClick={() => {
            if (plannerContext) {
              navigate('/planner');
            } else {
              navigate('/');
            }
          }}
          className="back-home-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          {plannerContext ? 'Back to Planner' : 'Back to Home'}
        </button>
      </div>
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
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setShowAutocomplete(false);
                      handleSearch();
                    }
                  }}
                  className="modern-input"
                />
              </div>
              {showAutocomplete && autocompleteResults.length > 0 && (
                <div className="autocomplete-dropdown modern-dropdown">
                  <div className="autocomplete-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                    Click to search this place directly
                  </div>
                  {autocompleteResults.map((place) => (
                    <div
                      key={place.place_id}
                      className="autocomplete-item modern-item"
                      onClick={() => handlePlaceSelect(place)}
                    >
                      <svg className="item-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
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
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setShowCityAutocomplete(false);
                        handleSearch();
                      }
                    }}
                    className="modern-input"
                  />
                </div>
                {showCityAutocomplete && cityAutocompleteResults.length > 0 && (
                  <div className="autocomplete-dropdown modern-dropdown">
                    <div className="autocomplete-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
                      Click to select city and auto-fill state
                    </div>
                    {cityAutocompleteResults.map((city) => (
                      <div
                        key={city.place_id}
                        className="autocomplete-item modern-item"
                        onClick={() => handleCitySelect(city)}
                      >
                        <svg className="item-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7"></rect>
                          <rect x="14" y="3" width="7" height="7"></rect>
                          <rect x="14" y="14" width="7" height="7"></rect>
                          <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
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
                  <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                  <input
                    id="state"
                    type="text"
                    placeholder="State (e.g., California, New York)"
                    value={searchForm.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearch();
                      }
                    }}
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
            disabled={!searchForm.placeType && searchForm.selectedCategories.length === 0}
          >
            <div className="btn-content">
              <FaSearch className="btn-icon" />
              <span>Find Places</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  const renderSearchResults = () => (
    <>
      <div className="search-results-page">
        <div className="results-top-bar">
          <button 
            onClick={() => {
              if (plannerContext) {
                navigate('/planner');
              } else {
                navigate('/');
              }
            }}
            className="back-home-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            {plannerContext ? 'Back to Planner' : 'Back to Home'}
          </button>
        </div>
        
        <div className="search-results-header">
          <div className="results-header-content">
            <h2 className="results-title">
              <svg className="results-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              Search Results
            </h2>
            <p className="results-count">
              Found {searchResults.length} amazing places
            </p>
          </div>
          
          <button 
            onClick={() => {
              setViewMode('search');
              setSearchResults([]);
              setSearchLoading(false);
              setSearchParams({}); // Clear URL parameters
            }}
            className="new-search-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <span>New Search</span>
          </button>
        </div>
      
        {searchLoading ? (
          renderSearchSkeleton()
        ) : searchResults.length > 0 ? (
          <>
            <div className="places-grid">
              {getDisplayableResults(searchResults).map(place => renderPlaceCard(place))}
            </div>
            
            {nextPageToken && (
              <div style={{ textAlign: 'center', marginTop: '2rem', marginBottom: '2rem' }}>
                <button 
                  className="load-more-btn"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading...' : 'Load More Results'}
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

  return (
    <Layout>
      <div className="home-page">
        <div className="places-container">
          {viewMode === 'search' && renderSearchForm()}
          {viewMode === 'results' && renderSearchResults()}
        </div>
      </div>
      
      {isCalendarModalOpen && selectedPlaceForModal && (
        <AddToCalendarModal 
          place={selectedPlaceForModal} 
          onClose={() => setIsCalendarModalOpen(false)} 
        />
      )}

      {selectedPlaceForModal && !showTripSelector && (
        <div className="place-modal-overlay" onClick={() => setSelectedPlaceForModal(null)}>
          <div className="search-place-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="search-modal-close"
              onClick={() => setSelectedPlaceForModal(null)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            
            {/* Image Carousel */}
            <div className={`search-modal-carousel ${slideDirection === 'prev' ? 'slide-prev' : ''}`}>
              {imagesLoading ? (
                <div className="carousel-skeleton">
                  <div className="skeleton-shimmer"></div>
                </div>
              ) : placeImages.length > 0 ? (
                <>
                  <img 
                    key={currentImageIndex}
                    src={placeImages[currentImageIndex]} 
                    alt={selectedPlaceForModal.place_name}
                    className="search-modal-image"
                  />
                  {placeImages.length > 1 && (
                    <>
                      <button className="carousel-nav prev" onClick={(e) => {
                        e.stopPropagation();
                        setSlideDirection('prev');
                        setCurrentImageIndex(prev => prev === 0 ? placeImages.length - 1 : prev - 1);
                      }}>
                        <FaChevronLeft />
                      </button>
                      <button className="carousel-nav next" onClick={(e) => {
                        e.stopPropagation();
                        setSlideDirection('next');
                        setCurrentImageIndex(prev => prev === placeImages.length - 1 ? 0 : prev + 1);
                      }}>
                        <FaChevronRight />
                      </button>
                      <div className="carousel-indicators">
                        {placeImages.map((_, index) => (
                          <div
                            key={index}
                            className={`indicator ${index === currentImageIndex ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSlideDirection(index > currentImageIndex ? 'next' : 'prev');
                              setCurrentImageIndex(index);
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : null}
            </div>

            {/* Place Details */}
            <div className="search-modal-content">
              <h2 className="search-modal-title">{selectedPlaceForModal.place_name}</h2>
              
              <div className="search-modal-info">
                <div className="modal-info-row">
                  <FaStar className="info-icon star" />
                  <span>{selectedPlaceForModal.rating || 'N/A'}</span>
                </div>
                
                <div className="modal-info-row">
                  <FaMapMarkerAlt className="info-icon" />
                  <span>{selectedPlaceForModal.address || selectedPlaceForModal.city_name || 'Address not available'}</span>
                </div>
                
                <div className="modal-info-row">
                  <FaCity className="info-icon" />
                  <span>{selectedPlaceForModal.category || 'Category'}</span>
                </div>
              </div>

              <button 
                className="search-modal-add-btn" 
                onClick={() => handleOpenPlannerSelector(selectedPlaceForModal)}
              >
                Add to Planner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip/Day Selector Modal */}
      {showTripSelector && selectedPlaceForModal && (
        <div className="place-modal-overlay" onClick={() => setShowTripSelector(false)}>
          <div className="search-place-modal trip-selector-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="search-modal-close"
              onClick={() => setShowTripSelector(false)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <div className="search-modal-content">
              <h2 className="search-modal-title">Add to Trip</h2>
              <p className="search-modal-subtitle">Select which trip and day to add "{selectedPlaceForModal.place_name}"</p>

              <div className="trip-selector-form">
                <div className="form-group">
                  <label>Select Trip *</label>
                  <div className="select-wrapper">
                    <select
                      value={selectedTripForPlanner?.trip_id || ''}
                      onChange={(e) => {
                        const trip = trips.find(t => t.trip_id === parseInt(e.target.value));
                        setSelectedTripForPlanner(trip);
                        setSelectedDayForPlanner('');
                      }}
                      className="trip-select-input"
                    >
                      <option value="">Choose a trip...</option>
                      {trips.map(trip => (
                        <option key={trip.trip_id} value={trip.trip_id}>
                          {trip.trip_name || trip.group_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      setShowTripSelector(false);
                      setShowTripModal(true);
                    }}
                    className="create-new-trip-btn"
                    style={{
                      marginTop: '0.75rem',
                      width: '100%',
                      padding: '0.75rem',
                      background: 'transparent',
                      border: '1px dashed #52525b',
                      borderRadius: '6px',
                      color: '#a1a1aa',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#6366f1';
                      e.currentTarget.style.color = '#6366f1';
                      e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#52525b';
                      e.currentTarget.style.color = '#a1a1aa';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Create New Trip
                  </button>
                </div>

                {selectedTripForPlanner && (
                  <div className="form-group">
                    <label>Select Day *</label>
                    <div className="select-wrapper">
                      <select
                        value={selectedDayForPlanner}
                        onChange={(e) => setSelectedDayForPlanner(e.target.value)}
                        className="trip-select-input"
                      >
                        <option value="">Choose a day...</option>
                        {getTripDays(selectedTripForPlanner).map(day => {
                          const date = parseDateString(day);
                          return (
                            <option key={day} value={day}>
                              {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                )}

                <div className="trip-selector-actions">
                  <button
                    onClick={() => setShowTripSelector(false)}
                    className="trip-selector-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddToPlanner}
                    className="trip-selector-add"
                    disabled={!selectedTripForPlanner || !selectedDayForPlanner}
                  >
                    Add to Planner
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trip Creation Modal */}
      {showTripModal && (
        <div className="trip-modal-overlay" onClick={() => setShowTripModal(false)}>
          <div className="trip-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="trip-modal-header">
              <h2>Create New Trip</h2>
              <button className="trip-modal-close" onClick={() => setShowTripModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="trip-modal-body">
              {/* Trip Basic Info */}
              <div className="trip-form-section">
                <label>Trip Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Summer Europe Adventure"
                  value={tripForm.tripName}
                  onChange={(e) => setTripForm({...tripForm, tripName: e.target.value})}
                  className="trip-input"
                />
              </div>

              <div className="trip-form-section">
                <label>Description</label>
                <textarea
                  placeholder="Add trip details..."
                  value={tripForm.description}
                  onChange={(e) => setTripForm({...tripForm, description: e.target.value})}
                  className="trip-textarea"
                  rows="3"
                />
              </div>

              {/* Invite Friends Section */}
              {tripFriends.length > 0 && (
                <div className="trip-form-section">
                  <label>Invite Friends (Optional)</label>
                  
                  <div className="friend-search-container">
                    <input
                      type="text"
                      placeholder="Search friends..."
                      value={friendSearchQuery}
                      onChange={(e) => setFriendSearchQuery(e.target.value)}
                      className="trip-input"
                      style={{ marginBottom: '1rem' }}
                    />
                  </div>

                  <div className="friends-selection-grid">
                    {(() => {
                      const filteredFriends = tripFriends.filter(friend => {
                        const searchLower = friendSearchQuery.toLowerCase();
                        return (
                          `${friend.first_name} ${friend.last_name}`.toLowerCase().includes(searchLower) ||
                          friend.username?.toLowerCase().includes(searchLower)
                        );
                      });
                      
                      const friendsToShow = friendSearchQuery || showAllFriends 
                        ? filteredFriends 
                        : filteredFriends.slice(0, 2);
                      
                      return friendsToShow.map(friend => (
                        <div 
                          key={friend.user_id}
                          className={`friend-chip ${selectedFriends.includes(friend.user_id) ? 'selected' : ''}`}
                          onClick={() => toggleFriendSelection(friend.user_id)}
                        >
                          <div className="friend-chip-avatar">
                            {friend.first_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="friend-chip-name">{friend.first_name} {friend.last_name}</span>
                          {selectedFriends.includes(friend.user_id) && (
                            <svg className="friend-check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                  
                  {!friendSearchQuery && tripFriends.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setShowAllFriends(!showAllFriends)}
                      className="show-more-friends-btn"
                      style={{ marginTop: '0.75rem' }}
                    >
                      {showAllFriends ? 'Show Less' : `Show ${tripFriends.length - 2} More`}
                    </button>
                  )}
                  
                  {selectedFriends.length > 0 && (
                    <p className="selected-friends-count">
                      {selectedFriends.length} friend{selectedFriends.length > 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              {/* Destinations & Dates */}
              <div className="trip-form-section">
                <label>Destinations & Dates *</label>
                <div className="destinations-container">
                  {/* Destination Input Box */}
                  <div className="destination-input-box">
                    <div className="location-input-wrapper">
                      <input
                        type="text"
                        placeholder="Search destination (e.g., Paris, France or 123 Main St)"
                        value={currentLocation.destination}
                        onChange={(e) => {
                          setCurrentLocation(prev => ({...prev, destination: e.target.value}));
                          if (e.target.value.length >= 2) {
                            fetchLocationSuggestions(e.target.value);
                          }
                        }}
                        onFocus={() => currentLocation.destination?.length >= 2 && setShowLocationSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 200)}
                        className="trip-input destination-search"
                      />
                      {showLocationSuggestions && locationSuggestions.length > 0 && (
                        <div className="autocomplete-dropdown modern-dropdown">
                          {locationSuggestions.map((location) => (
                            <div
                              key={location.place_id}
                              className="autocomplete-item modern-item"
                              onClick={() => handleLocationSelect(location)}
                            >
                              <svg className="item-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                              </svg>
                              <div className="item-content">
                                <div className="autocomplete-main">{location.main_text}</div>
                                <div className="autocomplete-secondary">{location.secondary_text}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Date Range for this destination */}
                    <DateRangePicker
                      startDate={currentLocation.startDate}
                      endDate={currentLocation.endDate}
                      onStartDateChange={(date) => setCurrentLocation(prev => ({...prev, startDate: date}))}
                      onEndDateChange={(date) => setCurrentLocation(prev => ({...prev, endDate: date}))}
                      label="Dates for this destination"
                    />
                    
                    {/* Add/Update Button */}
                    <button
                      type="button"
                      onClick={handleAddLocation}
                      className={`add-destination-btn ${editingLocationId ? 'update-mode' : ''}`}
                      title={editingLocationId ? "Update destination" : "Add destination"}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        {editingLocationId ? (
                          <polyline points="20 6 9 17 4 12"></polyline>
                        ) : (
                          <>
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                          </>
                        )}
                      </svg>
                    </button>
                  </div>

                  {/* Added Destinations List */}
                  {tripLocations.length > 0 && (
                    <div className="added-destinations">
                      {tripLocations.map(location => (
                        <div key={location.id} className={`destination-chip ${editingLocationId === location.id ? 'editing' : ''}`}>
                          <div className="destination-chip-content">
                            <div className="destination-name">{location.destination}</div>
                            <div className="destination-dates">
                              {location.startDate && parseDateString(location.startDate)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {location.endDate && ` - ${parseDateString(location.endDate)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                            </div>
                          </div>
                          <div className="destination-chip-actions">
                            <button
                              onClick={() => handleEditLocation(location.id)}
                              className="edit-destination-btn"
                              title="Edit destination"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            <button
                              onClick={() => handleRemoveLocation(location.id)}
                              className="remove-destination-btn"
                              title="Remove destination"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="trip-modal-footer">
                <button
                  onClick={() => setShowTripModal(false)}
                  className="trip-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTrip}
                  className="trip-create-btn"
                >
                  Create Trip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Search;

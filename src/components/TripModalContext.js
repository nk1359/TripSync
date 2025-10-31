import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_URL from '../config';
import { useToast } from './ToastContext';
import { AuthContext } from './AuthContext';
import TripModal from './TripModal';

const TripModalContext = createContext();

export const useTripModal = () => {
  const context = useContext(TripModalContext);
  if (!context) {
    throw new Error('useTripModal must be used within TripModalProvider');
  }
  return context;
};

export const TripModalProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const navigate = useNavigate();

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
  const [showFriendsBox, setShowFriendsBox] = useState(false);
  const [tripLocations, setTripLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState({
    destination: '',
    place_id: '',
    lat: null,
    lng: null,
    startDate: '',
    endDate: ''
  });
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState(null);

  // Mobile modal drag state
  const [isMobile, setIsMobile] = useState(false);
  const [modalExpanded, setModalExpanded] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth <= 768;
      setIsMobile(width);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Listen for create trip modal events
  useEffect(() => {
    const handleOpenCreateTrip = () => {
      setShowTripModal(true);
    };
    
    const handleCloseCreateTrip = () => {
      setShowTripModal(false);
    };
    
    window.addEventListener('openCreateTripModal', handleOpenCreateTrip);
    window.addEventListener('closeCreateTripModal', handleCloseCreateTrip);
    return () => {
      window.removeEventListener('openCreateTripModal', handleOpenCreateTrip);
      window.removeEventListener('closeCreateTripModal', handleCloseCreateTrip);
    };
  }, []);

  // Fetch friends when modal opens
  useEffect(() => {
    if (showTripModal && user?.user_id) {
      fetchFriendsForTrip();
    }
  }, [showTripModal, user]);

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

  // Handle mobile modal drag
  const handleDragStart = (e) => {
    if (!isMobile) return;
    e.stopPropagation();
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    setDragStartY(clientY);
    setDragCurrentY(clientY);
    setIsDragging(true);
  };

  const handleDragMove = (e) => {
    if (!isMobile || !isDragging) return;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    setDragCurrentY(clientY);
    
    const offset = clientY - dragStartY;
    setDragOffset(offset);
  };

  const handleDragEnd = () => {
    if (!isMobile || !isDragging) return;
    const dragDistance = dragCurrentY - dragStartY;
    
    if (dragDistance < -50 && !modalExpanded) {
      setModalExpanded(true);
    } else if (dragDistance > 100) {
      if (modalExpanded) {
        setModalExpanded(false);
      } else {
        setShowTripModal(false);
      }
    }
    
    setIsDragging(false);
    setDragStartY(0);
    setDragCurrentY(0);
    setDragOffset(0);
  };

  // Reset modal state when closing
  useEffect(() => {
    if (!showTripModal) {
      setModalExpanded(false);
      setDragOffset(0);
    }
  }, [showTripModal]);

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

  const handleLocationSelect = async (location) => {
    try {
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
      setCurrentLocation(prev => ({
        ...prev,
        destination: location.description,
        place_id: location.place_id
      }));
      setShowLocationSuggestions(false);
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
    
    setCurrentLocation({ destination: '', place_id: '', lat: null, lng: null, startDate: null, endDate: null });
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
      setCurrentLocation({ destination: '', place_id: '', lat: null, lng: null, startDate: null, endDate: null });
    }
  };

  const handleCreateTrip = async () => {
    if (!tripForm.tripName.trim()) {
      showToast('Please enter a trip name', 'info');
      return;
    }

    if (tripLocations.length === 0) {
      showToast('Please add at least one destination', 'info');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/api/trips`, {
        user_id: user.user_id,
        trip_name: tripForm.tripName,
        description: tripForm.description,
        start_date: tripForm.startDate || null,
        end_date: tripForm.endDate || null,
        member_ids: selectedFriends,
        locations: tripLocations
      });

      if (response.data.success) {
        showToast('Trip created successfully!', 'success');
        setShowTripModal(false);
        setTripForm({ tripName: '', description: '', startDate: '', endDate: '', memberIds: [] });
        setTripLocations([]);
        setCurrentLocation({ destination: '', place_id: '', lat: null, lng: null, startDate: '', endDate: '' });
        setSelectedFriends([]);
        setFriendSearchQuery('');
        setShowAllFriends(false);
        setEditingLocationId(null);
        
        // Trigger refresh on Home component if it's mounted
        window.dispatchEvent(new CustomEvent('refreshTrips'));
        
        // Navigate to planner
        navigate('/planner');
      }
    } catch (error) {
      console.error('Error creating trip:', error);
      showToast(error.response?.data?.error || 'Failed to create trip', 'error');
    }
  };

  const value = {
    showTripModal,
    setShowTripModal,
    tripForm,
    setTripForm,
    tripFriends,
    selectedFriends,
    setSelectedFriends,
    toggleFriendSelection,
    friendSearchQuery,
    setFriendSearchQuery,
    showAllFriends,
    setShowAllFriends,
    showFriendsBox,
    setShowFriendsBox,
    tripLocations,
    setTripLocations,
    currentLocation,
    setCurrentLocation,
    locationSuggestions,
    showLocationSuggestions,
    setShowLocationSuggestions,
    editingLocationId,
    setEditingLocationId,
    fetchLocationSuggestions,
    handleLocationSelect,
    handleAddLocation,
    handleEditLocation,
    handleRemoveLocation,
    handleCreateTrip,
    isMobile,
    modalExpanded,
    dragStartY,
    dragCurrentY,
    isDragging,
    dragOffset,
    handleDragStart,
    handleDragMove,
    handleDragEnd
  };

  return (
    <TripModalContext.Provider value={value}>
      {children}
      <TripModal />
    </TripModalContext.Provider>
  );
};


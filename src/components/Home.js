import React, { useEffect, useState, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './AuthContext';
import { useToast } from './ToastContext';
import Layout from './Layout';
import './styles/Home.css';
import AddToCalendarModal from './AddToCalendarModal';
import DateRangePicker from './DateRangePicker';
import { FaSearch, FaCalendarPlus, FaStar, FaMapMarkerAlt, FaCity, FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';

const Home = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const { showToast, showConfirm } = useToast();
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [welcomeData, setWelcomeData] = useState(null);
  const [selectedPlaceForModal, setSelectedPlaceForModal] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [placeImages, setPlaceImages] = useState([]);
  const [plannerContext, setPlannerContext] = useState(null);
  const [showTripSelector, setShowTripSelector] = useState(false);
  const [selectedTripForPlanner, setSelectedTripForPlanner] = useState(null);
  const [selectedDayForPlanner, setSelectedDayForPlanner] = useState('');
  
  const [nearbySpots, setNearbySpots] = useState([]);
  const [localEvents, setLocalEvents] = useState([]);
  const [featuredCards, setFeaturedCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [viewMode, setViewMode] = useState('homepage');
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);

  // Hero slideshow state
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const heroImages = [
    '/hero-background.jpg',
    '/ss1.jpg',
    '/ss2.jpeg',
    '/ss3.jpeg'
  ];

  // Trips state
  const [trips, setTrips] = useState([]);
  const [showTripModal, setShowTripModal] = useState(false);
  const [tripForm, setTripForm] = useState({
    tripName: '',
    description: '',
    memberIds: []
  });
  const [tripFriends, setTripFriends] = useState([]); // Available friends to invite
  const [selectedFriends, setSelectedFriends] = useState([]); // Selected friend IDs for this trip
  const [friendSearchQuery, setFriendSearchQuery] = useState(''); // Search query for friends
  const [showAllFriends, setShowAllFriends] = useState(false); // Show all friends or just suggestions
  const [tripLocations, setTripLocations] = useState([]);
  
  // Manage Members Modal States
  const [showManageMembersModal, setShowManageMembersModal] = useState(false);
  const [manageTripId, setManageTripId] = useState(null);
  const [tripMembers, setTripMembers] = useState([]);
  const [availableFriends, setAvailableFriends] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentInvitations, setSentInvitations] = useState([]);
  const [myPendingRequests, setMyPendingRequests] = useState([]); // Requests I've made
  
  // Fetch friends when trip modal opens
  useEffect(() => {
    if (showTripModal && user?.user_id) {
      fetchFriendsForTrip();
    }
  }, [showTripModal, user]);
  
  const fetchFriendsForTrip = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/friends/${user.user_id}`);
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
  const [currentLocation, setCurrentLocation] = useState({
    city: '',
    state: '',
    startDate: '',
    endDate: ''
  });
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

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

  // Hero slideshow auto-rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHeroIndex((prevIndex) => (prevIndex + 1) % heroImages.length);
    }, 5000); // Change image every 5 seconds

    return () => clearInterval(interval);
  }, [heroImages.length]);

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
      await fetchTrips(); // Wait for trips to load
    }
    
    // Load other sections with delays to avoid overwhelming
    setTimeout(() => loadFeaturedCards(), 100);
    setTimeout(() => loadNearbySpots(), 200);
    
    // Only load events for logged-in users
    if (user) {
      setTimeout(() => loadLocalEvents(), 300);
    }
    
    // Wait a bit for the staggered loads before hiding loading
    setTimeout(() => setLoading(false), 400);
  };

  // Handle URL parameters and planner context on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const fromPlanner = urlParams.get('from') === 'planner';
    
    // Check for planner context
    if (fromPlanner) {
      const context = sessionStorage.getItem('plannerContext');
      if (context) {
        const parsedContext = JSON.parse(context);
        setPlannerContext(parsedContext);
        
        // Try to extract city/state from trip name
        // Common formats: "NYC Trip", "Paris Adventure", "California Road Trip"
        const tripName = parsedContext.tripName || '';
        const nameParts = tripName.split(' ');
        
        // Set a default search for the trip location
        // This is a simple approach - could be enhanced with actual trip location data
        setSearchForm(prev => ({
          ...prev,
          placeType: '',
          state: '',
          city: '',
          zipCode: '',
          selectedCategories: []
        }));
      }
    }
    
    // Check for search parameters
    const placeType = urlParams.get('place_type');
    const state = urlParams.get('state');
    const city = urlParams.get('city');
    
    if (mode === 'search' || (placeType && (state || city))) {
      setSearchForm({
        placeType: placeType || '',
        state: state || '',
        city: city || '',
        zipCode: '',
        selectedCategories: []
      });
      setViewMode('search');
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

  // ===== Trip Management Functions =====

  // Fetch user's trips (groups)
  const fetchTrips = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${user.user_id}`);
      const data = await response.json();
      setTrips(data.trips || []);
    } catch (error) {
      console.error('Error fetching trips:', error);
    }
  };

  // Delete trip (only for owners)
  const handleDeleteTrip = async (tripId) => {
    const confirmed = await showConfirm({
      title: 'Delete Trip',
      message: 'Are you sure you want to delete this trip? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    
    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:5000/api/trips/${tripId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id })
      });

      const data = await response.json();

      if (response.ok) {
        showToast('Trip deleted successfully', 'success');
        fetchTrips(); // Refresh trips list
      } else {
        showToast(data.error || 'Failed to delete trip', 'error');
      }
    } catch (error) {
      console.error('Error deleting trip:', error);
      showToast('Failed to delete trip', 'error');
    }
  };

  // Fetch members for a trip
  const fetchTripMembers = async (tripId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${tripId}/members`);
      const data = await response.json();
      setTripMembers(data.members || []);
      
      // Find current user's role
      const currentMember = (data.members || []).find(m => m.user_id === user.user_id);
      const userRole = currentMember?.role || null;
      setCurrentUserRole(userRole);
      
      // Fetch all friends
      const friendsResponse = await fetch(`http://localhost:5000/api/friends/${user.user_id}`);
      const friendsData = await friendsResponse.json();
      const memberIds = (data.members || []).map(m => m.user_id);
      
      // Fetch sent invitations
      const invitationsResponse = await fetch(`http://localhost:5000/api/trips/${tripId}/sent-invitations?user_id=${user.user_id}`);
      let invitedUserIds = [];
      if (invitationsResponse.ok) {
        const invitationsData = await invitationsResponse.json();
        setSentInvitations(invitationsData.invitations || []);
        invitedUserIds = (invitationsData.invitations || []).map(inv => inv.friend_id);
      }
      
      // Fetch my pending requests (for non-owners)
      let myRequestedUserIds = [];
      if (userRole && !['owner', 'admin'].includes(userRole)) {
        const myRequestsResponse = await fetch(`http://localhost:5000/api/trips/${tripId}/my-requests?user_id=${user.user_id}`);
        if (myRequestsResponse.ok) {
          const myRequestsData = await myRequestsResponse.json();
          setMyPendingRequests(myRequestsData.requests || []);
          myRequestedUserIds = (myRequestsData.requests || []).map(req => req.friend_id);
        }
      }
      
      // Different filtering based on role:
      // - Owners/admins: filter out members and invited users (to avoid duplicate invitations)
      // - Regular members: filter out members and people they've already requested
      let available;
      if (userRole && ['owner', 'admin'].includes(userRole)) {
        available = (friendsData.friends || []).filter(
          f => !memberIds.includes(f.user_id) && !invitedUserIds.includes(f.user_id)
        );
      } else {
        available = (friendsData.friends || []).filter(
          f => !memberIds.includes(f.user_id) && !myRequestedUserIds.includes(f.user_id)
        );
      }
      
      setAvailableFriends(available);
    } catch (error) {
      console.error('Error fetching trip members:', error);
    }
  };

  // Fetch pending member requests (for owners/admins)
  const fetchPendingRequests = async (tripId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${tripId}/member-requests?user_id=${user.user_id}`);
      if (response.ok) {
        const data = await response.json();
        setPendingRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  };


  // Request to add a member (for non-owners)
  const handleRequestAddMember = async (friendId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${manageTripId}/member-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_id: user.user_id,
          friend_id: friendId
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        showToast('Request sent! Waiting for owner and friend approval.', 'success');
        // Refresh to show updated lists
        fetchTripMembers(manageTripId);
      } else {
        showToast(data.error || 'Failed to send request', 'error');
      }
    } catch (error) {
      console.error('Error requesting member addition:', error);
      showToast('Failed to send request', 'error');
    }
  };

  // Approve member request (for owners/admins)
  const handleApproveRequest = async (requestId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${manageTripId}/member-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id })
      });

      const data = await response.json();
      
      if (response.ok) {
        const msg = data.message || 'Request approved!';
        showToast(msg, 'success');
        fetchTripMembers(manageTripId);
        fetchPendingRequests(manageTripId);
        fetchTrips();
      } else {
        showToast(data.error || 'Failed to approve request', 'error');
      }
    } catch (error) {
      console.error('Error approving request:', error);
      showToast('Failed to approve request', 'error');
    }
  };

  // Reject member request (for owners/admins)
  const handleRejectRequest = async (requestId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${manageTripId}/member-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id })
      });

      const data = await response.json();
      
      if (response.ok) {
        showToast('Request rejected', 'info');
        fetchPendingRequests(manageTripId);
      } else {
        showToast(data.error || 'Failed to reject request', 'error');
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      showToast('Failed to reject request', 'error');
    }
  };

  // Send invitation to join trip (for owners/admins)
  const handleAddMemberToTrip = async (friendId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${manageTripId}/member-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_id: user.user_id,
          friend_id: friendId
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        showToast('Invitation sent! Your friend can accept or decline it.', 'success');
        // Refresh to update lists
        fetchTripMembers(manageTripId);
      } else {
        showToast(data.error || 'Failed to send invitation', 'error');
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      showToast('Failed to send invitation', 'error');
    }
  };

  // Remove member from trip
  const handleRemoveMemberFromTrip = async (memberId) => {
    const confirmed = await showConfirm({
      title: 'Remove Member',
      message: 'Are you sure you want to remove this member from the trip?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      type: 'danger'
    });
    
    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:5000/api/trips/${manageTripId}/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id })
      });

      const data = await response.json();
      
      if (response.ok) {
        fetchTripMembers(manageTripId); // Refresh members list
        fetchTrips(); // Refresh trips to update member count
      } else {
        showToast(data.error || 'Failed to remove member', 'error');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      showToast('Failed to remove member', 'error');
    }
  };

  // Open manage members modal
  useEffect(() => {
    if (showManageMembersModal && manageTripId) {
      fetchTripMembers(manageTripId);
      fetchPendingRequests(manageTripId);
    }
  }, [showManageMembersModal, manageTripId]);

  // Open trip/day selector for adding to planner
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

  // Add place to planner
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
      google_place_id: selectedPlaceForModal.place_id
    };
    
    console.log('📝 Adding to planner:', itemData);
    
    try {
      const response = await fetch('http://localhost:5000/api/planner/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });

      const data = await response.json();
      console.log('✅ Add to planner response:', data);

      if (response.ok) {
        console.log('[HOME] Item added successfully, response:', data);
        
        // Store the new item in sessionStorage for optimistic update
        if (data.item) {
          console.log('[HOME] Storing new item in sessionStorage:', data.item);
          sessionStorage.setItem('newPlannerItem', JSON.stringify(data.item));
          console.log('[HOME] Stored in sessionStorage, value:', sessionStorage.getItem('newPlannerItem'));
        } else {
          console.warn('[HOME] No item in response data');
        }
        
        setShowTripSelector(false);
        setSelectedPlaceForModal(null);
        
        // Navigate back to planner if from planner
        if (plannerContext) {
          console.log('[HOME] Navigating back to planner with new item');
          sessionStorage.removeItem('plannerContext');
          setPlannerContext(null);
          navigate('/planner');
        } else {
          showToast(`Added ${selectedPlaceForModal.place_name} to your trip!`, 'success');
        }
      } else {
        showToast(data.error || 'Failed to add to planner', 'error');
      }
    } catch (error) {
      console.error('Error adding to planner:', error);
      showToast('Failed to add to planner', 'error');
    }
  };

  // Get trip days for date picker
  const getTripDays = (trip) => {
    if (!trip || !trip.start_date || !trip.end_date) return [];
    
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    const days = [];
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      days.push(new Date(date).toISOString().split('T')[0]);
    }
    
    return days;
  };

  // Fetch location suggestions for trip creation
  const fetchLocationSuggestions = async (query) => {
    if (query.length < 2) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/autocomplete/cities?query=${encodeURIComponent(query)}`);
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
      
      setLocationSuggestions(formatted);
      setShowLocationSuggestions(true);
    } catch (error) {
      console.error('Error fetching location suggestions:', error);
    }
  };

  // Add another location (saves current and prepares for next)
  const handleAddLocation = () => {
    if (!currentLocation.city || !currentLocation.startDate) {
      showToast('Please enter city and start date', 'info');
      return;
    }

    if (editingLocationId) {
      // Update existing location
      setTripLocations(tripLocations.map(loc => 
        loc.id === editingLocationId ? { ...currentLocation, id: editingLocationId } : loc
      ));
      setEditingLocationId(null);
    } else {
      // Add current location to the list
      setTripLocations([...tripLocations, { ...currentLocation, id: Date.now() }]);
    }
    
    // Clear form to add another location
    setCurrentLocation({ city: '', state: '', startDate: '', endDate: '' });
  };

  // Edit location
  const handleEditLocation = (locationId) => {
    const locationToEdit = tripLocations.find(loc => loc.id === locationId);
    if (locationToEdit) {
      setCurrentLocation(locationToEdit);
      setEditingLocationId(locationId);
    }
  };

  // Remove location from trip
  const handleRemoveLocation = (locationId) => {
    setTripLocations(tripLocations.filter(loc => loc.id !== locationId));
    // If we're editing this location, clear the edit state
    if (editingLocationId === locationId) {
      setEditingLocationId(null);
      setCurrentLocation({ city: '', state: '', startDate: '', endDate: '' });
    }
  };

  // Select location from suggestions
  const handleLocationSelect = (location) => {
    setCurrentLocation(prev => ({
      ...prev,
      city: location.city,
      state: location.state
    }));
    setShowLocationSuggestions(false);
  };

  // Create new trip
  const handleCreateTrip = async () => {
    if (!tripForm.tripName.trim()) {
      showToast('Please enter a trip name', 'info');
      return;
    }

    // Auto-add current location if it has data and hasn't been added yet
    let finalLocations = [...tripLocations];
    if (currentLocation.city && currentLocation.state && currentLocation.startDate) {
      finalLocations.push({ ...currentLocation, id: Date.now() });
    }

    if (finalLocations.length === 0) {
      showToast('Please add at least one location', 'info');
      return;
    }

    // Get the earliest start date and latest end date from locations
    const startDates = finalLocations.map(loc => loc.startDate).filter(date => date);
    const endDates = finalLocations.map(loc => loc.endDate).filter(date => date);
    
    if (startDates.length === 0 || endDates.length === 0) {
      showToast('Please ensure all locations have valid dates', 'info');
      return;
    }

    const tripStartDate = new Date(Math.min(...startDates.map(date => new Date(date))));
    const tripEndDate = new Date(Math.max(...endDates.map(date => new Date(date))));

    try {
      // Create trip without automatically adding members
      const response = await fetch('http://localhost:5000/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_name: tripForm.tripName,
          description: tripForm.description,
          start_date: tripStartDate.toISOString().split('T')[0],
          end_date: tripEndDate.toISOString().split('T')[0],
          created_by: user.user_id,
          member_ids: []  // Don't auto-add friends
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        const newTripId = data.trip_id;
        
        // Send friend requests for each selected friend
        if (selectedFriends.length > 0) {
          const requestPromises = selectedFriends.map(friendId =>
            fetch(`http://localhost:5000/api/trips/${newTripId}/member-requests`, {
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
        
        setShowTripModal(false);
        setTripForm({ tripName: '', description: '', memberIds: [] });
        setTripLocations([]);
        setSelectedFriends([]);
        setFriendSearchQuery('');
        setShowAllFriends(false);
        fetchTrips(); // Refresh trips
      } else {
        showToast(data.error || 'Failed to create trip', 'error');
      }
    } catch (error) {
      console.error('Error creating trip:', error);
      showToast('Failed to create trip', 'error');
    }
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
      
      // Transform the API response to match our UI expectations
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
      const response = await fetch(`http://localhost:5000/api/autocomplete/cities?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      // Transform the API response to extract city and state
      const formatted = (data || []).map(item => {
        const parts = item.description.split(',').map(p => p.trim());
        return {
          place_id: item.place_id,
          city: parts[0],
          state: parts.length > 1 ? parts[parts.length - 2] : '', // Get state (second to last element)
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

  const handleSearch = async () => {
    if (!searchForm.placeType && searchForm.selectedCategories.length === 0) {
      showToast('Please fill in the place type field or select categories', 'error');
      return;
    }

    if (searchForm.selectedCategories.length > 0 && !searchForm.city) {
      showToast('When using categories, please select a city', 'error');
      return;
    }

    // Immediately switch to results view and show skeleton
    setViewMode('search');
    setSearchResults([]);
    setNextPageToken(null);
    setSearchLoading(true);
    
    try {
      const params = new URLSearchParams();

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
      
      console.log('📦 Search response:', data);
      console.log(`✅ Fetched ${data.places?.length || 0} results, has_more: ${data.has_more}`);
      
      setSearchResults(data.places || []);
      setNextPageToken(data.next_page_token || null);
      setSearchLoading(false);
      
      // Update URL with search parameters
      const urlParams = new URLSearchParams();
      urlParams.set('place_type', searchForm.placeType);
      if (searchForm.state) urlParams.set('state', searchForm.state);
      if (searchForm.city) urlParams.set('city', searchForm.city);
      
      const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
      window.history.pushState({}, '', newUrl);
    } catch (error) {
      console.error('❌ Error searching places:', error);
      setSearchLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (!nextPageToken || loadingMore) return;
    
    setLoadingMore(true);
    
    try {
      const params = new URLSearchParams({
        page_token: nextPageToken
      });

      console.log('🔄 Loading more results...');

      const response = await fetch(`http://localhost:5000/api/search?${params}`);
      const data = await response.json();
      
      console.log(`✅ Loaded ${data.places?.length || 0} more results, has_more: ${data.has_more}`);
      
      setSearchResults(prev => [...prev, ...(data.places || [])]);
      setNextPageToken(data.next_page_token || null);
    } catch (error) {
      console.error('❌ Error loading more results:', error);
      showToast('Failed to load more results', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const getDisplayableResults = (results) => {
    const count = results.length;
    const remainder = count % 4;
    if (remainder === 0) return results;
    return results.slice(0, count - remainder);
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
    setNextPageToken(null);
    
    try {
      // Search for the specific place using its name
      const params = new URLSearchParams({
        place_type: place.main_text
      });

      console.log('🔍 Direct place search for:', place.main_text);

      const response = await fetch(`http://localhost:5000/api/search?${params}`);
      const data = await response.json();
      
      console.log('🔍 Direct search results:', data);
      
      setSearchResults(data.places || []);
      setNextPageToken(data.next_page_token || null);
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



  const handlePlaceCardClick = async (place) => {
    setSelectedPlaceForModal(place);
    setCurrentImageIndex(0);
    
    // Fetch place details to get all photos
    try {
      const response = await fetch(`http://localhost:5000/api/place/${place.place_id}`);
      const data = await response.json();
      
      // Use all photos from the API response
      let images = [];
      if (data.photos && data.photos.length > 0) {
        images = data.photos;
      } else if (place.image_url) {
        images = [place.image_url];
      } else {
        images = ['https://via.placeholder.com/600x400/1a1a2e/ffffff?text=No+Image'];
      }
      
      console.log(`Loaded ${images.length} images for ${place.place_name}`);
      setPlaceImages(images);
    } catch (error) {
      console.error('Error fetching place details:', error);
      setPlaceImages([place.image_url || 'https://via.placeholder.com/600x400/1a1a2e/ffffff?text=No+Image']);
    }
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
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => renderSkeletonCard())}
      </div>
    );

  const renderHomepage = () => (
    <>
      {user && (
        <div className="trips-dashboard">
            <div className="trips-header">
              <div className="trips-header-content">
                <h2>My Trips</h2>
                <p className="trips-subtitle">Plan, collaborate, and explore your adventures</p>
              </div>
              <button 
                className="new-trip-btn"
                onClick={() => setShowTripModal(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                New Trip
              </button>
            </div>

            <div className="trips-grid">
            {trips.length > 0 ? (
              trips.map((trip, index) => {
                // Parse dates if available
                const startDate = trip.start_date ? new Date(trip.start_date) : null;
                const endDate = trip.end_date ? new Date(trip.end_date) : null;
                const isOwner = trip.role === 'owner';
                
                return (
                  <div 
                    key={trip.trip_id} 
                    className="trip-card"
                  >
                    <div className="trip-icon-container">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                        <path d="M8 14h.01"></path>
                        <path d="M12 14h.01"></path>
                        <path d="M16 14h.01"></path>
                        <path d="M8 18h.01"></path>
                        <path d="M12 18h.01"></path>
                        <path d="M16 18h.01"></path>
                      </svg>
                    </div>
                    
                    <div className="trip-card-content" onClick={() => navigate(`/planner?trip=${trip.trip_id}`)}>
                      <div className="trip-main-info">
                        <div className="trip-title-row">
                          <h3 className="trip-title">{trip.trip_name || trip.group_name || 'Untitled Trip'}</h3>
                          {isOwner && (
                            <span className="owner-badge">Owner</span>
                          )}
                        </div>
                        
                        <div className="trip-meta">
                          {(startDate || endDate) && (
                            <span className="trip-date-info">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                              </svg>
                              {startDate && startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {endDate && ` - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                            </span>
                          )}
                          
                          <button 
                            className="trip-member-info-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setManageTripId(trip.trip_id);
                              setShowManageMembersModal(true);
                            }}
                            title={isOwner ? "Manage members" : "View members & request to add"}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                              <circle cx="9" cy="7" r="4"></circle>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            {trip.member_count || 1} {(trip.member_count || 1) === 1 ? 'member' : 'members'}
                          </button>
                        </div>
                        
                        {trip.description && (
                          <p className="trip-description-text">{trip.description}</p>
                        )}
                      </div>
                      
                      <div className="trip-card-actions">
                        {isOwner && (
                          <button 
                            className="trip-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTrip(trip.trip_id);
                            }}
                            title="Delete trip"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              <line x1="10" y1="11" x2="10" y2="17"></line>
                              <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                          </button>
                        )}
                        
                        <div className="trip-arrow">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="no-trips">
                <div className="no-trips-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                </div>
                <h3>No trips yet</h3>
                <p>Create your first trip to start planning your next adventure with friends and family</p>
                <button 
                  className="create-first-trip-btn"
                  onClick={() => setShowTripModal(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Create Your First Trip
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const renderSearchForm = () => (
    <div className="search-page">
      <div className="back-to-home">
        <button 
          onClick={() => {
            if (plannerContext) {
              sessionStorage.removeItem('plannerContext');
              navigate('/planner');
            } else {
              setViewMode('homepage');
              setSearchResults([]);
              setSearchForm({ placeType: '', state: '', city: '', zipCode: '', selectedCategories: [] });
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

  const renderSearchResults = () => {
    console.log('🔍 Rendering search results - searchLoading:', searchLoading);
    console.log('🔍 Rendering search results - searchResults:', searchResults);
    console.log('🔍 Rendering search results - searchResults.length:', searchResults.length);
    
    return (
      <>
        <div className="search-results-page">
          <div className="results-top-bar">
            <button 
              onClick={() => {
                if (plannerContext) {
                  sessionStorage.removeItem('plannerContext');
                  navigate('/planner');
                } else {
                  setViewMode('homepage');
                  setSearchResults([]);
                  setSearchForm({ placeType: '', state: '', city: '', zipCode: '', selectedCategories: [] });
                  setSearchLoading(false);
                  window.history.pushState({}, '', window.location.pathname);
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
            <div className="hero-slideshow">
              {heroImages.map((image, index) => (
                <div
                  key={index}
                  className={`hero-slide ${index === currentHeroIndex ? 'active' : ''}`}
                  style={{backgroundImage: `url(${image})`}}
                />
              ))}
            </div>
            <div className="hero-overlay"></div>
            <div className="hero-content">
              <h1 className="hero-title">{user ? 'Discover Remarkable Places' : 'Plan your next adventure'}</h1>
              <p className="hero-subtitle">{user ? 'Find the perfect spots for your next adventure with friends' : 'Organize trips, collaborate with friends, and keep all your travel plans in one place'}</p>
              
              <div className="hero-actions">
                {user ? (
                  <>
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

        <div className="places-container">
          {console.log('🔍 Main render - viewMode:', viewMode, 'searchResults.length:', searchResults.length)}
          {viewMode === 'homepage' && renderHomepage()}
          {viewMode === 'search' && !searchLoading && searchResults.length === 0 && renderSearchForm()}
          {viewMode === 'search' && (searchLoading || searchResults.length > 0) && renderSearchResults()}
        </div>
      </div>
      
      {isCalendarModalOpen && selectedPlace && (
        <AddToCalendarModal 
          place={selectedPlace} 
          onClose={() => setIsCalendarModalOpen(false)} 
        />
      )}

      {selectedPlaceForModal && (
        <div className="place-modal-overlay" onClick={() => setSelectedPlaceForModal(null)}>
          <div className="place-modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="close-modal-btn"
              onClick={() => setSelectedPlaceForModal(null)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <div className="modal-image-container">
              <img
                src={placeImages[currentImageIndex] || selectedPlaceForModal.image_url || 'https://via.placeholder.com/600x400/1a1a2e/ffffff?text=No+Image'}
                alt={selectedPlaceForModal.place_name}
                className="modal-place-image"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/600x400/1a1a2e/6366f1?text=No+Image+Available';
                }}
              />
              
              {placeImages.length > 1 && (
                <>
                  <button
                    className="image-nav-btn prev"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex((prev) => (prev === 0 ? placeImages.length - 1 : prev - 1));
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                  </button>
                  
                  <button
                    className="image-nav-btn next"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex((prev) => (prev === placeImages.length - 1 ? 0 : prev + 1));
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                  
                  <div className="image-indicators">
                    {placeImages.map((_, index) => (
                      <div
                        key={index}
                        className={`image-indicator ${index === currentImageIndex ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImageIndex(index);
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="modal-place-details">
              <div className="modal-header-section">
                <h2 className="modal-place-name">{selectedPlaceForModal.place_name}</h2>
                <div className="modal-rating">
                  <FaStar className="rating-stars" />
                  <span>{selectedPlaceForModal.rating || '4.5'}</span>
                </div>
              </div>

              <div className="modal-location">
                <FaMapMarkerAlt className="location-icon" />
                <span>{selectedPlaceForModal.address || selectedPlaceForModal.city_name}</span>
              </div>

              <div className="modal-category">
                {selectedPlaceForModal.category}
              </div>

              <div className="modal-actions">
                <button
                  className="modal-action-btn primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenPlannerSelector(selectedPlaceForModal);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  Add to Planner
                </button>
                
                <button 
                  className="modal-action-btn secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(selectedPlaceForModal.google_maps_url, '_blank');
                  }}
                >
                  <FaMapMarkerAlt />
                  View on Maps
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trip/Day Selector for Adding to Planner */}
      {showTripSelector && selectedPlaceForModal && (
        <div className="place-modal-overlay" onClick={() => setShowTripSelector(false)}>
          <div className="trip-modal-content" style={{maxWidth: '500px'}} onClick={(e) => e.stopPropagation()}>
            <button 
              className="close-modal-btn"
              onClick={() => setShowTripSelector(false)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <div className="trip-modal-header">
              <h2>Add to Trip</h2>
              <p>Select which trip and day to add "{selectedPlaceForModal.place_name}"</p>
            </div>

            <div className="trip-modal-body">
              <div className="trip-form-section">
                <label>Select Trip *</label>
                <div className="select-wrapper">
                  <select
                    value={selectedTripForPlanner?.trip_id || ''}
                    onChange={(e) => {
                      const trip = trips.find(t => t.trip_id === parseInt(e.target.value));
                      setSelectedTripForPlanner(trip);
                      setSelectedDayForPlanner(''); // Reset day when trip changes
                    }}
                    className="trip-input"
                  >
                    <option value="">Choose a trip...</option>
                    {trips.map(trip => (
                      <option key={trip.trip_id} value={trip.trip_id}>
                        {trip.trip_name || trip.group_name}
                      </option>
                    ))}
                  </select>
                  <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </div>

              {selectedTripForPlanner && (
                <div className="trip-form-section">
                  <label>Select Day *</label>
                  <div className="select-wrapper">
                    <select
                      value={selectedDayForPlanner}
                      onChange={(e) => setSelectedDayForPlanner(e.target.value)}
                      className="trip-input"
                    >
                      <option value="">Choose a day...</option>
                      {getTripDays(selectedTripForPlanner).map(day => {
                        const date = new Date(day);
                        return (
                          <option key={day} value={day}>
                            {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          </option>
                        );
                      })}
                    </select>
                    <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>
              )}

              <div className="trip-modal-footer">
                <button
                  onClick={() => setShowTripSelector(false)}
                  className="trip-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddToPlanner}
                  className="trip-create-btn"
                  disabled={!selectedTripForPlanner || !selectedDayForPlanner}
                >
                  Add to Planner
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trip Creation Modal */}
      {showTripModal && (
        <div className="place-modal-overlay" onClick={() => setShowTripModal(false)}>
          <div className="trip-modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="close-modal-btn"
              onClick={() => setShowTripModal(false)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <div className="trip-modal-header">
              <h2>Create New Trip</h2>
              <p>Plan your adventure by adding destinations and dates</p>
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
                  
                  {/* Search Friends */}
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
                      
                      // Show only 2 suggestions if not searching and not showing all
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
                  
                  {/* Show More/Less button */}
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

              {/* Add Destinations Section */}
              <div className="trip-form-section">
                <label>Add Destinations</label>
                
                <div className="add-destination-container">
                  <div className="destination-input-box">
                    <div className="location-input-row">
                      <div className="location-input-wrapper">
                        <input
                          type="text"
                          placeholder="City"
                          value={currentLocation.city}
                          onChange={(e) => {
                            setCurrentLocation({...currentLocation, city: e.target.value});
                            fetchLocationSuggestions(e.target.value);
                          }}
                          onFocus={() => currentLocation.city.length >= 2 && setShowLocationSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 200)}
                          className="trip-input small"
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
                                  <rect x="3" y="3" width="7" height="7"></rect>
                                  <rect x="14" y="3" width="7" height="7"></rect>
                                  <rect x="14" y="14" width="7" height="7"></rect>
                                  <rect x="3" y="14" width="7" height="7"></rect>
                                </svg>
                                <div className="item-content">
                                  <div className="autocomplete-main">{location.city}</div>
                                  <div className="autocomplete-secondary">{location.state}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <input
                        type="text"
                        placeholder="State"
                        value={currentLocation.state}
                        onChange={(e) => setCurrentLocation({...currentLocation, state: e.target.value})}
                        className="trip-input small"
                      />
                    </div>
                    
                    {/* Date Range Picker */}
                    <DateRangePicker
                      startDate={currentLocation.startDate}
                      endDate={currentLocation.endDate}
                      onStartDateChange={(date) => {
                        console.log('🔴 onStartDateChange called with:', date);
                        setCurrentLocation((prev) => {
                          console.log('🔴 Previous state:', prev);
                          const updated = {...prev, startDate: date};
                          console.log('🔴 Updated state:', updated);
                          return updated;
                        });
                      }}
                      onEndDateChange={(date) => {
                        console.log('🔵 onEndDateChange called with:', date);
                        setCurrentLocation((prev) => ({...prev, endDate: date}));
                      }}
                    />
                  </div>
                  
                  {/* Always show + button */}
                  <button
                    type="button"
                    onClick={handleAddLocation}
                    className={`circular-add-btn ${editingLocationId ? 'update-mode' : ''}`}
                    aria-label={editingLocationId ? "Update destination" : "Add destination"}
                    title={editingLocationId ? "Update destination" : tripLocations.length > 0 ? "Add another destination" : "Add destination"}
                  >
                    {editingLocationId ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    )}
                  </button>
                </div>

                {/* Added Locations List */}
                {tripLocations.length > 0 && (
                  <div className="added-locations">
                    {tripLocations.map(location => (
                      <div key={location.id} className={`location-chip ${editingLocationId === location.id ? 'editing' : ''}`}>
                        <div className="location-chip-content">
                          <span className="location-name">{location.city}, {location.state}</span>
                          <span className="location-dates">
                            {new Date(location.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {location.endDate && ` - ${new Date(location.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                          </span>
                        </div>
                        <div className="location-chip-actions">
                          <button
                            onClick={() => handleEditLocation(location.id)}
                            className="edit-location-btn"
                            aria-label="Edit destination"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRemoveLocation(location.id)}
                            className="remove-location-btn"
                            aria-label="Remove destination"
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

      {/* Manage Members Modal */}
      {showManageMembersModal && (
        <div className="place-modal-overlay" onClick={() => setShowManageMembersModal(false)}>
          <div className="manage-members-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="close-modal-btn"
              onClick={() => setShowManageMembersModal(false)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <div className="modal-header">
              <h2>Manage Trip Members</h2>
              <p>Add or remove members from this trip</p>
            </div>

            <div className="modal-body">
              {/* Current Members */}
              <div className="members-section">
                <h3>Current Members ({tripMembers.length})</h3>
                <div className="members-list">
                  {tripMembers.length > 0 ? (
                    tripMembers.map(member => (
                      <div key={member.user_id} className="member-card">
                        <div className="member-avatar">
                          {member.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="member-info">
                          <div className="member-name">{member.first_name} {member.last_name}</div>
                          <div className="member-role">{member.role}</div>
                        </div>
                        {member.role !== 'owner' && (
                          <button 
                            onClick={() => handleRemoveMemberFromTrip(member.user_id)}
                            className="remove-member-btn"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="empty-message">No members yet</p>
                  )}
                </div>
              </div>

              {/* Sent Invitations - Show for owners/admins */}
              {currentUserRole && ['owner', 'admin'].includes(currentUserRole) && sentInvitations.length > 0 && (
                <div className="members-section">
                  <h3>Pending Invitations ({sentInvitations.length})</h3>
                  <div className="members-list">
                    {sentInvitations.map(invitation => (
                      <div key={invitation.invitation_id} className="member-card invitation-pending-card">
                        <div className="member-avatar">
                          {invitation.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="member-info">
                          <div className="member-name">{invitation.first_name} {invitation.last_name}</div>
                          <div className="member-username">
                            Waiting for their response
                          </div>
                        </div>
                        <div className="invitation-status">
                          <span className="status-badge pending">Pending</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* My Pending Requests - Show for non-owners */}
              {currentUserRole && !['owner', 'admin'].includes(currentUserRole) && myPendingRequests.length > 0 && (
                <div className="members-section">
                  <h3>My Pending Requests ({myPendingRequests.length})</h3>
                  <div className="members-list">
                    {myPendingRequests.map(request => (
                      <div key={request.request_id} className="member-card invitation-pending-card">
                        <div className="member-avatar">
                          {request.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="member-info">
                          <div className="member-name">{request.first_name} {request.last_name}</div>
                          <div className="member-username">
                            {request.owner_approved && !request.friend_accepted 
                              ? 'Owner approved, waiting for friend'
                              : !request.owner_approved && request.friend_accepted
                              ? 'Friend accepted, waiting for owner'
                              : 'Waiting for approvals'}
                          </div>
                        </div>
                        <div className="invitation-status">
                          <span className="status-badge pending">Pending</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Requests - Only for Owners/Admins */}
              {currentUserRole && ['owner', 'admin'].includes(currentUserRole) && pendingRequests.length > 0 && (
                <div className="members-section">
                  <h3>Member Requests ({pendingRequests.length})</h3>
                  <div className="members-list">
                    {pendingRequests.map(request => (
                      <div key={request.request_id} className="member-card request-card">
                        <div className="member-avatar">
                          {request.friend_first_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="member-info">
                          <div className="member-name">{request.friend_first_name} {request.friend_last_name}</div>
                          <div className="member-username">
                            Requested by {request.requester_first_name}
                          </div>
                        </div>
                        <div className="request-actions">
                          <button 
                            onClick={() => handleApproveRequest(request.request_id)}
                            className="approve-request-btn"
                            title="Approve request"
                          >
                            ✓
                          </button>
                          <button 
                            onClick={() => handleRejectRequest(request.request_id)}
                            className="reject-request-btn"
                            title="Reject request"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Members */}
              {availableFriends.length > 0 && (
                <div className="members-section">
                  <h3>
                    {currentUserRole && ['owner', 'admin'].includes(currentUserRole) 
                      ? 'Invite Friends' 
                      : 'Request to Add Friends'}
                  </h3>
                  <div className="members-list">
                    {availableFriends.map(friend => (
                      <div key={friend.user_id} className="member-card">
                        <div className="member-avatar">
                          {friend.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="member-info">
                          <div className="member-name">{friend.first_name} {friend.last_name}</div>
                          <div className="member-username">@{friend.username}</div>
                        </div>
                        <button 
                          onClick={() => currentUserRole && ['owner', 'admin'].includes(currentUserRole) 
                            ? handleAddMemberToTrip(friend.user_id) 
                            : handleRequestAddMember(friend.user_id)}
                          className={currentUserRole && ['owner', 'admin'].includes(currentUserRole) ? "add-member-btn" : "request-add-btn"}
                          title={currentUserRole && ['owner', 'admin'].includes(currentUserRole) ? "Send invitation" : "Request to add"}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="8.5" cy="7" r="4"></circle>
                            <line x1="20" y1="8" x2="20" y2="14"></line>
                            <line x1="23" y1="11" x2="17" y2="11"></line>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Home;
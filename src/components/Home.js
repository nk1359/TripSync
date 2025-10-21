import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './AuthContext';
import { useToast } from './ToastContext';
import Layout from './Layout';
import './styles/Home.css';
import AddToCalendarModal from './AddToCalendarModal';
import DateRangePicker from './DateRangePicker';
import EditTripModal from './EditTripModal';
import { FaSearch, FaCalendarPlus, FaStar, FaMapMarkerAlt, FaCity, FaChevronLeft, FaChevronRight, FaEdit } from 'react-icons/fa';
import API_URL from '../config';
import SwipeableViews from 'react-swipeable-views';
import useIsMobile from '../hooks/useIsMobile';

const Home = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const { showToast, showConfirm } = useToast();
  const isMobile = useIsMobile();
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
    startDate: '',
    endDate: '',
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
  
  // Edit dates modal state
  const [showEditDatesModal, setShowEditDatesModal] = useState(false);
  const [tripToEdit, setTripToEdit] = useState(null);
  
  // Fetch friends when trip modal opens
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
  const [currentLocation, setCurrentLocation] = useState({
    destination: '',
    place_id: '',
    lat: null,
    lng: null,
    startDate: null,
    endDate: null
  });
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

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

  // Listen for "openNewTripModal" event from mobile navbar
  useEffect(() => {
    const handleOpenModal = () => {
      if (user) {
        setShowTripModal(true);
      }
    };

    window.addEventListener('openNewTripModal', handleOpenModal);
    return () => window.removeEventListener('openNewTripModal', handleOpenModal);
  }, [user]);

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
      const response = await fetch(`${API_URL}/api/trips/${user.user_id}`);
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
      const response = await fetch(`${API_URL}/api/trips/${tripId}`, {
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
      const response = await fetch(`${API_URL}/api/trips/${tripId}/members`);
      const data = await response.json();
      setTripMembers(data.members || []);
      
      // Find current user's role
      const currentMember = (data.members || []).find(m => m.user_id === user.user_id);
      const userRole = currentMember?.role || null;
      setCurrentUserRole(userRole);
      
      // Fetch all friends
      const friendsResponse = await fetch(`${API_URL}/api/friends/${user.user_id}`);
      const friendsData = await friendsResponse.json();
      const memberIds = (data.members || []).map(m => m.user_id);
      
      // Fetch sent invitations
      const invitationsResponse = await fetch(`${API_URL}/api/trips/${tripId}/sent-invitations?user_id=${user.user_id}`);
      let invitedUserIds = [];
      if (invitationsResponse.ok) {
        const invitationsData = await invitationsResponse.json();
        setSentInvitations(invitationsData.invitations || []);
        invitedUserIds = (invitationsData.invitations || []).map(inv => inv.friend_id);
      }
      
      // Fetch my pending requests (for non-owners)
      let myRequestedUserIds = [];
      if (userRole && !['owner', 'admin'].includes(userRole)) {
        const myRequestsResponse = await fetch(`${API_URL}/api/trips/${tripId}/my-requests?user_id=${user.user_id}`);
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
      const response = await fetch(`${API_URL}/api/trips/${tripId}/member-requests?user_id=${user.user_id}`);
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
      const response = await fetch(`${API_URL}/api/trips/${manageTripId}/member-requests`, {
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
      const response = await fetch(`${API_URL}/api/trips/${manageTripId}/member-requests/${requestId}/approve`, {
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
      const response = await fetch(`${API_URL}/api/trips/${manageTripId}/member-requests/${requestId}/reject`, {
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
      const response = await fetch(`${API_URL}/api/trips/${manageTripId}/member-requests`, {
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
      const response = await fetch(`${API_URL}/api/trips/${manageTripId}/members/${memberId}`, {
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
        // Store the new item in sessionStorage for optimistic update
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

  // Helper to parse date string without timezone conversion
  const parseDateString = (dateStr) => {
    if (!dateStr) return null;
    
    // Handle different date formats
    if (typeof dateStr !== 'string') {
      return null;
    }
    
    // If it's in YYYY-MM-DD format
    if (dateStr.includes('-') && dateStr.length === 10) {
      const [year, month, day] = dateStr.split('-').map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month - 1, day);
      }
    }
    
    // Fallback: try parsing other formats (but this might have timezone issues)
    const fallbackDate = new Date(dateStr);
    return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
  };

  // Get trip days for date picker
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

  // Helper function to format date - keep as plain string, no conversions
  const formatDateForAPI = (date) => {
    // Return null for empty/null/undefined
    if (!date || date === '') {
      return null;
    }
    
    // If date is already a string in YYYY-MM-DD format, return it as-is
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date; // NO CONVERSION - keep as plain string
    }
    
    return null;
  };

  // Fetch location suggestions for trip creation
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

  // Add another location (saves current and prepares for next)
  const handleAddLocation = () => {
    if (!currentLocation.destination || !currentLocation.startDate) {
      showToast('Please enter destination and start date', 'info');
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
    setCurrentLocation({ destination: '', place_id: '', lat: null, lng: null, startDate: null, endDate: null });
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
      setCurrentLocation({ destination: '', place_id: '', lat: null, lng: null, startDate: null, endDate: null });
    }
  };

  // Select location from suggestions
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

  // Create new trip
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

    // Sort dates as strings (YYYY-MM-DD format sorts correctly)
    const tripStartDate = startDates.sort()[0];
    const tripEndDate = endDates.sort()[endDates.length - 1];

    try {
      // Create trip
      const response = await fetch(`${API_URL}/api/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_name: tripForm.tripName,
          description: tripForm.description,
          start_date: formatDateForAPI(tripStartDate),
          end_date: formatDateForAPI(tripEndDate),
          created_by: user.user_id,
          member_ids: [],
          destinations: finalLocations.map(loc => ({
            destination: loc.destination,
            place_id: loc.place_id,
            lat: loc.lat,
            lng: loc.lng,
            start_date: formatDateForAPI(loc.startDate),
            end_date: formatDateForAPI(loc.endDate || loc.startDate)
          }))
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        const newTripId = data.trip_id;
        
        // Send friend requests for each selected friend
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
        
        setShowTripModal(false);
        setTripForm({ tripName: '', description: '', startDate: '', endDate: '', memberIds: [] });
        setTripLocations([]);
        setCurrentLocation({ destination: '', place_id: '', lat: null, lng: null, startDate: '', endDate: '' });
        setSelectedFriends([]);
        setFriendSearchQuery('');
        setShowAllFriends(false);
        fetchTrips();
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
            const response = await fetch(`${API_URL}/api/search?place_type=popular attractions&page=1&per_page=4`);
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





  const handlePlaceCardClick = async (place) => {
    setSelectedPlaceForModal(place);
    setCurrentImageIndex(0);
    
    // Fetch place details to get all photos
    try {
      const response = await fetch(`${API_URL}/api/place/${place.place_id}`);
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
                // Parse dates if available - use parseDateString to avoid timezone issues
                const startDate = trip.start_date ? parseDateString(trip.start_date) : null;
                const endDate = trip.end_date ? parseDateString(trip.end_date) : null;
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
                              {isOwner && (
                                <button
                                  className="edit-dates-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTripToEdit(trip);
                                    setShowEditDatesModal(true);
                                  }}
                                  title="Edit trip"
                                >
                                  <FaEdit />
                                </button>
                              )}
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
            {isMobile ? (
              <SwipeableViews
                index={currentHeroIndex}
                onChangeIndex={(index) => setCurrentHeroIndex(index)}
                enableMouseEvents={false}
                style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
                containerStyle={{ height: '100%', width: '100%' }}
              >
                {heroImages.map((image, index) => (
                  <div
                    key={index}
                    className="hero-slide active"
                    style={{backgroundImage: `url(${image})`, height: '100%'}}
                  />
                ))}
              </SwipeableViews>
            ) : (
              <div className="hero-slideshow">
                {heroImages.map((image, index) => (
                  <div
                    key={index}
                    className={`hero-slide ${index === currentHeroIndex ? 'active' : ''}`}
                    style={{backgroundImage: `url(${image})`}}
                  />
                ))}
              </div>
            )}
            <div className="hero-overlay"></div>
            <div className="hero-content">
              <h1 className="hero-title">{user ? 'Discover Remarkable Places' : 'Plan your next adventure'}</h1>
              <p className="hero-subtitle">{user ? 'Find the perfect spots for your next adventure with friends' : 'Organize trips, collaborate with friends, and keep all your travel plans in one place'}</p>
              
              <div className="hero-actions">
                {user ? (
                  <>
                    <button 
                      className="hero-search-button"
                    onClick={() => navigate('/search')}
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
                      onClick={() => navigate('/login', { state: { tab: 'register' } })}
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

        <div className="places-container">
          {renderHomepage()}
        </div>
      </div>
      
      {isCalendarModalOpen && selectedPlaceForModal && (
        <AddToCalendarModal 
          place={selectedPlaceForModal} 
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

            {placeImages.length > 0 && (
            <div className="modal-image-container">
              <img
                  src={placeImages[currentImageIndex]} 
                alt={selectedPlaceForModal.place_name}
                className="modal-place-image"
              />
              {placeImages.length > 1 && (
                <>
                    <button className="image-nav-btn prev-btn" onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex(prev => prev === 0 ? placeImages.length - 1 : prev - 1);
                    }}>
                      <FaChevronLeft />
                  </button>
                    <button className="image-nav-btn next-btn" onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex(prev => prev === placeImages.length - 1 ? 0 : prev + 1);
                    }}>
                      <FaChevronRight />
                  </button>
                </>
              )}
            </div>
            )}

            <div className="modal-place-details">
              <div className="modal-header-section">
                <h2 className="modal-place-name">{selectedPlaceForModal.place_name}</h2>
                <div className="modal-place-rating">
                  <FaStar className="star-icon" />
                  <span>{selectedPlaceForModal.rating || 'N/A'}</span>
                </div>
              </div>

              <div className="modal-info-section">
                <div className="info-item">
                  <FaMapMarkerAlt className="info-icon" />
                  <span>{selectedPlaceForModal.address || 'Address not available'}</span>
              </div>
                <div className="info-item">
                  <FaCity className="info-icon" />
                  <span>{selectedPlaceForModal.category || 'Category'}</span>
                </div>
              </div>

              <div className="modal-actions">
                <button className="modal-action-btn primary" onClick={() => setIsCalendarModalOpen(true)}>
                  <FaCalendarPlus /> Add to Calendar
                </button>
                {selectedPlaceForModal.google_maps_url && (
                  <a 
                    href={selectedPlaceForModal.google_maps_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  className="modal-action-btn secondary"
                  >
                    <FaMapMarkerAlt /> View on Maps
                  </a>
                )}
            </div>
                </div>
                  </div>
                </div>
              )}

      {/* Trip Modal */}
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
                      {tripLocations.map(location => {
                        // Parse dates without timezone issues
                        const formatDateDisplay = (dateStr) => {
                          if (!dateStr) return '';
                          const [year, month, day] = dateStr.split('-').map(Number);
                          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                          return `${monthNames[month - 1]} ${day}, ${year}`;
                        };
                        
                        return (
                        <div key={location.id} className={`destination-chip ${editingLocationId === location.id ? 'editing' : ''}`}>
                          <div className="destination-chip-content">
                            <div className="destination-name">{location.destination}</div>
                            <div className="destination-dates">
                              {formatDateDisplay(location.startDate)}
                              {location.endDate && ` - ${formatDateDisplay(location.endDate)}`}
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
                        );
                      })}
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

      {/* Edit Trip Modal */}
      {showEditDatesModal && tripToEdit && (
        <EditTripModal
          trip={tripToEdit}
          onClose={() => {
            setShowEditDatesModal(false);
            setTripToEdit(null);
          }}
          onSuccess={() => {
            fetchTrips();
          }}
        />
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
                            title="Remove member"
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
                    <p className="no-members">No members yet</p>
                  )}
                </div>
              </div>

              {/* Pending Requests */}
              {pendingRequests.length > 0 && (
                <div className="members-section">
                  <h3>Pending Requests ({pendingRequests.length})</h3>
                  <div className="requests-list">
                    {pendingRequests.map(request => (
                      <div key={request.id} className="request-card">
                        <div className="requester-info">
                          <div className="requester-avatar">
                            {request.requester_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="requester-name">{request.requester_name}</div>
                            <div className="request-text">
                              wants to add <strong>{request.friend_name}</strong>
                            </div>
                          </div>
                        </div>
                        <div className="request-actions">
                          <button
                            onClick={() => handleApproveRequest(request.id)}
                            className="approve-btn"
                            title="Approve"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRejectRequest(request.id)}
                            className="reject-btn"
                            title="Reject"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sent Invitations */}
              {sentInvitations.length > 0 && (
                <div className="members-section">
                  <h3>Sent Invitations ({sentInvitations.length})</h3>
                  <div className="invitations-list">
                    {sentInvitations.map(invite => (
                      <div key={invite.id} className="invitation-card">
                        <div className="invitee-info">
                          <div className="invitee-avatar">
                            {invite.friend_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="invitee-details">
                            <div className="invitee-name">{invite.friend_name}</div>
                            <div className="invitation-status">
                              {invite.owner_approved ? 
                                (invite.friend_accepted ? 
                                  <span className="status-accepted">Accepted</span> : 
                                  <span className="status-pending">Waiting for response</span>
                                ) :
                                <span className="status-pending">Waiting for owner approval</span>
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Friends */}
              {availableFriends.length > 0 && (
                <div className="members-section">
                  <h3>Add Friends ({availableFriends.length})</h3>
                  <div className="available-friends-grid">
                    {availableFriends.map(friend => (
                      <div key={friend.user_id} className="available-friend-card">
                        <div className="friend-avatar-small">
                          {friend.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="friend-name-small">{friend.first_name} {friend.last_name}</div>
                        <button
                          onClick={() => handleAddMemberToTrip(friend.user_id)}
                          className="add-friend-btn"
                          title="Add to trip"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
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

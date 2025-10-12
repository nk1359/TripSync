import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from './ToastContext';
import { 
  FaPlus, 
  FaMapMarkerAlt, 
  FaTrash, 
  FaSearch,
  FaGripVertical,
  FaUsers,
  FaTimes,
  FaCheckCircle,
  FaTimesCircle,
  FaStar,
  FaFilter
} from 'react-icons/fa';
import Layout from './Layout';
import './styles/Planner.css';

const Planner = () => {
  const [trips, setTrips] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [plannerItems, setPlannerItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);
  const [dragPosition, setDragPosition] = useState(null); // 'above' or 'below'
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Member management states
  const [tripMembers, setTripMembers] = useState([]);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [availableFriends, setAvailableFriends] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentInvitations, setSentInvitations] = useState([]);
  const [myPendingRequests, setMyPendingRequests] = useState([]);
  
  // Recommendations states
  const [recommendations, setRecommendations] = useState({});
  const [selectedFilter, setSelectedFilter] = useState({});
  const [showRecommendationsModal, setShowRecommendationsModal] = useState(false);
  const [modalRecommendations, setModalRecommendations] = useState([]);
  const [modalDay, setModalDay] = useState('');
  const [modalFilter, setModalFilter] = useState('attractions');
  const [loadingRecommendations, setLoadingRecommendations] = useState({});
  const [filterDropdownOpen, setFilterDropdownOpen] = useState({});
  const [modalFilterDropdownOpen, setModalFilterDropdownOpen] = useState(false);
  const [modalNextPageToken, setModalNextPageToken] = useState(null);
  const [loadingMoreRecommendations, setLoadingMoreRecommendations] = useState(false);
  const [modalOriginCoords, setModalOriginCoords] = useState(null);
  const [loadingModalRecommendations, setLoadingModalRecommendations] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { showToast, showConfirm } = useToast();
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const currentUserId = currentUser.user_id;

  // Click-away handler for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Close trip selector dropdown
      if (isDropdownOpen && !event.target.closest('.trip-selector')) {
        setIsDropdownOpen(false);
      }
      
      // Close filter dropdowns
      const openFilterDays = Object.keys(filterDropdownOpen).filter(day => filterDropdownOpen[day]);
      if (openFilterDays.length > 0 && !event.target.closest('.planner-filter-dropdown')) {
        setFilterDropdownOpen({});
      }
      
      // Close modal filter dropdown
      if (modalFilterDropdownOpen && !event.target.closest('.modal-filter-dropdown')) {
        setModalFilterDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen, filterDropdownOpen, modalFilterDropdownOpen]);

  // Fetch trips and handle trip selection from URL
  useEffect(() => {
    if (!currentUserId) {
      navigate('/login');
      return;
    }
    
    fetchTrips();
  }, [currentUserId, navigate]);

  // Fetch planner items when trip is selected or when returning from search
  useEffect(() => {
    if (selectedTrip) {
      // Check if there's a new item from sessionStorage (optimistic update)
      const newItemJson = sessionStorage.getItem('newPlannerItem');
      console.log('[PLANNER] Checking for new item in sessionStorage:', newItemJson);
      
      if (newItemJson) {
        try {
          const newItem = JSON.parse(newItemJson);
          console.log('[PLANNER] Found new item, adding optimistically:', newItem);
          
          // Add the new item to the list immediately
          setPlannerItems(prevItems => {
            console.log('[PLANNER] Current items:', prevItems.length, '+ new item');
            return [...prevItems, newItem];
          });
          
          // Clear from sessionStorage
          sessionStorage.removeItem('newPlannerItem');
          console.log('[PLANNER] Cleared sessionStorage, scheduling background fetch in 500ms');
          
          // Fetch full data in background (will update distances)
          setTimeout(() => {
            console.log('[PLANNER] Background fetch starting now');
            fetchPlannerItems();
          }, 500);
        } catch (e) {
          console.error('[PLANNER] Error parsing new item:', e);
          fetchPlannerItems();
        }
      } else {
        console.log('[PLANNER] No new item found, doing normal fetch');
        fetchPlannerItems();
      }
    }
  }, [selectedTrip]);

  // Refetch when component becomes visible (e.g., navigating back from search)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && selectedTrip) {
        fetchPlannerItems();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', () => {
      if (selectedTrip) {
        fetchPlannerItems();
      }
    });
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', () => {});
    };
  }, [selectedTrip]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isDropdownOpen && !event.target.closest('.trip-selector')) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const fetchTrips = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/trips/${currentUserId}`);
      console.log('Fetched trips:', response.data.trips);
      
      // Sort trips by start date - most recent upcoming trip first
      const sortedTrips = (response.data.trips || []).sort((a, b) => {
        const dateA = new Date(a.start_date || a.startDate);
        const dateB = new Date(b.start_date || b.startDate);
        return dateA - dateB; // Ascending order (soonest trip first)
      });
      
      setTrips(sortedTrips);
      
      // Check for trip parameter in URL
      const urlParams = new URLSearchParams(location.search);
      const tripIdParam = urlParams.get('trip');
      
      if (tripIdParam) {
        // Find and select the specific trip from URL
        const tripToSelect = sortedTrips.find(t => t.trip_id === parseInt(tripIdParam));
        if (tripToSelect) {
          console.log('Selecting trip from URL:', tripToSelect);
          setSelectedTrip(tripToSelect);
          return;
        }
      }
      
      // If no trip is selected and there are trips, select the first one (most upcoming)
      if (!selectedTrip && sortedTrips.length > 0) {
        console.log('Auto-selecting first trip (most upcoming):', sortedTrips[0]);
        setSelectedTrip(sortedTrips[0]);
      }
    } catch (error) {
      console.error("Error fetching trips:", error.response?.data || error.message);
    }
  };

  const fetchPlannerItems = async (skipDistanceCalc = false, skipPlaceIdFix = false) => {
    if (!selectedTrip) return;
    
    try {
      const response = await axios.get(`http://localhost:5000/api/planner/${selectedTrip.trip_id}`);
      setPlannerItems(response.data.items || []);
      
      // Automatically fix missing Google Place IDs (only on first load)
      if (!skipPlaceIdFix) {
        const itemsWithoutPlaceId = response.data.items?.filter(item => !item.google_place_id && item.item_type !== 'custom') || [];
        if (itemsWithoutPlaceId.length > 0) {
          console.log('[AUTO-FIX] Found items without Google Place IDs, fixing automatically...');
          axios.post(`http://localhost:5000/api/planner/${selectedTrip.trip_id}/fix-place-ids`)
            .then(res => {
              console.log('[AUTO-FIX] Place IDs updated:', res.data);
              // Refresh to get photos (skip auto-fix to avoid loop)
              setTimeout(() => fetchPlannerItems(true, true), 500);
            })
            .catch(err => console.error('[AUTO-FIX] Error:', err));
          return; // Exit early, will refresh after fix
        }
      }
      
      // Calculate distances in background if not skipping
      if (!skipDistanceCalc) {
        setTimeout(() => {
          axios.post(`http://localhost:5000/api/planner/${selectedTrip.trip_id}/calculate-distances`)
            .then(res => {
              console.log('[DISTANCE] Background calculation complete:', res.data);
              // Refresh items to get updated distances
              fetchPlannerItems(true, true); // Skip distance calc and place ID fix on refresh
            })
            .catch(err => {
              console.log('[DISTANCE] Calculation skipped or failed:', err.response?.data);
            });
        }, 100);
      }
    } catch (error) {
      console.error("Error fetching planner items:", error.response?.data || error.message);
    }
  };

  const handleTripChange = (trip) => {
    setSelectedTrip(trip);
    fetchTripMembers(trip.trip_id);
  };

  // Fetch members when trip is selected
  useEffect(() => {
    if (selectedTrip?.trip_id) {
      fetchTripMembers(selectedTrip.trip_id);
    }
  }, [selectedTrip?.trip_id]);

  const fetchTripMembers = async (tripId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${tripId}/members`);
      const data = await response.json();
      setTripMembers(data.members || []);
      
      // Find current user's role
      const currentMember = (data.members || []).find(m => m.user_id === currentUserId);
      setCurrentUserRole(currentMember?.role || null);
      
      // Fetch friends who aren't already members
      const friendsResponse = await fetch(`http://localhost:5000/api/friends/${currentUserId}`);
      const friendsData = await friendsResponse.json();
      const memberIds = (data.members || []).map(m => m.user_id);
      
      // Fetch sent invitations
      const invitationsResponse = await fetch(`http://localhost:5000/api/trips/${tripId}/sent-invitations?user_id=${currentUserId}`);
      let invitedUserIds = [];
      if (invitationsResponse.ok) {
        const invitationsData = await invitationsResponse.json();
        setSentInvitations(invitationsData.invitations || []);
        invitedUserIds = (invitationsData.invitations || []).map(inv => inv.friend_id);
      }
      
      // Fetch my pending requests (for non-owners)
      let myRequestedUserIds = [];
      if (currentMember && !['owner', 'admin'].includes(currentMember.role)) {
        const myRequestsResponse = await fetch(`http://localhost:5000/api/trips/${tripId}/my-requests?user_id=${currentUserId}`);
        if (myRequestsResponse.ok) {
          const myRequestsData = await myRequestsResponse.json();
          setMyPendingRequests(myRequestsData.requests || []);
          myRequestedUserIds = (myRequestsData.requests || []).map(req => req.friend_id);
        }
      }
      
      // Filter available friends
      let available;
      if (currentMember && ['owner', 'admin'].includes(currentMember.role)) {
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

  const fetchPendingRequests = async (tripId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${tripId}/member-requests?user_id=${currentUserId}`);
      if (response.ok) {
        const data = await response.json();
        setPendingRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  };

  const handleRequestAddMember = async (friendId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${selectedTrip.trip_id}/member-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_id: currentUserId,
          friend_id: friendId
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        showToast('Request sent! Waiting for owner and friend approval.', 'success');
        fetchTripMembers(selectedTrip.trip_id);
      } else {
        showToast(data.error || 'Failed to send request', 'error');
      }
    } catch (error) {
      console.error('Error requesting member addition:', error);
      showToast('Failed to send request', 'error');
    }
  };

  const handleAddMemberToTrip = async (friendId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${selectedTrip.trip_id}/member-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_id: currentUserId,
          friend_id: friendId
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        showToast('Invitation sent! Your friend can accept or decline it.', 'success');
        fetchTripMembers(selectedTrip.trip_id);
      } else {
        showToast(data.error || 'Failed to send invitation', 'error');
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      showToast('Failed to send invitation', 'error');
    }
  };

  const handleRemoveMember = async (memberId) => {
    const confirmed = await showConfirm({
      title: 'Remove Member',
      message: 'Are you sure you want to remove this member from the trip?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      type: 'danger'
    });
    
    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:5000/api/trips/${selectedTrip.trip_id}/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId })
      });

      const data = await response.json();
      
      if (response.ok) {
        fetchTripMembers(selectedTrip.trip_id);
      } else {
        showToast(data.error || 'Failed to remove member', 'error');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      showToast('Failed to remove member', 'error');
    }
  };

  const handleApproveRequest = async (requestId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${selectedTrip.trip_id}/member-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId })
      });

      const data = await response.json();
      
      if (response.ok) {
        showToast(data.message || 'Request approved!', 'success');
        fetchTripMembers(selectedTrip.trip_id);
        fetchPendingRequests(selectedTrip.trip_id);
      } else {
        showToast(data.error || 'Failed to approve request', 'error');
      }
    } catch (error) {
      console.error('Error approving request:', error);
      showToast('Failed to approve request', 'error');
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/trips/${selectedTrip.trip_id}/member-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId })
      });

      const data = await response.json();
      
      if (response.ok) {
        showToast('Request rejected', 'info');
        fetchPendingRequests(selectedTrip.trip_id);
      } else {
        showToast(data.error || 'Failed to reject request', 'error');
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      showToast('Failed to reject request', 'error');
    }
  };

  // Helper function to get filter display text
  const getFilterDisplayText = (filterValue) => {
    const filterMap = {
      'all': 'All Types',
      'attractions': 'Attractions',
      'parks': 'Parks',
      'museums': 'Museums',
      'restaurants': 'Restaurants',
      'cafes': 'Cafes',
      'shopping': 'Shopping',
      'hikes': 'Hikes',
      'nature': 'Nature',
      'art': 'Art Galleries',
      'entertainment': 'Entertainment',
      'nightlife': 'Nightlife',
      'landmarks': 'Landmarks'
    };
    return filterMap[filterValue] || 'All Types';
  };

  // Helper function to ensure items are divisible by 3 for grid layout
  const getDisplayableRecommendations = (recommendations) => {
    const count = recommendations.length;
    const remainder = count % 3;
    if (remainder === 0) return recommendations;
    // Truncate to nearest multiple of 3
    return recommendations.slice(0, count - remainder);
  };

  // Recommendations functions
  const fetchRecommendations = async (day, lastItem, filterType = 'all') => {
    if (!lastItem?.latitude || !lastItem?.longitude) {
      return;
    }
    
    setLoadingRecommendations(prev => ({ ...prev, [day]: true }));
    
    try {
      // For "all" type, use "tourist_attraction" as fallback for better results
      const typeToSend = filterType === 'all' ? 'tourist_attraction' : filterType;
      
      const response = await axios.post('http://localhost:5000/api/planner/recommendations', {
        latitude: lastItem.latitude,
        longitude: lastItem.longitude,
        type: typeToSend,
        radius: 5000
      });
      
      if (response.data.recommendations) {
        // Filter out recommendations that are already in the planner
        const existingPlaceIds = plannerItems
          .filter(item => item.google_place_id)
          .map(item => item.google_place_id);
        
        const filteredRecommendations = response.data.recommendations.filter(
          rec => !existingPlaceIds.includes(rec.place_id)
        );
        
        setRecommendations(prev => ({
          ...prev,
          [day]: filteredRecommendations
        }));
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoadingRecommendations(prev => ({ ...prev, [day]: false }));
    }
  };

  const handleFilterChange = (day, lastItem, filterType) => {
    setSelectedFilter(prev => ({ ...prev, [day]: filterType }));
    fetchRecommendations(day, lastItem, filterType);
  };

  const handleShowMoreRecommendations = async (day, lastItem) => {
    setModalDay(day);
    setShowRecommendationsModal(true);
    setLoadingModalRecommendations(true);
    
    const filterType = selectedFilter[day] || 'all';
    setModalFilter(filterType);
    
    // Store origin coordinates for pagination
    setModalOriginCoords({ latitude: lastItem.latitude, longitude: lastItem.longitude });
    
    try {
      const typeToSend = filterType === 'all' ? 'tourist_attraction' : filterType;
      
      const response = await axios.post('http://localhost:5000/api/planner/recommendations', {
        latitude: lastItem.latitude,
        longitude: lastItem.longitude,
        type: typeToSend,
        radius: 5000
      });
      
      if (response.data.recommendations) {
        // Filter out recommendations that are already in the planner
        const existingPlaceIds = plannerItems
          .filter(item => item.google_place_id)
          .map(item => item.google_place_id);
        
        const filteredRecommendations = response.data.recommendations.filter(
          rec => !existingPlaceIds.includes(rec.place_id)
        );
        
        setModalRecommendations(filteredRecommendations);
        setModalNextPageToken(response.data.next_page_token || null);
      }
    } catch (error) {
      console.error('Error fetching recommendations for modal:', error);
    } finally {
      setLoadingModalRecommendations(false);
    }
  };

  const handleModalFilterChange = async (filterType, lastItem) => {
    setModalFilter(filterType);
    setLoadingModalRecommendations(true);
    
    try {
      // For "all" type, use "tourist_attraction" as fallback for better results
      const typeToSend = filterType === 'all' ? 'tourist_attraction' : filterType;
      
      const response = await axios.post('http://localhost:5000/api/planner/recommendations', {
        latitude: lastItem.latitude,
        longitude: lastItem.longitude,
        type: typeToSend,
        radius: 5000
      });
      
      if (response.data.recommendations) {
        // Filter out recommendations that are already in the planner
        const existingPlaceIds = plannerItems
          .filter(item => item.google_place_id)
          .map(item => item.google_place_id);
        
        const filteredRecommendations = response.data.recommendations.filter(
          rec => !existingPlaceIds.includes(rec.place_id)
        );
        
        setModalRecommendations(filteredRecommendations);
        setModalNextPageToken(response.data.next_page_token || null);
      }
    } catch (error) {
      console.error('Error fetching modal recommendations:', error);
    } finally {
      setLoadingModalRecommendations(false);
    }
  };

  const handleLoadMoreRecommendations = async () => {
    if (!modalNextPageToken || loadingMoreRecommendations || !modalOriginCoords) return;
    
    setLoadingMoreRecommendations(true);
    
    try {
      const response = await axios.post('http://localhost:5000/api/planner/recommendations', {
        page_token: modalNextPageToken,
        latitude: modalOriginCoords.latitude,
        longitude: modalOriginCoords.longitude
      });
      
      if (response.data.recommendations) {
        // Filter out recommendations that are already in the planner
        const existingPlaceIds = plannerItems
          .filter(item => item.google_place_id)
          .map(item => item.google_place_id);
        
        const filteredRecommendations = response.data.recommendations.filter(
          rec => !existingPlaceIds.includes(rec.place_id)
        );
        
        setModalRecommendations(prev => [...prev, ...filteredRecommendations]);
        setModalNextPageToken(response.data.next_page_token || null);
      }
    } catch (error) {
      console.error('Error loading more recommendations:', error);
      showToast('Failed to load more recommendations', 'error');
    } finally {
      setLoadingMoreRecommendations(false);
    }
  };

  // Helper function to determine item type from Google Place types
  const getItemTypeFromPlaceTypes = (types) => {
    console.log('🏷️ Getting item type from types:', types);
    
    if (!types || !Array.isArray(types)) {
      console.log('⚠️ No valid types array, defaulting to activity');
      return 'activity';
    }
    
    // Priority-based mapping - CHECK SPECIFIC TYPES FIRST (not generic ones like point_of_interest)
    if (types.includes('lodging') || types.includes('hotel')) {
      console.log('✅ Detected lodging/hotel -> accommodation');
      return 'accommodation';
    }
    if (types.includes('restaurant') || types.includes('cafe') || types.includes('food') || types.includes('bar') || types.includes('meal_takeaway') || types.includes('meal_delivery')) {
      console.log('✅ Detected food place -> food');
      return 'food';
    }
    if (types.includes('airport') || types.includes('train_station') || types.includes('transit_station') || types.includes('bus_station') || types.includes('subway_station')) {
      console.log('✅ Detected transit -> transport');
      return 'transport';
    }
    // Only check SPECIFIC attraction types, not generic 'point_of_interest' or 'establishment'
    if (types.includes('tourist_attraction') || types.includes('museum') || types.includes('art_gallery') || 
        types.includes('park') || types.includes('natural_feature') || types.includes('amusement_park') ||
        types.includes('aquarium') || types.includes('zoo') || types.includes('stadium') || types.includes('movie_theater')) {
      console.log('✅ Detected specific attraction -> activity');
      return 'activity';
    }
    if (types.includes('shopping_mall') || types.includes('store') || types.includes('department_store')) {
      console.log('✅ Detected shopping -> activity');
      return 'activity';
    }
    
    console.log('⚠️ No specific match, defaulting to activity. Types were:', types);
    return 'activity'; // Default
  };

  const handleAddRecommendationToPlanner = async (recommendation, day, filterType) => {
    console.log('📍 Adding recommendation:', recommendation);
    console.log('📍 Filter type:', filterType);
    
    // Use filter type directly as item type, except for 'all' which auto-detects
    let itemType;
    if (filterType === 'all') {
      // Auto-detect for 'all' filter
      itemType = getItemTypeFromPlaceTypes(recommendation.types);
    } else {
      // Use the filter type exactly as it appears
      itemType = filterType;
    }
    
    console.log('📍 Final item type:', itemType);
    
    try {
      const response = await axios.post('http://localhost:5000/api/planner/items', {
        trip_id: selectedTrip.trip_id,
        item_name: recommendation.name,
        location: recommendation.address,
        item_type: itemType,
        start_date: day,
        latitude: recommendation.latitude,
        longitude: recommendation.longitude,
        google_place_id: recommendation.place_id,
        created_by: currentUserId
      });

      if (response.data.planner_id) {
        showToast('Added to planner!', 'success');
        
        // Fetch planner items to update the list (skip distance recalc to avoid auto-refresh)
        await fetchPlannerItems(selectedTrip.trip_id, true);
        
        // Remove the added item from modal recommendations
        setModalRecommendations(prev => prev.filter(rec => rec.place_id !== recommendation.place_id));
        
        // Also update the day's recommendations to remove this item
        setRecommendations(prev => ({
          ...prev,
          [day]: prev[day] ? prev[day].filter(rec => rec.place_id !== recommendation.place_id) : []
        }));
      }
    } catch (error) {
      console.error('Error adding recommendation:', error);
      showToast('Failed to add to planner', 'error');
    }
  };

  // Fetch recommendations when planner items change
  useEffect(() => {
    if (plannerItems.length > 0 && selectedTrip) {
      const itemsByDay = {};
      plannerItems.forEach(item => {
        // Use start_date as the key (that's what the planner uses)
        const dayKey = item.start_date || item.date;
        if (!itemsByDay[dayKey]) {
          itemsByDay[dayKey] = [];
        }
        itemsByDay[dayKey].push(item);
      });

      // Process each day
      const updates = {};
      Object.keys(itemsByDay).forEach(day => {
        const dayItems = itemsByDay[day];
        if (dayItems.length > 0 && day !== 'undefined') {
          const lastItem = dayItems[dayItems.length - 1];
          
          // Set filter if not already set
          if (!selectedFilter[day]) {
            updates[day] = 'all';
          }
          
          // Fetch recommendations with current or new filter
          const filterToUse = updates[day] || selectedFilter[day] || 'all';
          fetchRecommendations(day, lastItem, filterToUse);
        }
      });

      // Update filters if needed
      if (Object.keys(updates).length > 0) {
        setSelectedFilter(prev => ({ ...prev, ...updates }));
      }
    }
  }, [plannerItems.length, selectedTrip?.trip_id]);

  const handleAddCustomLocation = async (day) => {
    const itemName = prompt('Enter location or activity name:');
    if (!itemName || !itemName.trim()) return;
    
    const location = prompt('Enter address or location (optional):');
    
    // Create temporary item for optimistic update
    const tempItem = {
      planner_id: Date.now(), // temporary ID
      item_name: itemName,
      item_type: 'custom',
      location: location || '',
      start_date: day,
      end_date: day,
      created_by_username: currentUser.username || 'You'
    };
    
    // Optimistic update
    setPlannerItems(prevItems => [...prevItems, tempItem]);
    
    try {
      const response = await axios.post('http://localhost:5000/api/planner/items', {
        trip_id: selectedTrip.trip_id,
        item_name: itemName,
        item_type: 'custom',
        description: '',
        location: location || '',
        start_date: day,
        end_date: day,
        start_time: null,
        end_time: null,
        cost: null,
        notes: '',
        created_by: currentUserId
      });
      
      // Replace temp item with real item from server
      if (response.data.planner_id) {
        setPlannerItems(prevItems => 
          prevItems.map(item => 
            item.planner_id === tempItem.planner_id 
              ? { ...tempItem, planner_id: response.data.planner_id }
              : item
          )
        );
      }
    } catch (error) {
      console.error("Error saving planner item:", error.response?.data || error.message);
      // Remove temp item on error
      setPlannerItems(prevItems => prevItems.filter(item => item.planner_id !== tempItem.planner_id));
      showToast(`Failed to save item: ${error.response?.data?.error || 'Unknown error'}`, 'error');
    }
  };

  const handleSearchPlaces = (day) => {
    // Store planner context in sessionStorage
    sessionStorage.setItem('plannerContext', JSON.stringify({
      selectedDay: day,
      tripId: selectedTrip.trip_id,
      tripName: selectedTrip.trip_name,
      tripStartDate: selectedTrip.start_date,
      tripEndDate: selectedTrip.end_date
    }));
    
    // Navigate to home with search mode
    navigate('/?mode=search&from=planner');
  };

  const handleDeleteItem = async (itemId) => {
    const confirmed = await showConfirm({
      title: 'Delete Item',
      message: 'Are you sure you want to delete this item from your planner?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    
    if (!confirmed) return;
    
    // Optimistic update - remove from UI immediately
    setPlannerItems(prevItems => prevItems.filter(item => item.planner_id !== itemId));
    
    try {
      await axios.delete(`http://localhost:5000/api/planner/items/${itemId}?user_id=${currentUserId}`);
    } catch (error) {
      console.error("Error deleting item:", error.response?.data || error.message);
      // Revert on error
      fetchPlannerItems();
      showToast(`Failed to delete item: ${error.response?.data?.error || 'Unknown error'}`, 'error');
    }
  };

  const handleNoteChange = async (itemId, newNote) => {
    // Optimistic update
    setPlannerItems(prevItems => 
      prevItems.map(item => 
        item.planner_id === itemId 
          ? { ...item, notes: newNote }
          : item
      )
    );
    
    try {
      await axios.put(`http://localhost:5000/api/planner/items/${itemId}/notes`, {
        notes: newNote,
        user_id: currentUserId
      });
    } catch (error) {
      console.error("Error saving note:", error.response?.data || error.message);
      fetchPlannerItems();
      showToast(`Failed to save note: ${error.response?.data?.error || 'Unknown error'}`, 'error');
    }
  };

  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.8';
    
    // Set drag image offset to center vertically but lock horizontally
    const rect = e.currentTarget.getBoundingClientRect();
    e.dataTransfer.setDragImage(
      e.currentTarget,
      e.clientX - rect.left, // Keep horizontal offset same as click point
      rect.height / 2 // Center vertically
    );
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDraggedItem(null);
    setDragOverItem(null);
    setDragPosition(null);
  };

  const handleItemDragOver = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem || draggedItem.planner_id === item.planner_id) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const position = e.clientY < midPoint ? 'above' : 'below';
    
    setDragOverItem(item);
    setDragPosition(position);
  };

  const handleDayDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverItem(null);
    setDragPosition(null);
  };

  const handleItemDrop = async (e, targetItem, targetDay) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem || draggedItem.planner_id === targetItem.planner_id) return;
    
    console.log('[DRAG] Dropping item:', draggedItem.item_name, dragPosition, 'target:', targetItem.item_name);
    
    // Optimistic update - reorder items immediately
    setPlannerItems(prevItems => {
      // Remove the dragged item from all items
      const withoutDragged = prevItems.filter(item => item.planner_id !== draggedItem.planner_id);
      
      // Find the target item's position in the filtered array
      const targetIndex = withoutDragged.findIndex(item => item.planner_id === targetItem.planner_id);
      
      if (targetIndex === -1) {
        console.error('[DRAG] Target item not found');
        return prevItems;
      }
      
      // Calculate insert position based on drag position
      const insertIndex = dragPosition === 'above' ? targetIndex : targetIndex + 1;
      
      console.log('[DRAG] Target at index:', targetIndex, 'inserting at:', insertIndex);
      
      // Create new array with item inserted at the correct position
      const newItems = [...withoutDragged];
      newItems.splice(insertIndex, 0, { ...draggedItem, start_date: targetDay, end_date: targetDay });
      
      console.log('[DRAG] Reordered. Item order:', newItems.map(i => i.item_name));
      
      return newItems;
    });
    
    // Clear drag state immediately for snappy UX
    setDraggedItem(null);
    setDragOverItem(null);
    setDragPosition(null);
    
    // Save the new order to backend (non-blocking)
    setPlannerItems(currentItems => {
      // Get items for the target day and update their order_index
      const dayItems = currentItems.filter(item => item.start_date === targetDay);
      const itemsOrder = dayItems.map((item, index) => ({
        planner_id: item.planner_id,
        order_index: index
      }));
      
      console.log('[DRAG] Saving order to backend:', itemsOrder);
      
      // Send order update to backend
      axios.post('http://localhost:5000/api/planner/items/reorder', {
        items: itemsOrder
      }).then(() => {
        console.log('[DRAG] Order saved, recalculating distances...');
        // Trigger distance recalculation after reordering
        return axios.post(`http://localhost:5000/api/planner/${selectedTrip.trip_id}/calculate-distances`);
      }).then(() => {
        console.log('[DRAG] Distances recalculated, refreshing items...');
        // Refresh items to get updated distances
        fetchPlannerItems(true); // Skip another distance calc
      }).catch(error => {
        console.error("Error saving order:", error.response?.data || error.message);
      });
      
      // Update backend date if moving to different day
      if (draggedItem.start_date !== targetDay) {
        axios.put(`http://localhost:5000/api/planner/items/${draggedItem.planner_id}`, {
          start_date: targetDay,
          end_date: targetDay,
          user_id: currentUserId
        }).catch(error => {
          console.error("Error moving item:", error.response?.data || error.message);
          showToast(`Failed to move item: ${error.response?.data?.error || 'Unknown error'}`, 'error');
          fetchPlannerItems(); // Revert on error
        });
        
        // Refresh distances if moving to different day
        setTimeout(() => {
          fetchPlannerItems();
        }, 500);
      }
      
      return currentItems;
    });
  };

  const handleDayDrop = async (e, targetDay) => {
    e.preventDefault();
    
    if (!draggedItem || !targetDay) return;
    
    // Only update if moving to a different day
    if (draggedItem.start_date === targetDay) {
      setDraggedItem(null);
      return;
    }
    
    // Optimistic update - update UI immediately
    const updatedItem = { ...draggedItem, start_date: targetDay, end_date: targetDay };
    setPlannerItems(prevItems => 
      prevItems.map(item => 
        item.planner_id === draggedItem.planner_id ? updatedItem : item
      )
    );
    
    // Sync with server in background
    try {
      await axios.put(`http://localhost:5000/api/planner/items/${draggedItem.planner_id}`, {
        start_date: targetDay,
        end_date: targetDay,
        user_id: currentUserId
      });
    } catch (error) {
      console.error("Error moving item:", error.response?.data || error.message);
      fetchPlannerItems();
      showToast(`Failed to move item: ${error.response?.data?.error || 'Unknown error'}`, 'error');
    }
    
    setDraggedItem(null);
    setDragOverItem(null);
    setDragPosition(null);
  };

  const getTripDays = () => {
    if (!selectedTrip) return [];
    
    // Handle different possible date field names
    const startDate = selectedTrip.start_date || selectedTrip.startDate;
    const endDate = selectedTrip.end_date || selectedTrip.endDate;
    
    if (!startDate || !endDate) {
      return [];
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = [];
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      days.push(new Date(date).toISOString().split('T')[0]);
    }
    
    return days;
  };

  const getItemsForDay = (day) => {
    return plannerItems.filter(item => item.start_date === day);
  };

  const formatDayName = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Check if selected trip has dates
  const tripDays = getTripDays();
  const hasDates = tripDays.length > 0;

  if (!selectedTrip) {
    return (
      <Layout>
        <div className="planner-page">
          <div className="no-trip-selected">
            <h2>No Trip Selected</h2>
            <p>Please select a trip to view the planner, or create a new trip from the Home page.</p>
            <button 
              className="back-home-btn"
              onClick={() => window.location.href = '/home'}
            >
              Go to Home
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!hasDates) {
    return (
      <Layout>
        <div className="planner-page">
          <div className="no-trip-selected">
            <h2>Trip Missing Dates</h2>
            <p>This trip was created without start and end dates.</p>
            <p>Please create a new trip with dates from the Home page to use the planner.</p>
            <button 
              className="back-home-btn"
              onClick={() => window.location.href = '/home'}
            >
              Go to Home
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="planner-page">
        <div className="planner-header">
          <div className="trip-selector">
            {/* Custom Dropdown - Closed State */}
            <div 
              className="dropdown-trigger"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span>{selectedTrip?.trip_name || selectedTrip?.group_name || 'Select a trip'}</span>
              <svg 
                className={`dropdown-chevron ${isDropdownOpen ? 'open' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>

            {/* Custom Dropdown - Open State */}
            {isDropdownOpen && (
              <div className="dropdown-menu">
                {trips.map(trip => (
                  <div
                    key={trip.trip_id}
                    className={`dropdown-item ${selectedTrip?.trip_id === trip.trip_id ? 'selected' : ''}`}
                    onClick={() => {
                      handleTripChange(trip);
                      setIsDropdownOpen(false);
                    }}
                  >
                    <span>{trip.trip_name || trip.group_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Member list display */}
          {selectedTrip && tripMembers.length > 0 && (
            <div className="trip-members-display">
              <div className="member-avatars">
                {tripMembers.slice(0, 5).map(member => (
                  <div key={member.user_id} className="member-avatar" title={`${member.first_name} ${member.last_name}`}>
                    {member.first_name?.[0]}{member.last_name?.[0]}
                  </div>
                ))}
                {tripMembers.length > 5 && (
                  <button 
                    className="more-members-btn"
                    onClick={() => {
                      setShowMembersModal(true);
                      fetchPendingRequests(selectedTrip.trip_id);
                    }}
                    title={`View all ${tripMembers.length} members`}
                  >
                    +{tripMembers.length - 5}
                  </button>
                )}
              </div>
              {tripMembers.length <= 5 && (
                <button 
                  className="manage-members-icon-btn"
                  onClick={() => {
                    setShowMembersModal(true);
                    fetchPendingRequests(selectedTrip.trip_id);
                  }}
                  title="Manage members"
                >
                  <FaUsers />
                </button>
              )}
            </div>
          )}
        </div>
        
        <div className="planner-container">
          {isLoading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p className="loading-message">Loading planner...</p>
            </div>
          ) : (
            <div className="planner-days">
              {getTripDays().map(day => {
                const dayItems = getItemsForDay(day);
                
                return (
                  <div 
                    key={day} 
                    className="planner-day-card"
                    onDragOver={handleDayDragOver}
                    onDrop={(e) => handleDayDrop(e, day)}
                  >
                    <div className="day-header">
                      <h3>{formatDayName(day)}</h3>
                      <div className="day-actions">
                        <button 
                          className="search-places-btn"
                          onClick={() => handleSearchPlaces(day)}
                          title="Search and add places to this day"
                        >
                          <FaSearch />
                          Search & Add Places
                        </button>
                        <button 
                          className="add-custom-btn"
                          onClick={() => handleAddCustomLocation(day)}
                          title="Add custom item"
                        >
                          <FaPlus />
                          Custom
                        </button>
                      </div>
                    </div>
                    
                    <div className="day-items">
                      {dayItems.length > 0 ? (
                        dayItems.map((item, itemIndex) => {
                          // Find global index to show distance even for first item of new day
                          const globalIndex = plannerItems.findIndex(i => i.planner_id === item.planner_id);
                          const hasDistance = item.distance_from_previous && item.duration_from_previous && item.from_location;
                          
                          return (
                          <div 
                            key={item.planner_id} 
                            className="item-wrapper"
                            draggable
                            onDragStart={(e) => handleDragStart(e, item)}
                            onDragEnd={handleDragEnd}
                          >
                              {globalIndex > 0 && hasDistance && (
                              <div className="travel-peek-box">
                                <div className="travel-peek-content">
                                  <svg className="travel-car-icon" width="24" height="24" viewBox="0 0 24 24" fill="white">
                                    <path d="M16,6l3,4h2c1.11,0,2,0.89,2,2v3h-2c0,1.66-1.34,3-3,3s-3-1.34-3-3H9c0,1.66-1.34,3-3,3s-3-1.34-3-3H1v-3c0-1.11,0.89-2,2-2
                                      l3-4H16 M10.5,7.5H6.75L4.86,10h5.64V7.5 M12,7.5V10h5.14l-1.89-2.5H12 M6,13.5c-0.83,0-1.5,0.67-1.5,1.5s0.67,1.5,1.5,1.5
                                      s1.5-0.67,1.5-1.5S6.83,13.5,6,13.5 M18,13.5c-0.83,0-1.5,0.67-1.5,1.5s0.67,1.5,1.5,1.5s1.5-0.67,1.5-1.5S18.83,13.5,18,13.5z"/>
                                  </svg>
                                  <span className="travel-text">
                                      {`${item.duration_from_previous} • ${item.distance_from_previous} from ${item.from_location}`}
                                  </span>
                                </div>
                              </div>
                            )}
                            
                            <div 
                              className={`planner-item ${
                                dragOverItem?.planner_id === item.planner_id 
                                  ? dragPosition === 'above' ? 'drag-over-above' : 'drag-over-below'
                                  : ''
                              }`}
                              onDragOver={(e) => handleItemDragOver(e, item)}
                              onDrop={(e) => handleItemDrop(e, item, day)}
                            >
                              <div className="item-drag-handle">
                                <FaGripVertical />
                              </div>
                              {item.photo_url && (
                                <div className="item-photo">
                                  <img src={item.photo_url} alt={item.item_name} />
                                </div>
                              )}
                              <div className="item-content">
                                <div className="item-header">
                                  <div className="item-title-section">
                                    <h4>{item.item_name}</h4>
                                    <input
                                      type="text"
                                      className="item-note-subheading"
                                      value={item.notes || ''}
                                      onChange={(e) => handleNoteChange(item.planner_id, e.target.value)}
                                      placeholder="Add note..."
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                  <button 
                                    className="delete-item-btn"
                                    onClick={() => handleDeleteItem(item.planner_id)}
                                    title="Delete Item"
                                  >
                                    <FaTrash />
                                  </button>
                                </div>
                                
                                {item.item_type !== 'custom' && (
                                  <div className="item-type-badge">
                                    {item.item_type}
                                  </div>
                                )}
                                
                                {(item.start_time || item.end_time) && (
                                  <div className="item-time">
                                    {formatTime(item.start_time)}
                                    {item.start_time && item.end_time && ' - '}
                                    {formatTime(item.end_time)}
                                  </div>
                                )}
                                
                                {item.location && (
                                  <div className="item-location">
                                    <FaMapMarkerAlt />
                                    {item.location}
                                  </div>
                                )}
                                
                                {item.description && (
                                  <div className="item-description">
                                    {item.description}
                                  </div>
                                )}
                                
                                {item.cost && (
                                  <div className="item-cost">
                                    ${item.cost}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                        })
                      ) : (
                        <div className="no-items">
                          <p>No items planned for this day</p>
                        </div>
                      )}
                    </div>

                    {/* Recommendations Section */}
                    {dayItems.length > 0 && (
                      <div className="recommendations-section">
                        <div className="recommendations-header">
                          <h4>Recommended Places</h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FaFilter style={{ fontSize: '12px', color: '#a1a1aa' }} />
                            <div className="planner-filter-dropdown">
                              {/* Custom Dropdown - Closed State */}
                              <div 
                                className="dropdown-trigger"
                                onClick={() => setFilterDropdownOpen(prev => ({ ...prev, [day]: !prev[day] }))}
                              >
                                <span>{getFilterDisplayText(selectedFilter[day] || 'all')}</span>
                                <svg 
                                  className={`dropdown-chevron ${filterDropdownOpen[day] ? 'open' : ''}`}
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24" 
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                </svg>
                              </div>

                              {/* Custom Dropdown - Open State */}
                              {filterDropdownOpen[day] && (
                                <div className="dropdown-menu">
                                  {['all', 'attractions', 'parks', 'museums', 'restaurants', 'cafes', 'shopping', 'hikes', 'nature', 'art', 'entertainment', 'nightlife', 'landmarks'].map(filterType => (
                                    <div
                                      key={filterType}
                                      className={`dropdown-item ${(selectedFilter[day] || 'all') === filterType ? 'selected' : ''}`}
                                      onClick={() => {
                                        handleFilterChange(day, dayItems[dayItems.length - 1], filterType);
                                        setFilterDropdownOpen(prev => ({ ...prev, [day]: false }));
                                      }}
                                    >
                                      <span>{getFilterDisplayText(filterType)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {loadingRecommendations[day] ? (
                          <div className="recommendations-scroll">
                            {[1, 2, 3, 4, 5, 6].map((idx) => (
                              <div key={idx} className="recommendation-card skeleton-card">
                                <div className="rec-image skeleton-image"></div>
                                <div className="rec-content">
                                  <div className="skeleton-text skeleton-title"></div>
                                  <div className="skeleton-text skeleton-subtitle"></div>
                                  <div className="skeleton-text skeleton-address"></div>
                                </div>
                                <div className="skeleton-button"></div>
                              </div>
                            ))}
                          </div>
                        ) : recommendations[day] && recommendations[day].length > 0 ? (
                          <>
                            <div className="recommendations-scroll">
                              {recommendations[day].slice(0, 6).map((rec, idx) => (
                                <div key={idx} className="recommendation-card">
                                  {rec.photo_url && (
                                    <div className="rec-image" style={{ backgroundImage: `url(${rec.photo_url})` }}>
                                      {rec.rating && (
                                        <div className="rec-rating">
                                          <FaStar /> {rec.rating.toFixed(1)}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="rec-content">
                                    <h5 className="rec-name">{rec.name}</h5>
                                    <p className="rec-distance">{rec.distance.replace(' away', '').replace(' ', '')} • {rec.duration}</p>
                                    <p className="rec-address">{rec.address}</p>
                                  </div>
                                  <button className="add-rec-btn-circular" onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddRecommendationToPlanner(rec, day, selectedFilter[day] || 'all');
                                  }} title="Add to planner">
                                    <FaPlus />
                                  </button>
                                </div>
                              ))}
                            </div>
                            {recommendations[day].length > 6 && (
                              <button 
                                className="show-more-btn"
                                onClick={() => handleShowMoreRecommendations(day, dayItems[dayItems.length - 1])}
                                style={{ marginTop: '1rem' }}
                              >
                                View All
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="no-recommendations">
                            <p>No recommendations found in this area.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Manage Members Modal */}
      {showMembersModal && selectedTrip && (
        <div className="modal-overlay" onClick={() => setShowMembersModal(false)}>
          <div className="modal-content manage-members-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FaUsers style={{ marginRight: '10px' }} />
                Manage Members - {selectedTrip.trip_name}
              </h2>
              <button className="close-modal-btn" onClick={() => setShowMembersModal(false)}>
                <FaTimes />
              </button>
            </div>

            <div className="modal-body">
              {/* Current Members */}
              <div className="members-section">
                <h3>Members ({tripMembers.length})</h3>
                <div className="members-list">
                  {tripMembers.map(member => (
                    <div key={member.user_id} className="member-item">
                      <div className="member-avatar-large">
                        {member.first_name?.[0]}{member.last_name?.[0]}
                      </div>
                      <div className="member-info">
                        <div className="member-name">{member.first_name} {member.last_name}</div>
                        <div className="member-role">{member.role}</div>
                      </div>
                      {currentUserRole && ['owner', 'admin'].includes(currentUserRole) && 
                       member.user_id !== currentUserId && 
                       member.role !== 'owner' && (
                        <button 
                          className="remove-member-btn"
                          onClick={() => handleRemoveMember(member.user_id)}
                          title="Remove member"
                        >
                          <FaTimes />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending Invitations (for owners/admins) */}
              {currentUserRole && ['owner', 'admin'].includes(currentUserRole) && sentInvitations.length > 0 && (
                <div className="members-section">
                  <h3>Pending Invitations ({sentInvitations.length})</h3>
                  <div className="members-list">
                    {sentInvitations.map(inv => (
                      <div key={inv.friend_id} className="member-item pending">
                        <div className="member-avatar-large">
                          {inv.first_name?.[0]}{inv.last_name?.[0]}
                        </div>
                        <div className="member-info">
                          <div className="member-name">{inv.first_name} {inv.last_name}</div>
                          <div className="member-status">
                            {inv.owner_approved && !inv.friend_accepted && "Waiting for friend to accept"}
                            {!inv.owner_approved && inv.friend_accepted && "Waiting for owner approval"}
                            {!inv.owner_approved && !inv.friend_accepted && "Waiting for approvals"}
                          </div>
                        </div>
                        <span className="status-badge pending">Pending</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* My Pending Requests (for non-owners) */}
              {currentUserRole && !['owner', 'admin'].includes(currentUserRole) && myPendingRequests.length > 0 && (
                <div className="members-section">
                  <h3>My Pending Requests ({myPendingRequests.length})</h3>
                  <div className="members-list">
                    {myPendingRequests.map(req => (
                      <div key={req.friend_id} className="member-item pending">
                        <div className="member-avatar-large">
                          {req.first_name?.[0]}{req.last_name?.[0]}
                        </div>
                        <div className="member-info">
                          <div className="member-name">{req.first_name} {req.last_name}</div>
                          <div className="member-status">
                            {req.owner_approved && !req.friend_accepted && "Waiting for friend to accept"}
                            {!req.owner_approved && req.friend_accepted && "Waiting for owner approval"}
                            {!req.owner_approved && !req.friend_accepted && "Waiting for approvals"}
                          </div>
                        </div>
                        <span className="status-badge pending">Pending</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Member Requests (for owners/admins to approve) */}
              {currentUserRole && ['owner', 'admin'].includes(currentUserRole) && pendingRequests.length > 0 && (
                <div className="members-section">
                  <h3>Member Requests ({pendingRequests.length})</h3>
                  <div className="members-list">
                    {pendingRequests.map(req => (
                      <div key={req.id} className="member-item request">
                        <div className="member-avatar-large">
                          {req.friend_first_name?.[0]}{req.friend_last_name?.[0]}
                        </div>
                        <div className="member-info">
                          <div className="member-name">{req.friend_first_name} {req.friend_last_name}</div>
                          <div className="member-status">Requested by {req.requester_first_name}</div>
                        </div>
                        <div className="request-actions">
                          <button 
                            className="approve-btn"
                            onClick={() => handleApproveRequest(req.id)}
                            title="Approve request"
                          >
                            <FaCheckCircle /> Approve
                          </button>
                          <button 
                            className="reject-btn"
                            onClick={() => handleRejectRequest(req.id)}
                            title="Reject request"
                          >
                            <FaTimesCircle /> Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invite Friends Section */}
              <div className="members-section">
                <h3>
                  {currentUserRole && ['owner', 'admin'].includes(currentUserRole) 
                    ? 'Invite Friends' 
                    : 'Request to Add Friends'}
                </h3>
                {availableFriends.length === 0 ? (
                  <p className="no-friends-message">No friends available to invite</p>
                ) : (
                  <div className="members-list">
                    {availableFriends.map(friend => (
                      <div key={friend.user_id} className="member-item">
                        <div className="member-avatar-large">
                          {friend.first_name?.[0]}{friend.last_name?.[0]}
                        </div>
                        <div className="member-info">
                          <div className="member-name">{friend.first_name} {friend.last_name}</div>
                        </div>
                        <button 
                          className="add-member-btn"
                          onClick={() => {
                            if (currentUserRole && ['owner', 'admin'].includes(currentUserRole)) {
                              handleAddMemberToTrip(friend.user_id);
                            } else {
                              handleRequestAddMember(friend.user_id);
                            }
                          }}
                          title={currentUserRole && ['owner', 'admin'].includes(currentUserRole) 
                            ? 'Send invitation' 
                            : 'Request to add'}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="8.5" cy="7" r="4"></circle>
                            <line x1="20" y1="8" x2="20" y2="14"></line>
                            <line x1="23" y1="11" x2="17" y2="11"></line>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* More Recommendations Modal */}
      {showRecommendationsModal && (
        <div className="modal-overlay" onClick={() => setShowRecommendationsModal(false)}>
          <div className="modal-content recommendations-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>All Recommendations</h2>
              <button className="close-modal-btn" onClick={() => setShowRecommendationsModal(false)}>
                <FaTimes />
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-filter-section">
                <FaFilter style={{ fontSize: '14px', color: '#a1a1aa' }} />
                <div className="modal-filter-dropdown">
                  {/* Custom Dropdown - Closed State */}
                  <div 
                    className="dropdown-trigger"
                    onClick={() => setModalFilterDropdownOpen(!modalFilterDropdownOpen)}
                  >
                    <span>{getFilterDisplayText(modalFilter)}</span>
                    <svg 
                      className={`dropdown-chevron ${modalFilterDropdownOpen ? 'open' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24" 
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </div>

                  {/* Custom Dropdown - Open State */}
                  {modalFilterDropdownOpen && (
                    <div className="dropdown-menu">
                      {['all', 'attractions', 'parks', 'museums', 'restaurants', 'cafes', 'shopping', 'hikes', 'nature', 'art', 'entertainment', 'nightlife', 'landmarks'].map(filterType => (
                        <div
                          key={filterType}
                          className={`dropdown-item ${modalFilter === filterType ? 'selected' : ''}`}
                          onClick={() => {
                            const lastItem = plannerItems.filter(item => item.start_date === modalDay).slice(-1)[0];
                            handleModalFilterChange(filterType, lastItem);
                            setModalFilterDropdownOpen(false);
                          }}
                        >
                          <span>{getFilterDisplayText(filterType)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-recommendations-scroll">
                {loadingModalRecommendations ? (
                  // Skeleton loading - 6 items (divisible by 3)
                  [1, 2, 3, 4, 5, 6].map((idx) => (
                    <div key={idx} className="recommendation-card modal-rec-card skeleton-card">
                      <div className="rec-image skeleton-image"></div>
                      <div className="rec-content">
                        <div className="skeleton-text skeleton-title"></div>
                        <div className="skeleton-text skeleton-subtitle"></div>
                        <div className="skeleton-text skeleton-address"></div>
                      </div>
                      <div className="skeleton-button"></div>
                    </div>
                  ))
                ) : modalRecommendations.length > 0 ? (
                  getDisplayableRecommendations(modalRecommendations).map((rec, idx) => (
                    <div key={idx} className="recommendation-card modal-rec-card">
                      {rec.photo_url && (
                        <div className="rec-image" style={{ backgroundImage: `url(${rec.photo_url})` }}>
                          {rec.rating && (
                            <div className="rec-rating">
                              <FaStar /> {rec.rating.toFixed(1)}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="rec-content">
                        <h5 className="rec-name">{rec.name}</h5>
                        <p className="rec-distance">{rec.distance.replace(' away', '').replace(' ', '')} • {rec.duration}</p>
                        <p className="rec-address">{rec.address}</p>
                      </div>
                      <button 
                        className="add-rec-btn-circular"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddRecommendationToPlanner(rec, modalDay, modalFilter);
                        }}
                        title="Add to planner"
                      >
                        <FaPlus />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="no-modal-recommendations">
                    <p>No recommendations found for this filter.</p>
                  </div>
                )}
              </div>

              {/* Load More Button */}
              {modalNextPageToken && (
                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                  <button 
                    onClick={handleLoadMoreRecommendations}
                    disabled={loadingMoreRecommendations}
                    className="load-more-btn"
                  >
                    {loadingMoreRecommendations ? 'Loading...' : 'Load More Recommendations'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Planner;

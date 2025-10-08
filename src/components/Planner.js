import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  FaPlus, 
  FaMapMarkerAlt, 
  FaTrash, 
  FaSearch,
  FaGripVertical
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

  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const currentUserId = currentUser.user_id;

  // Fetch trips and planner items on component mount
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

  const fetchTrips = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/trips/${currentUserId}`);
      console.log('Fetched trips:', response.data.trips);
      setTrips(response.data.trips || []);
      
      // If no trip is selected and there are trips, select the first one
      if (!selectedTrip && response.data.trips && response.data.trips.length > 0) {
        console.log('Auto-selecting first trip:', response.data.trips[0]);
        setSelectedTrip(response.data.trips[0]);
      }
    } catch (error) {
      console.error("Error fetching trips:", error.response?.data || error.message);
    }
  };

  const fetchPlannerItems = async (skipDistanceCalc = false) => {
    if (!selectedTrip) return;
    
    try {
      const response = await axios.get(`http://localhost:5000/api/planner/${selectedTrip.trip_id}`);
      setPlannerItems(response.data.items || []);
      
      // Calculate distances in background if not skipping
      if (!skipDistanceCalc) {
        setTimeout(() => {
          axios.post(`http://localhost:5000/api/planner/${selectedTrip.trip_id}/calculate-distances`)
            .then(res => {
              console.log('[DISTANCE] Background calculation complete:', res.data);
              // Refresh items to get updated distances
              fetchPlannerItems(true); // Skip distance calc on refresh
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
  };

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
      alert(`Failed to save item: ${error.response?.data?.error || 'Unknown error'}`);
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
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    
    // Optimistic update - remove from UI immediately
    setPlannerItems(prevItems => prevItems.filter(item => item.planner_id !== itemId));
    
    try {
      await axios.delete(`http://localhost:5000/api/planner/items/${itemId}?user_id=${currentUserId}`);
    } catch (error) {
      console.error("Error deleting item:", error.response?.data || error.message);
      // Revert on error
      fetchPlannerItems();
      alert(`Failed to delete item: ${error.response?.data?.error || 'Unknown error'}`);
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
      alert(`Failed to save note: ${error.response?.data?.error || 'Unknown error'}`);
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
          alert(`Failed to move item: ${error.response?.data?.error || 'Unknown error'}`);
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
      alert(`Failed to move item: ${error.response?.data?.error || 'Unknown error'}`);
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
            <select
              id="trip-select"
              value={selectedTrip?.trip_id || ''}
              onChange={(e) => {
                const trip = trips.find(t => t.trip_id === parseInt(e.target.value));
                handleTripChange(trip);
              }}
            >
              {trips.map(trip => (
                <option key={trip.trip_id} value={trip.trip_id}>{trip.trip_name || trip.group_name}</option>
              ))}
            </select>
          </div>
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
                        dayItems.map((item, itemIndex) => (
                          <div 
                            key={item.planner_id} 
                            className="item-wrapper"
                            draggable
                            onDragStart={(e) => handleDragStart(e, item)}
                            onDragEnd={handleDragEnd}
                          >
                            {itemIndex > 0 && (
                              <div className="travel-peek-box">
                                <div className="travel-peek-content">
                                  <svg className="travel-car-icon" width="24" height="24" viewBox="0 0 24 24" fill="white">
                                    <path d="M16,6l3,4h2c1.11,0,2,0.89,2,2v3h-2c0,1.66-1.34,3-3,3s-3-1.34-3-3H9c0,1.66-1.34,3-3,3s-3-1.34-3-3H1v-3c0-1.11,0.89-2,2-2
                                      l3-4H16 M10.5,7.5H6.75L4.86,10h5.64V7.5 M12,7.5V10h5.14l-1.89-2.5H12 M6,13.5c-0.83,0-1.5,0.67-1.5,1.5s0.67,1.5,1.5,1.5
                                      s1.5-0.67,1.5-1.5S6.83,13.5,6,13.5 M18,13.5c-0.83,0-1.5,0.67-1.5,1.5s0.67,1.5,1.5,1.5s1.5-0.67,1.5-1.5S18.83,13.5,18,13.5z"/>
                                  </svg>
                                  <span className="travel-text">
                                    {item.distance_from_previous && item.duration_from_previous && item.from_location
                                      ? `${item.duration_from_previous} • ${item.distance_from_previous} from ${item.from_location}`
                                      : 'Calculating distance...'}
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
                        ))
                      ) : (
                        <div className="no-items">
                          <p>No items planned for this day</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Planner;

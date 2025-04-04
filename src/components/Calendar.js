import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  FaCalendarAlt, 
  FaPlus, 
  FaMapMarkerAlt, 
  FaUsers, 
  FaTrash, 
  FaEdit, 
  FaTimes,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';
import Layout from './Layout';
import './styles/Calendar.css';

const Calendar = () => {
  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [viewMode, setViewMode] = useState('month'); // 'month', 'week', 'day'
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    location: '',
    placeId: '',
    groupId: ''
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentEventId, setCurrentEventId] = useState(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEvents, setFilteredEvents] = useState([]);

  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const currentUserId = currentUser.user_id;

  // Fetch calendar events and groups on component mount
  useEffect(() => {
    if (!currentUserId) {
      navigate('/login');
      return;
    }
    
    fetchGroups();
    fetchEvents();
  }, [currentUserId, selectedGroup, currentDate, navigate]);

  // Filter events when search query changes
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredEvents(events);
      return;
    }
    
    const filtered = events.filter(event => 
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.location && event.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (event.place_name && event.place_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (event.place_address && event.place_address.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    
    setFilteredEvents(filtered);
  }, [events, searchQuery]);

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/calendar/groups/${currentUserId}`);
      setGroups(response.data.groups || []);
      
      // If no group is selected and there are groups, select the first one
      if (!selectedGroup && response.data.groups && response.data.groups.length > 0) {
        setSelectedGroup(response.data.groups[0].id);
      }
    } catch (error) {
      console.error("Error fetching groups:", error.response?.data || error.message);
    }
  };

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      // Get start and end of month for filtering
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const startDateStr = startOfMonth.toISOString().split('T')[0];
      const endDateStr = endOfMonth.toISOString().split('T')[0];
      
      let url = `http://localhost:5000/api/calendar/events?user_id=${currentUserId}&start_date=${startDateStr}&end_date=${endDateStr}`;
      
      if (selectedGroup) {
        url += `&group_id=${selectedGroup}`;
      }
      
      const response = await axios.get(url);
      setEvents(response.data.events || []);
      setFilteredEvents(response.data.events || []);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching events:", error.response?.data || error.message);
      setIsLoading(false);
    }
  };

  const handleGroupChange = (groupId) => {
    setSelectedGroup(groupId);
  };

  const handleAddEvent = () => {
    setIsEditMode(false);
    setCurrentEventId(null);
    // Default the form to today's date and the selected group
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    
    setEventForm({
      title: '',
      description: '',
      startDate: formattedDate,
      endDate: '',
      location: '',
      placeId: '',
      groupId: selectedGroup || ''
    });
    
    setShowEventModal(true);
  };

  const handleEditEvent = (event) => {
    setIsEditMode(true);
    setCurrentEventId(event.event_id);
    
    // Format dates for the form
    const startDate = event.start_date ? event.start_date.split('T')[0] : '';
    const endDate = event.end_date ? event.end_date.split('T')[0] : '';
    
    setEventForm({
      title: event.title,
      description: event.description || '',
      startDate,
      endDate,
      // Use place_address if available, otherwise fall back to location
      location: event.place_address || event.location || '',
      placeId: event.place_id || '',
      groupId: event.group_id
    });
    
    setShowEventModal(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setEventForm({
      ...eventForm,
      [name]: value
    });
  };

  const handleSubmitEvent = async (e) => {
    e.preventDefault();
    
    if (!eventForm.title.trim() || !eventForm.startDate || !eventForm.groupId) {
      alert('Please fill in all required fields');
      return;
    }
    
    try {
      if (isEditMode) {
        // Update existing event
        await axios.put(`http://localhost:5000/api/calendar/events/${currentEventId}`, {
          user_id: currentUserId,
          title: eventForm.title,
          description: eventForm.description,
          start_date: eventForm.startDate,
          end_date: eventForm.endDate || null,
          location: eventForm.location,
          place_id: eventForm.placeId || null
        });
      } else {
        // Create new event
        await axios.post('http://localhost:5000/api/calendar/events', {
          title: eventForm.title,
          description: eventForm.description,
          start_date: eventForm.startDate,
          end_date: eventForm.endDate || null,
          location: eventForm.location,
          place_id: eventForm.placeId || null,
          group_id: eventForm.groupId,
          created_by: currentUserId
        });
      }
      
      setShowEventModal(false);
      fetchEvents(); // Refresh events
    } catch (error) {
      console.error("Error saving event:", error.response?.data || error.message);
      alert(`Failed to save event: ${error.response?.data?.error || 'Unknown error'}`);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    
    try {
      await axios.delete(`http://localhost:5000/api/calendar/events/${eventId}?user_id=${currentUserId}`);
      fetchEvents(); // Refresh events
      setShowEventDetails(false); // Close the details modal if open
    } catch (error) {
      console.error("Error deleting event:", error.response?.data || error.message);
      alert(`Failed to delete event: ${error.response?.data?.error || 'Unknown error'}`);
    }
  };

  const handleViewEvent = (event) => {
    setSelectedEvent(event);
    setShowEventDetails(true);
  };

  const handleMonthChange = (increment) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + increment);
    setCurrentDate(newDate);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
  };

  const getMonthName = (date) => {
    return date.toLocaleString('default', { month: 'long' }) + ' ' + date.getFullYear();
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Get the day of week for the first day of the month (0 = Sunday, 1 = Monday, etc.)
    const firstDay = new Date(year, month, 1).getDay();
    
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: 0, date: null });
    }
    
    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ 
        day: i, 
        date: new Date(year, month, i),
        events: filteredEvents.filter(event => {
          const eventDate = new Date(event.start_date);
          return eventDate.getDate() === i && 
                 eventDate.getMonth() === month && 
                 eventDate.getFullYear() === year;
        })
      });
    }
    
    return days;
  };

  const formatEventTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatEventDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const renderCalendarMonth = () => {
    const days = getDaysInMonth(currentDate);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    return (
      <div className="calendar-month">
        <div className="day-headers">
          {dayNames.map((day, index) => (
            <div key={index} className="day-header">{day}</div>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((day, index) => (
            <div 
              key={index} 
              className={`calendar-day ${day.day === 0 ? 'empty-day' : ''} ${
                day.date && day.date.toDateString() === new Date().toDateString() ? 'today' : ''
              }`}
            >
              {day.day > 0 && (
                <>
                  <div className="day-number">{day.day}</div>
                  <div className="day-events">
                    {day.events.slice(0, 3).map((event, eventIndex) => (
                      <div 
                        key={eventIndex} 
                        className="day-event"
                        onClick={() => handleViewEvent(event)}
                      >
                        <span className="event-time">{formatEventTime(event.start_date)}</span>
                        <span className="event-title">{event.title}</span>
                      </div>
                    ))}
                    {day.events.length > 3 && (
                      <div className="more-events">
                        +{day.events.length - 3} more
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCalendarList = () => {
    // Group events by date
    const eventsByDate = {};
    
    filteredEvents.forEach(event => {
      const date = new Date(event.start_date).toDateString();
      if (!eventsByDate[date]) {
        eventsByDate[date] = [];
      }
      eventsByDate[date].push(event);
    });
    
    // Sort dates
    const sortedDates = Object.keys(eventsByDate).sort(
      (a, b) => new Date(a) - new Date(b)
    );
    
    return (
      <div className="calendar-list">
        {sortedDates.length > 0 ? (
          sortedDates.map(date => (
            <div key={date} className="list-date-group">
              <div className="list-date-header">
                {new Date(date).toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
              <div className="list-events">
                {eventsByDate[date].map(event => (
                  <div key={event.event_id} className="list-event-card" onClick={() => handleViewEvent(event)}>
                    <div className="list-event-time">{formatEventTime(event.start_date)}</div>
                    <div className="list-event-content">
                      <h3 className="list-event-title">{event.title}</h3>
                      {(event.place_address || event.location) && (
                        <div className="list-event-location">
                          <FaMapMarkerAlt className="location-icon" />
                          {event.place_address || event.location}
                        </div>
                      )}
                      <div className="list-event-group">
                        <FaUsers className="group-icon" />
                        {event.group_name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="no-events">
            <FaCalendarAlt className="no-events-icon" />
            <h3>No events found</h3>
            <p>
              {searchQuery ? 
                'Try adjusting your search terms or select a different group.' : 
                'Create a new event to get started.'}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout>
      <div className="calendar-page">
        <div className="calendar-header">
          <h1>Group Calendar</h1>
          
          <div className="calendar-controls">
            <div className="group-selector">
              <label htmlFor="group-select">Group:</label>
              <select
                id="group-select"
                value={selectedGroup || ''}
                onChange={(e) => handleGroupChange(e.target.value)}
              >
                <option value="">All Groups</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
            
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="view-mode-selector">
              <button 
                className={viewMode === 'month' ? 'active' : ''} 
                onClick={() => handleViewModeChange('month')}
              >
                Month
              </button>
              <button 
                className={viewMode === 'list' ? 'active' : ''} 
                onClick={() => handleViewModeChange('list')}
              >
                List
              </button>
            </div>
            
            <button className="add-event-button" onClick={handleAddEvent}>
              <FaPlus /> Add Event
            </button>
          </div>
          
          {viewMode === 'month' && (
            <div className="month-navigation">
              <button onClick={() => handleMonthChange(-1)}>
                <FaChevronLeft />
              </button>
              <h2>{getMonthName(currentDate)}</h2>
              <button onClick={() => handleMonthChange(1)}>
                <FaChevronRight />
              </button>
            </div>
          )}
        </div>
        
        <div className="calendar-container">
          {isLoading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p className="loading-message">Loading calendar events...</p>
            </div>
          ) : (
            <>
              {viewMode === 'month' ? renderCalendarMonth() : renderCalendarList()}
            </>
          )}
        </div>
        
        {/* Event Creation/Edit Modal */}
        {showEventModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h2>{isEditMode ? 'Edit Event' : 'Create New Event'}</h2>
                <button 
                  className="close-modal" 
                  onClick={() => setShowEventModal(false)}
                  aria-label="Close modal"
                >
                  <FaTimes />
                </button>
              </div>
              
              <form className="event-form" onSubmit={handleSubmitEvent}>
                <div className="form-group">
                  <label htmlFor="title">Event Title *</label>
                  <input
                    id="title"
                    name="title"
                    type="text"
                    placeholder="Enter event title..."
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
                    <label htmlFor="startDate">Start Date *</label>
                    <input
                      id="startDate"
                      name="startDate"
                      type="date"
                      value={eventForm.startDate}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="endDate">End Date</label>
                    <input
                      id="endDate"
                      name="endDate"
                      type="date"
                      value={eventForm.endDate}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label htmlFor="location">Location</label>
                  <input
                    id="location"
                    name="location"
                    type="text"
                    placeholder="Add a location..."
                    value={eventForm.location}
                    onChange={handleFormChange}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="groupId">Group *</label>
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
                </div>
                
                <div className="modal-footer">
                  <button 
                    type="button" 
                    className="cancel-button" 
                    onClick={() => setShowEventModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="save-button"
                  >
                    {isEditMode ? 'Update Event' : 'Create Event'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Event Details Modal */}
        {showEventDetails && selectedEvent && (
          <div className="modal-overlay">
            <div className="modal-content event-details-modal">
              <div className="modal-header">
                <h2>Event Details</h2>
                <button 
                  className="close-modal" 
                  onClick={() => setShowEventDetails(false)}
                  aria-label="Close modal"
                >
                  <FaTimes />
                </button>
              </div>
              
              <div className="event-details">
                <h3 className="event-title">{selectedEvent.title}</h3>
                
                <div className="event-metadata">
                  <div className="event-date">
                    <strong>Date:</strong> {formatEventDate(selectedEvent.start_date)}
                    {selectedEvent.end_date && ` - ${formatEventDate(selectedEvent.end_date)}`}
                  </div>
                  
                  <div className="event-time">
                    <strong>Time:</strong> {formatEventTime(selectedEvent.start_date)}
                  </div>
                  
                  <div className="event-group">
                    <FaUsers className="icon" />
                    <strong>Group:</strong> {selectedEvent.group_name}
                  </div>
                  
                  {/* Use place_address if available, otherwise use location */}
                  {(selectedEvent.place_address || selectedEvent.location) && (
                    <div className="event-location">
                      <FaMapMarkerAlt className="icon" />
                      <strong>Location:</strong>{' '}
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          selectedEvent.place_address || selectedEvent.location
                        )}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        {selectedEvent.place_address || selectedEvent.location}
                      </a>
                    </div>
                  )}
                  
                  {selectedEvent.place_name && (
                    <div className="event-place">
                      <strong>Place:</strong> {selectedEvent.place_name}
                      {selectedEvent.place_category && ` (${selectedEvent.place_category})`}
                    </div>
                  )}
                </div>
                
                {selectedEvent.description && (
                  <div className="event-description">
                    <h4>Description</h4>
                    <p>{selectedEvent.description}</p>
                  </div>
                )}
                
                {/* Only show edit/delete if user is the creator */}
                {selectedEvent.created_by === currentUserId && (
                  <div className="event-actions">
                    <button 
                      className="edit-button" 
                      onClick={() => {
                        setShowEventDetails(false);
                        handleEditEvent(selectedEvent);
                      }}
                    >
                      <FaEdit /> Edit
                    </button>
                    <button 
                      className="delete-button" 
                      onClick={() => handleDeleteEvent(selectedEvent.event_id)}
                    >
                      <FaTrash /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Calendar;
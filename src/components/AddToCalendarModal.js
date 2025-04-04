import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaTimes, FaCalendarPlus } from 'react-icons/fa';

const AddToCalendarModal = ({ place, onClose }) => {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eventForm, setEventForm] = useState({
    title: place?.place_name || '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    location: place?.city_name || '',
    placeId: place?.place_id || '',
    groupId: ''
  });

  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const currentUserId = currentUser.user_id;

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`http://localhost:5000/api/calendar/groups/${currentUserId}`);
      setGroups(response.data.groups || []);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching groups:", error.response?.data || error.message);
      setIsLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setEventForm({
      ...eventForm,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!eventForm.title.trim() || !eventForm.startDate || !eventForm.groupId) {
      alert('Please fill in all required fields');
      return;
    }
    
    try {
      await axios.post('http://localhost:5000/api/calendar/events', {
        title: eventForm.title,
        description: eventForm.description,
        start_date: eventForm.startDate,
        end_date: eventForm.endDate || null,
        location: eventForm.location,
        place_id: eventForm.placeId,
        group_id: eventForm.groupId,
        created_by: currentUserId
      });
      
      alert('Event added to calendar successfully!');
      onClose();
    } catch (error) {
      console.error("Error creating event:", error.response?.data || error.message);
      alert(`Failed to add event: ${error.response?.data?.error || 'Unknown error'}`);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content calendar-modal">
        <div className="modal-header">
          <h2>Add to Calendar</h2>
          <button 
            className="close-modal" 
            onClick={onClose}
          >
            <FaTimes />
          </button>
        </div>
        
        {isLoading ? (
          <div className="modal-loading">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        ) : (
          <form className="event-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="title">Event Title *</label>
              <input
                id="title"
                name="title"
                type="text"
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
                <label htmlFor="startDate">Date *</label>
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={eventForm.startDate}
                  onChange={handleFormChange}
                  required
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                name="location"
                type="text"
                value={eventForm.location}
                onChange={handleFormChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="groupId">Group Calendar *</label>
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
              {groups.length === 0 && (
                <p className="no-groups-message">
                  You don't have any groups yet. Join or create a group to add events to a calendar.
                </p>
              )}
            </div>
            
            <div className="modal-footer">
              <button type="button" className="cancel-button" onClick={onClose}>
                Cancel
              </button>
              <button 
                type="submit" 
                className="add-calendar-button" 
                disabled={groups.length === 0}
              >
                <FaCalendarPlus /> Add to Calendar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AddToCalendarModal;
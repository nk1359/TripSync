import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaTimes, FaCalendarPlus, FaCheckCircle } from 'react-icons/fa';
import { useToast } from './ToastContext';
import './styles/Calendar.css';
import API_URL from '../config';

const AddToCalendarModal = ({ place, onClose }) => {
  const { showToast } = useToast();
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: place?.place_name || '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    city: place?.city_name && place?.address ? `${place.city_name}, ${place.address.split(',').pop()?.trim()}` : (place?.city_name || ''),
    address: place?.address || '',
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
      const response = await axios.get(`${API_URL}/api/calendar/groups/${currentUserId}`);
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
      showToast('Please fill in all required fields', 'error');
      return;
    }
    
    try {
      await axios.post(`${API_URL}/api/calendar/events`, {
        title: eventForm.title,
        description: eventForm.description,
        start_date: eventForm.startDate,
        end_date: eventForm.endDate || null,
        location: eventForm.city,
        place_id: eventForm.placeId,
        group_id: eventForm.groupId,
        created_by: currentUserId
      });
      
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Error creating event:", error.response?.data || error.message);
      showToast(`Failed to add event: ${error.response?.data?.error || 'Unknown error'}`, 'error');
    }
  };

  const SuccessMessage = () => (
    <div className="success-message">
      <FaCheckCircle className="success-icon" />
      <h3>Event Added Successfully!</h3>
      <p>Your event has been added to the calendar.</p>
    </div>
  );

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
        ) : isSuccess ? (
          <SuccessMessage />
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
              <label htmlFor="city">City</label>
              <input
                id="city"
                name="city"
                type="text"
                value={eventForm.city}
                onChange={handleFormChange}
                placeholder="Enter city..."
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="address">Address</label>
              <input
                id="address"
                name="address"
                type="text"
                value={eventForm.address}
                readOnly
                className="readonly-field"
                placeholder="Full address will appear here..."
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
                <FaCalendarPlus style={{ marginRight: '0.5rem' }} />
                Add to Calendar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AddToCalendarModal;
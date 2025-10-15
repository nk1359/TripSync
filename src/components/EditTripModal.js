import React, { useState, useEffect } from 'react';
import DateRangePicker from './DateRangePicker';
import { useToast } from './ToastContext';
import axios from 'axios';
import API_URL from '../config';
import './styles/EditTripModal.css';

const EditTripModal = ({ trip, onClose, onSuccess }) => {
  const { showToast } = useToast();
  const [tripName, setTripName] = useState(trip.trip_name || '');
  const [description, setDescription] = useState(trip.description || '');
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingDestinations, setLoadingDestinations] = useState(true);
  
  // Fallback dates for trips without destinations
  const [tripStartDate, setTripStartDate] = useState(trip.start_date || '');
  const [tripEndDate, setTripEndDate] = useState(trip.end_date || '');

  const currentUser = JSON.parse(localStorage.getItem('user')) || {};

  // Fetch destinations when modal opens
  useEffect(() => {
    fetchDestinations();
  }, []);

  const fetchDestinations = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/trips/${trip.trip_id}/destinations`);
      setDestinations(response.data.destinations || []);
    } catch (error) {
      console.error('Error fetching destinations:', error);
    } finally {
      setLoadingDestinations(false);
    }
  };

  const handleDestinationDateChange = (destinationId, field, value) => {
    setDestinations(destinations.map(dest =>
      dest.destination_id === destinationId
        ? { ...dest, [field]: value }
        : dest
    ));
  };

  const handleSubmit = async () => {
    if (!tripName.trim()) {
      showToast('Please enter a trip name', 'info');
      return;
    }

    // Parse dates manually to avoid timezone issues
    const parseDate = (dateStr) => {
      if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
      }
      return new Date(dateStr);
    };

    // Validate destination dates if they exist
    for (const dest of destinations) {
      if (dest.start_date && dest.end_date) {
        const start = parseDate(dest.start_date);
        const end = parseDate(dest.end_date);
        if (end < start) {
          showToast(`End date must be after start date for ${dest.destination}`, 'error');
          return;
        }
      }
    }

    // Validate trip dates if no destinations
    if (destinations.length === 0 && tripStartDate && tripEndDate) {
      const start = parseDate(tripStartDate);
      const end = parseDate(tripEndDate);
      if (end < start) {
        showToast('End date must be after start date', 'error');
        return;
      }
    }

    setLoading(true);

    try {
      // Update trip details
      await axios.put(`${API_URL}/api/trips/${trip.trip_id}`, {
        user_id: currentUser.user_id,
        trip_name: tripName,
        description: description
      });

      // If there are destinations, update them and calculate trip dates
      if (destinations.length > 0) {
        // Update each destination's dates
        const updatePromises = destinations.map(dest =>
          axios.put(`${API_URL}/api/trips/${trip.trip_id}/destinations/${dest.destination_id}`, {
            user_id: currentUser.user_id,
            start_date: dest.start_date,
            end_date: dest.end_date
          })
        );

        await Promise.all(updatePromises);

        // Calculate overall trip dates from destinations
        const allStartDates = destinations.map(d => d.start_date).filter(Boolean);
        const allEndDates = destinations.map(d => d.end_date).filter(Boolean);
        
        if (allStartDates.length > 0 && allEndDates.length > 0) {
          const newStartDate = allStartDates.sort()[0];
          const newEndDate = allEndDates.sort()[allEndDates.length - 1];
          
          // Update trip dates
          await axios.put(`${API_URL}/api/trips/${trip.trip_id}/dates`, {
            user_id: currentUser.user_id,
            start_date: newStartDate,
            end_date: newEndDate
          });
        }
      } else {
        // No destinations - update trip dates directly if provided
        if (tripStartDate && tripEndDate) {
          await axios.put(`${API_URL}/api/trips/${trip.trip_id}/dates`, {
            user_id: currentUser.user_id,
            start_date: tripStartDate,
            end_date: tripEndDate
          });
        }
      }

      showToast('Trip updated successfully!', 'success');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating trip:', error);
      showToast(
        error.response?.data?.error || 'Failed to update trip',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="edit-trip-modal-overlay" onClick={onClose}>
      <div className="edit-trip-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="edit-trip-modal-header">
          <h2>Edit Trip</h2>
          <button className="edit-trip-modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="edit-trip-modal-body">
          {/* Trip Name */}
          <div className="form-section">
            <label>Trip Name *</label>
            <input
              type="text"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              placeholder="e.g., Summer Europe Adventure"
              className="form-input"
            />
          </div>

          {/* Description */}
          <div className="form-section">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us about your trip..."
              className="form-textarea"
              rows="3"
            />
          </div>

          {/* Destinations */}
          {loadingDestinations ? (
            <div className="form-section">
              <label>Loading destinations...</label>
            </div>
          ) : destinations.length > 0 ? (
            <div className="form-section">
              <label>Destinations & Dates</label>
              <div className="destinations-list">
                {destinations.map((dest) => (
                  <div key={dest.destination_id} className="destination-edit-item">
                    <div className="destination-edit-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                      <span className="destination-name">{dest.destination}</span>
                    </div>
                    <DateRangePicker
                      startDate={dest.start_date}
                      endDate={dest.end_date}
                      onStartDateChange={(date) => handleDestinationDateChange(dest.destination_id, 'start_date', date)}
                      onEndDateChange={(date) => handleDestinationDateChange(dest.destination_id, 'end_date', date)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="form-section">
              <label>Trip Dates</label>
              <div className="info-message" style={{ marginBottom: '1rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <p>No destinations set. You can still set the overall trip dates below.</p>
              </div>
              <DateRangePicker
                startDate={tripStartDate}
                endDate={tripEndDate}
                onStartDateChange={setTripStartDate}
                onEndDateChange={setTripEndDate}
              />
            </div>
          )}

          <div className="edit-trip-modal-footer">
            <button onClick={onClose} className="cancel-btn" disabled={loading}>
              Cancel
            </button>
            <button onClick={handleSubmit} className="save-btn" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditTripModal;


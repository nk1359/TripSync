import React from 'react';
import { useTripModal } from './TripModalContext';
import DateRangePicker from './DateRangePicker';
import './styles/Home.css';

const TripModal = () => {
  const {
    showTripModal,
    setShowTripModal,
    tripForm,
    setTripForm,
    tripFriends,
    selectedFriends,
    toggleFriendSelection,
    friendSearchQuery,
    setFriendSearchQuery,
    showAllFriends,
    setShowAllFriends,
    showFriendsBox,
    setShowFriendsBox,
    tripLocations,
    currentLocation,
    setCurrentLocation,
    locationSuggestions,
    showLocationSuggestions,
    setShowLocationSuggestions,
    editingLocationId,
    fetchLocationSuggestions,
    handleLocationSelect,
    handleAddLocation,
    handleEditLocation,
    handleRemoveLocation,
    handleCreateTrip,
    isMobile,
    modalExpanded,
    isDragging,
    dragOffset,
    handleDragStart,
    handleDragMove,
    handleDragEnd
  } = useTripModal();

  if (!showTripModal) return null;

  return (
    <div className={`trip-modal-overlay ${isMobile ? 'mobile' : ''}`} onClick={() => setShowTripModal(false)}>
      <div 
        className={`trip-modal-content ${isMobile ? 'mobile' : ''} ${modalExpanded ? 'expanded' : ''} ${isDragging ? 'dragging' : ''}`} 
        onClick={(e) => e.stopPropagation()}
        style={isMobile && isDragging ? { 
          transform: `translateY(${dragOffset > 0 ? dragOffset : 0}px)`,
          maxHeight: dragOffset < 0 ? `${Math.min(95, 65 + Math.abs(dragOffset) / 10)}vh` : (modalExpanded ? '95vh' : '65vh')
        } : {}}
      >
        {isMobile && (
          <div 
            className="mobile-modal-handle-container"
            onTouchStart={handleDragStart}
            onTouchMove={handleDragMove}
            onTouchEnd={handleDragEnd}
            onMouseDown={handleDragStart}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
          >
            <div className="mobile-modal-handle"></div>
            <h3 className="mobile-modal-title">Create New Trip</h3>
          </div>
        )}
        {!isMobile && (
          <div className="trip-modal-header">
            <h2>Create New Trip</h2>
            <button className="trip-modal-close" onClick={() => setShowTripModal(false)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        )}
        <div className="trip-modal-body">
          {/* Trip Basic Info */}
          <div className="trip-form-section floating-label-container">
            <input
              type="text"
              placeholder=" "
              value={tripForm.tripName}
              onChange={(e) => setTripForm({...tripForm, tripName: e.target.value})}
              className="trip-input floating-input"
              id="trip-name-input"
            />
            <label htmlFor="trip-name-input" className={`floating-label ${tripForm.tripName ? 'active' : ''}`}>
              Trip Name *
            </label>
          </div>

          <div className="trip-form-section floating-label-container">
            <textarea
              placeholder=" "
              value={tripForm.description}
              onChange={(e) => setTripForm({...tripForm, description: e.target.value})}
              className="trip-textarea floating-input"
              rows="3"
              id="trip-description-input"
            />
            <label htmlFor="trip-description-input" className={`floating-label ${tripForm.description ? 'active' : ''}`}>
              Description
            </label>
          </div>

          {/* Invite Friends Section */}
          {tripFriends.length > 0 && (
            <div className="trip-form-section">
              <div className="friends-invitation-box">
                <div 
                  className="friends-box-header"
                  onClick={() => setShowFriendsBox(!showFriendsBox)}
                >
                  <span>Invite Friends (Optional)</span>
                  <svg 
                    className={`chevron-icon ${showFriendsBox ? 'expanded' : ''}`}
                    width="20" 
                    height="20" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>

                <div className={`friends-box-content ${showFriendsBox ? 'expanded' : 'collapsed'}`}>
                  {/* Search Friends */}
                  <div className="friend-search-input-wrapper">
                    <svg className="friend-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search friends"
                      value={friendSearchQuery}
                      onChange={(e) => setFriendSearchQuery(e.target.value)}
                      className="friend-search-input"
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
              </div>
            </div>
          )}

          {/* Destinations & Dates */}
          <div className="trip-form-section">
            <div className="destinations-container">
              {/* Destination Input Box */}
              <div className="destination-input-box">
                  <div className="location-input-wrapper floating-label-container">
                    <input
                      type="text"
                      placeholder=" "
                      value={currentLocation.destination}
                      onChange={(e) => {
                        setCurrentLocation(prev => ({...prev, destination: e.target.value}));
                        if (e.target.value.length >= 2) {
                          fetchLocationSuggestions(e.target.value);
                        }
                      }}
                      onFocus={() => currentLocation.destination?.length >= 2 && setShowLocationSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 200)}
                      className="trip-input destination-search floating-input"
                      id="destination-input"
                    />
                    <label htmlFor="destination-input" className={`floating-label ${currentLocation.destination ? 'active' : ''}`}>
                      Destination *
                    </label>
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
  );
};

export default TripModal;

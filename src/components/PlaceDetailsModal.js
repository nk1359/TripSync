import React, { useState } from 'react';
import { FaTimes, FaMapMarkerAlt, FaClock, FaStar, FaChevronLeft, FaChevronRight, FaTrash, FaEdit } from 'react-icons/fa';
import './styles/PlaceDetailsModal.css';

const PlaceDetailsModal = ({ 
  isOpen, 
  onClose, 
  place, 
  onDelete, 
  onUpdate,
  isEditable = false,
  showDeleteButton = false 
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [noteValue, setNoteValue] = useState(place?.notes || '');
  
  if (!isOpen || !place) return null;

  // Get images array - either from photos or single photo_url
  const images = place.photos || (place.photo_url ? [place.photo_url] : []);
  const hasImages = images.length > 0;

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleNoteUpdate = () => {
    if (onUpdate && place.planner_id) {
      onUpdate(place.planner_id, noteValue);
    }
  };

  const handleDelete = () => {
    if (onDelete && place.planner_id) {
      onDelete(place.planner_id);
      onClose();
    }
  };

  return (
    <div className="place-modal-overlay" onClick={onClose}>
      <div className="place-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="place-modal-header">
          <h2>{place.item_name || place.name}</h2>
          <button className="place-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        {/* Image Carousel */}
        {hasImages && (
          <div className="place-modal-carousel">
            <img 
              src={images[currentImageIndex]} 
              alt={place.item_name || place.name} 
              className="place-modal-image"
            />
            {images.length > 1 && (
              <>
                <button className="carousel-btn prev" onClick={prevImage}>
                  <FaChevronLeft />
                </button>
                <button className="carousel-btn next" onClick={nextImage}>
                  <FaChevronRight />
                </button>
                <div className="carousel-indicators">
                  {images.map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`indicator ${idx === currentImageIndex ? 'active' : ''}`}
                      onClick={() => setCurrentImageIndex(idx)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Details */}
        <div className="place-modal-body">
          {/* Rating */}
          {place.rating && (
            <div className="place-detail-row rating-row">
              <FaStar className="detail-icon star" />
              <span className="rating-text">{place.rating}</span>
            </div>
          )}

          {/* Location/Address */}
          {(place.location || place.address) && (
            <div className="place-detail-row">
              <FaMapMarkerAlt className="detail-icon" />
              <span>{place.address || place.location}</span>
            </div>
          )}

          {/* Time */}
          {(place.start_time || place.end_time) && (
            <div className="place-detail-row">
              <FaClock className="detail-icon" />
              <span>
                {place.start_time && formatTime(place.start_time)}
                {place.start_time && place.end_time && ' - '}
                {place.end_time && formatTime(place.end_time)}
              </span>
            </div>
          )}

          {/* Description */}
          {place.description && (
            <div className="place-detail-section">
              <h3>Description</h3>
              <p>{place.description}</p>
            </div>
          )}

          {/* Cost */}
          {place.cost && (
            <div className="place-detail-section">
              <h3>Cost</h3>
              <p className="cost-text">${place.cost}</p>
            </div>
          )}

          {/* Notes - Editable if isEditable */}
          <div className="place-detail-section">
            <h3>Notes</h3>
            {isEditable ? (
              <div className="note-edit-section">
                <textarea
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                  onBlur={handleNoteUpdate}
                  placeholder="Add a note..."
                  className="note-textarea"
                  rows="3"
                />
              </div>
            ) : (
              <p className="note-text">{place.notes || 'No notes added'}</p>
            )}
          </div>

          {/* Delete Button */}
          {showDeleteButton && (
            <button className="place-delete-btn" onClick={handleDelete}>
              <FaTrash />
              Delete from Planner
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper function
const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

export default PlaceDetailsModal;


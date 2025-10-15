import React, { useState, useRef, useEffect } from 'react';
import './styles/DateRangePicker.css';

const DateRangePicker = ({ startDate, endDate, onStartDateChange, onEndDateChange, label }) => {
  const [showCalendar, setShowCalendar] = useState(false);
  const [editingField, setEditingField] = useState(null); // 'start' or 'end'
  const [currentMonth, setCurrentMonth] = useState(() => {
    // Initialize to start date's month if available, otherwise current month
    if (startDate) {
      const [year, month] = startDate.split('-').map(Number);
      return { year, month: month - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const calendarRef = useRef(null);
  const triggerRef = useRef(null);

  // Close calendar on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target) &&
          triggerRef.current && !triggerRef.current.contains(event.target)) {
        setShowCalendar(false);
        setEditingField(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Open calendar for specific field
  const openCalendar = (field) => {
    setEditingField(field);
    
    // Set calendar month to the date being edited
    if (field === 'start' && startDate) {
      const [year, month] = startDate.split('-').map(Number);
      setCurrentMonth({ year, month: month - 1 });
    } else if (field === 'end' && endDate) {
      const [year, month] = endDate.split('-').map(Number);
      setCurrentMonth({ year, month: month - 1 });
    }
    
    setShowCalendar(true);
    
    // Scroll calendar into view after a short delay to ensure it's rendered
    setTimeout(() => {
      if (calendarRef.current) {
        calendarRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest',
          inline: 'start' 
        });
      }
    }, 100);
  };

  // Format YYYY-MM-DD string for display
  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return 'Select date';
    
    // Parse the date string components
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 'Select date';
    
    const year = parseInt(parts[0], 10);
    const monthIndex = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const day = parseInt(parts[2], 10);
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Validate the parsed values
    if (isNaN(year) || isNaN(monthIndex) || isNaN(day)) return 'Select date';
    if (monthIndex < 0 || monthIndex > 11) return 'Select date';
    
    return `${day} ${monthNames[monthIndex]} ${year}`;
  };

  // Get days in a month
  const getDaysInMonth = (year, month) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    
    // Add empty cells for days before month starts (Sunday = 0, we want Monday = 0)
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < offset; i++) {
      days.push(null);
    }
    
    // Add actual days
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({ year, month, day });
    }
    
    return days;
  };

  // Handle date selection
  const handleDateClick = (dateObj) => {
    if (!dateObj) return;
    
    const { year, month, day } = dateObj;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    if (editingField === 'start') {
      onStartDateChange(dateStr);
      // If end date exists and new start is after end, clear end date
      if (endDate && dateStr > endDate) {
        onEndDateChange(null);
      }
      // Switch to editing end date instead of closing
      setEditingField('end');
    } else if (editingField === 'end') {
      // If start date exists and new end is before start, adjust start
      if (startDate && dateStr < startDate) {
        onStartDateChange(dateStr);
        onEndDateChange(startDate);
      } else {
        onEndDateChange(dateStr);
      }
      // Close calendar after end date is selected
      setShowCalendar(false);
      setEditingField(null);
    } else {
      // No field specified, start fresh selection
      onStartDateChange(dateStr);
      onEndDateChange(null);
      setEditingField('end');
    }
  };

  // Check if date is in range
  const isInRange = (dateObj) => {
    if (!dateObj || !startDate || !endDate) return false;
    
    const { year, month, day } = dateObj;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    return dateStr >= startDate && dateStr <= endDate;
  };

  // Check if date is selected (start or end)
  const isSelected = (dateObj) => {
    if (!dateObj) return false;
    
    const { year, month, day } = dateObj;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    return dateStr === startDate || dateStr === endDate;
  };

  // Check if date is range start
  const isRangeStart = (dateObj) => {
    if (!dateObj || !startDate) return false;
    
    const { year, month, day } = dateObj;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    return dateStr === startDate;
  };

  // Check if date is range end
  const isRangeEnd = (dateObj) => {
    if (!dateObj || !endDate) return false;
    
    const { year, month, day } = dateObj;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    return dateStr === endDate;
  };

  // Navigate months
  const previousMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { ...prev, month: prev.month - 1 };
    });
  };

  const nextMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { ...prev, month: prev.month + 1 };
    });
  };

  // Get month name
  const getMonthName = (year, month) => {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[month]} ${year}`;
  };

  // Render a single month
  const renderMonth = (monthOffset = 0) => {
    let year = currentMonth.year;
    let month = currentMonth.month + monthOffset;
    
    // Handle year overflow
    if (month > 11) {
      year += Math.floor(month / 12);
      month = month % 12;
    } else if (month < 0) {
      year += Math.floor(month / 12);
      month = ((month % 12) + 12) % 12;
    }
    
    const days = getDaysInMonth(year, month);

    return (
      <div className="calendar-month-view">
        <div className="calendar-day-headers">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day, i) => (
            <div key={i} className="calendar-day-header">{day}</div>
          ))}
        </div>
        <div className="calendar-days-grid">
          {days.map((dateObj, index) => {
            if (!dateObj) {
              return <div key={index} className="calendar-day-cell empty"></div>;
            }
            
            return (
              <div
                key={index}
                className={`calendar-day-cell ${
                  isSelected(dateObj) ? 'selected' : ''
                } ${isInRange(dateObj) ? 'in-range' : ''} ${
                  isRangeStart(dateObj) ? 'range-start' : ''
                } ${isRangeEnd(dateObj) ? 'range-end' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDateClick(dateObj);
                }}
              >
                {dateObj.day}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="date-range-picker">
      {label && <label className="date-picker-label">{label}</label>}
      
      <div className="date-inputs-row" ref={triggerRef}>
        <div className="date-input-group">
          <label>Start date</label>
          <div 
            className={`date-display-input ${editingField === 'start' ? 'editing' : ''}`}
            onClick={() => openCalendar('start')}
          >
            {formatDisplayDate(startDate)}
          </div>
        </div>

        <div className="date-input-group">
          <label>End date</label>
          <div 
            className={`date-display-input ${editingField === 'end' ? 'editing' : ''}`}
            onClick={() => openCalendar('end')}
          >
            {formatDisplayDate(endDate)}
          </div>
        </div>
      </div>

      {showCalendar && (
        <div 
          ref={calendarRef}
          className="calendar-dropdown"
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="calendar-close-btn"
            onClick={(e) => { 
              e.stopPropagation(); 
              setShowCalendar(false); 
              setEditingField(null);
            }}
            aria-label="Close calendar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          
          {/* Show which field is being edited */}
          <div className="calendar-editing-hint">
            {editingField === 'start' ? 'Select start date' : editingField === 'end' ? 'Select end date' : 'Select dates'}
          </div>
          
          <div className="calendar-months-container">
            {/* First Month */}
            <div className="calendar-month-section">
              <div className="calendar-nav">
                <button onClick={(e) => { e.stopPropagation(); previousMonth(); }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <div className="calendar-month-header">{getMonthName(currentMonth.year, currentMonth.month)}</div>
                <button onClick={(e) => { e.stopPropagation(); nextMonth(); }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
              {renderMonth(0)}
            </div>
            
            {/* Second Month */}
            <div className="calendar-month-section">
              <div className="calendar-nav">
                <button onClick={(e) => { e.stopPropagation(); previousMonth(); }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <div className="calendar-month-header">
                  {getMonthName(
                    currentMonth.month === 11 ? currentMonth.year + 1 : currentMonth.year,
                    (currentMonth.month + 1) % 12
                  )}
                </div>
                <button onClick={(e) => { e.stopPropagation(); nextMonth(); }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
              {renderMonth(1)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;

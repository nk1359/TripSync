import React, { useState, useRef, useEffect } from 'react';
import './styles/DateRangePicker.css';

const DateRangePicker = ({ startDate, endDate, onStartDateChange, onEndDateChange, label }) => {
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const calendarRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return 'Select date';
    const date = new Date(dateStr);
    const formatted = date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    console.log('Formatting date:', dateStr, '->', formatted);
    return formatted;
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    
    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, date: null });
    }
    
    // Days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ 
        day: i, 
        date: new Date(year, month, i)
      });
    }
    
    return days;
  };

  const handleDateClick = (date) => {
    if (!date) return;
    
    const dateStr = date.toISOString().split('T')[0];
    console.log('Date clicked:', dateStr, 'Current startDate:', startDate, 'Current endDate:', endDate);
    
    if (!startDate || (startDate && endDate)) {
      // Start new selection
      console.log('Starting new selection with:', dateStr);
      onStartDateChange(dateStr);
      onEndDateChange('');
      console.log('After setting start date - startDate should be:', dateStr);
    } else if (startDate && !endDate) {
      // Complete the range
      const start = new Date(startDate);
      if (date < start) {
        console.log('Date is before start, swapping:', dateStr, startDate);
        onStartDateChange(dateStr);
        onEndDateChange(startDate);
      } else {
        console.log('Setting end date:', dateStr);
        onEndDateChange(dateStr);
      }
    }
    
    // Don't close calendar - let user close it manually
  };

  const isInRange = (date) => {
    if (!date || !startDate) return false;
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    
    if (end) {
      return date >= start && date <= end;
    }
    return false;
  };

  const isSelected = (date) => {
    if (!date) return false;
    const dateStr = date.toISOString().split('T')[0];
    return dateStr === startDate || dateStr === endDate;
  };

  const isRangeStart = (date) => {
    if (!date || !startDate) return false;
    const dateStr = date.toISOString().split('T')[0];
    return dateStr === startDate;
  };

  const isRangeEnd = (date) => {
    if (!date || !endDate) return false;
    const dateStr = date.toISOString().split('T')[0];
    return dateStr === endDate;
  };

  const renderMonth = (monthOffset = 0) => {
    const displayMonth = new Date(currentMonth);
    displayMonth.setMonth(displayMonth.getMonth() + monthOffset);
    
    const days = getDaysInMonth(displayMonth);

    return (
      <div className="calendar-month-view">
        <div className="calendar-day-headers">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day, i) => (
            <div key={i} className="calendar-day-header">{day}</div>
          ))}
        </div>
        <div className="calendar-days-grid">
          {days.map((dayObj, index) => (
            <div
              key={index}
              className={`calendar-day-cell ${!dayObj.day ? 'empty' : ''} ${
                isSelected(dayObj.date) ? 'selected' : ''
              } ${isInRange(dayObj.date) ? 'in-range' : ''} ${
                isRangeStart(dayObj.date) ? 'range-start' : ''
              } ${isRangeEnd(dayObj.date) ? 'range-end' : ''}`}
              onClick={() => {
                console.log('Day cell clicked:', dayObj.day, dayObj.date);
                handleDateClick(dayObj.date);
              }}
            >
              {dayObj.day}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getMonthName = (monthOffset = 0) => {
    const displayMonth = new Date(currentMonth);
    displayMonth.setMonth(displayMonth.getMonth() + monthOffset);
    return displayMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="date-range-picker" ref={calendarRef}>
      {label && <label className="date-picker-label">{label}</label>}
      
      <div className="date-inputs-row">
        <div className="date-input-group">
          <label>Start date</label>
          <div 
            className="date-display-input"
            onClick={() => {
              console.log('Start date input clicked, current showCalendar:', showCalendar);
              setShowCalendar(!showCalendar);
            }}
          >
            {formatDisplayDate(startDate)}
          </div>
        </div>

        <div className="date-input-group">
          <label>End date</label>
          <div 
            className="date-display-input"
            onClick={() => {
              console.log('End date input clicked, current showCalendar:', showCalendar);
              setShowCalendar(!showCalendar);
            }}
          >
            {formatDisplayDate(endDate)}
          </div>
        </div>
      </div>

      {showCalendar && (
        <div className="calendar-dropdown">
          {console.log('Calendar dropdown is rendering')}
          <button 
            className="calendar-close-btn"
            onClick={() => setShowCalendar(false)}
            aria-label="Close calendar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <div className="calendar-months-container">
            <div className="calendar-month-section">
              <div className="calendar-nav">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <div className="calendar-month-header">{getMonthName(0)}</div>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
              {renderMonth(0)}
            </div>
            
            <div className="calendar-month-section">
              <div className="calendar-nav">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <div className="calendar-month-header">{getMonthName(1)}</div>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}>
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


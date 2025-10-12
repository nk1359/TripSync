import React, { useEffect } from 'react';
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes } from 'react-icons/fa';
import './styles/Toast.css';

const Toast = ({ message, type = 'info', onClose, duration }) => {
  // Default durations: success is quick (2s), error lasts longer (3.5s)
  const defaultDuration = type === 'success' ? 2000 : type === 'error' ? 3500 : 3000;
  const toastDuration = duration || defaultDuration;

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, toastDuration);

    return () => clearTimeout(timer);
  }, [toastDuration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <FaCheckCircle className="toast-icon" />;
      case 'error':
        return <FaExclamationCircle className="toast-icon" />;
      default:
        return <FaInfoCircle className="toast-icon" />;
    }
  };

  return (
    <div className={`toast toast-${type}`}>
      {getIcon()}
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={onClose}>
        <FaTimes />
      </button>
    </div>
  );
};

export default Toast;


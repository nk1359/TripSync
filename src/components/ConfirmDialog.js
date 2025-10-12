import React from 'react';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import './styles/ConfirmDialog.css';

const ConfirmDialog = ({ 
  title = 'Confirm Action', 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  onConfirm, 
  onCancel,
  type = 'warning' // 'warning', 'danger', 'info'
}) => {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="confirm-close" onClick={onCancel}>
          <FaTimes />
        </button>
        
        <div className={`confirm-icon-wrapper confirm-icon-${type}`}>
          <FaExclamationTriangle className="confirm-icon" />
        </div>
        
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        
        <div className="confirm-actions">
          <button 
            className="confirm-btn confirm-btn-cancel" 
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button 
            className={`confirm-btn confirm-btn-${type}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;


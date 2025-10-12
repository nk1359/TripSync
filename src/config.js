// API Configuration
// When deployed on Railway, use empty string (relative paths) since Flask serves both frontend and API
// For local development, use localhost:5000
const API_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

export default API_URL;


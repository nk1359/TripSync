import React, { useState, useContext } from 'react';
import { AuthContext } from './AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './styles/Login.css';
import API_URL from '../config';

function Login() {
  const [activeTab, setActiveTab] = useState('login');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  // Login form state
  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
  });

  // Register form state
  const [registerData, setRegisterData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    if (!loginData.username || !loginData.password) {
      setError('Username and password are required');
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      
      const data = await response.json();
      
      if (response.ok && data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
        navigate('/home');
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('An error occurred. Please try again.');
    }
    
    setLoading(false);
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (registerData.password !== registerData.confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    const payload = {
      first_name: registerData.first_name,
      last_name: registerData.last_name,
      username: registerData.username,
      email: registerData.email,
      password: registerData.password,
    };

    try {
      const res = await axios.post(`${API_URL}/api/register`, payload);
      if (res.status === 201) {
        setSuccess("Account created successfully! You can now log in.");
        setError("");
        // Switch to login tab
        setTimeout(() => {
          setActiveTab('login');
          setSuccess('');
        }, 2000);
      }
    } catch (err) {
      setError("Registration failed. Please try again.");
      setSuccess("");
      console.error(err);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <img src="/trip sync - login.png" alt="TripSync" className="auth-logo-image" />
        </div>
        
        <div className="auth-tabs">
          <div className="tab-buttons">
            <button
              className={`tab-button ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => { setActiveTab('login'); setError(''); setSuccess(''); }}
            >
              Log in
            </button>
            <button
              className={`tab-button ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => { setActiveTab('register'); setError(''); setSuccess(''); }}
            >
              Create Account
            </button>
            <div className={`tab-slider ${activeTab === 'register' ? 'right' : 'left'}`}></div>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {activeTab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="auth-form">
            <input
              type="text"
              value={loginData.username}
              onChange={(e) => setLoginData({...loginData, username: e.target.value})}
              placeholder="Username"
              required
            />
            
            <input
              type="password"
              value={loginData.password}
              onChange={(e) => setLoginData({...loginData, password: e.target.value})}
              placeholder="Password"
              required
            />
            
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="auth-form">
            <input 
              type="text" 
              placeholder="First Name" 
              value={registerData.first_name}
              onChange={(e) => setRegisterData({...registerData, first_name: e.target.value})}
              required 
            />
            <input 
              type="text" 
              placeholder="Last Name" 
              value={registerData.last_name}
              onChange={(e) => setRegisterData({...registerData, last_name: e.target.value})}
              required 
            />
            <input 
              type="text" 
              placeholder="Username" 
              value={registerData.username}
              onChange={(e) => setRegisterData({...registerData, username: e.target.value})}
              required 
            />
            <input 
              type="email" 
              placeholder="Email" 
              value={registerData.email}
              onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
              required 
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={registerData.password}
              onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
              required 
            />
            <input 
              type="password" 
              placeholder="Confirm Password" 
              value={registerData.confirmPassword}
              onChange={(e) => setRegisterData({...registerData, confirmPassword: e.target.value})}
              required 
            />
            <button className="btn" type="submit">Create Account</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Login;
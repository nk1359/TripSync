import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './styles/Login.css';

const Login = () => {
  const navigate = useNavigate();
  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setLoginData({ ...loginData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Replace the URL with your backend login endpoint
      const res = await axios.post('http://localhost:5000/api/login', loginData);
      if (res.data.success) {
        // Redirect to the homepage on successful login
        navigate('/home');
      } else {
        setError('Invalid credentials. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setError('Login failed. Please try again.');
    }
  };

  const handleRegister = () => {
    navigate('/register');
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>Login</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <input 
            type="text" 
            name="username" 
            placeholder="Username" 
            value={loginData.username} 
            onChange={handleChange} 
            required 
          />
          <input 
            type="password" 
            name="password" 
            placeholder="Password" 
            value={loginData.password} 
            onChange={handleChange} 
            required 
          />
          <button className="btn" type="submit">Log In</button>
          <button 
            className="btn alt-btn" 
            type="button" 
            onClick={handleRegister}
          >
            Create a new account
          </button>
        </form>
        <a href="#" className="link">Forgot Password?</a>
      </div>
    </div>
  );
};

export default Login;

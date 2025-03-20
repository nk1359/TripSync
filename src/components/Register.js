import React, { useState } from 'react';
import axios from 'axios';
import './styles/Register.css';

const Register = () => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    // Prepare payload matching your SQL table columns
    const payload = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      username: formData.username,
      email: formData.email,
      password: formData.password, // Remember to hash your password in production!
    };

    try {
      // Replace the URL with your backend endpoint
      const res = await axios.post('http://localhost:5000/api/register', payload);
      if (res.status === 201) {
        setSuccess("Account created successfully!");
        setError("");
        // Optionally reset the form
        setFormData({
          first_name: '',
          last_name: '',
          username: '',
          email: '',
          password: '',
          confirmPassword: ''
        });
      }
    } catch (err) {
      setError("Registration failed. Please try again.");
      setSuccess("");
      console.error(err);
    }
  };

  return (
    <div className="register-page">
      <div className="register-container">
        <h2>Register</h2>
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}
        <form onSubmit={handleSubmit}>
          <input 
            type="text" 
            name="first_name" 
            placeholder="First Name" 
            value={formData.first_name}
            onChange={handleChange}
            required 
          />
          <input 
            type="text" 
            name="last_name" 
            placeholder="Last Name" 
            value={formData.last_name}
            onChange={handleChange}
            required 
          />
          <input 
            type="text" 
            name="username" 
            placeholder="Username" 
            value={formData.username}
            onChange={handleChange}
            required 
          />
          <input 
            type="email" 
            name="email" 
            placeholder="Email" 
            value={formData.email}
            onChange={handleChange}
            required 
          />
          <input 
            type="password" 
            name="password" 
            placeholder="Password" 
            value={formData.password}
            onChange={handleChange}
            required 
          />
          <input 
            type="password" 
            name="confirmPassword" 
            placeholder="Confirm Password" 
            value={formData.confirmPassword}
            onChange={handleChange}
            required 
          />
          <button className="btn" type="submit">Create Account</button>
        </form>
        <a href="/" className="link">Already have an account? Log in</a>
      </div>
    </div>
  );
};

export default Register;

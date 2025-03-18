import React from 'react';
import './styles/Register.css';

const Register = () => {
  return (
    <div className="register-page">
      <div className="register-container">
        <h2>Register</h2>
        <form>
          <input type="text" placeholder="First Name" required />
          <input type="text" placeholder="Last Name" required />
          <input type="date" required />
          <input type="text" placeholder="Username" required />
          <input type="email" placeholder="Email" required />
          <input type="password" placeholder="Password" required />
          <input type="password" placeholder="Confirm Password" required />
          <button className="btn" type="submit">Create Account</button>
        </form>
        <a href="/" className="link">Already have an account? Log in</a>
      </div>
    </div>
  );
};

export default Register;

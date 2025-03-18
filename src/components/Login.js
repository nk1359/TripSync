import React from 'react';
import { useNavigate } from 'react-router-dom';
import './styles/Login.css';

const Login = () => {
  const navigate = useNavigate();

  const handleRegister = () => {
    navigate('/register');
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>Login</h2>
        <form>
          <input type="text" placeholder="Username" required />
          <input type="password" placeholder="Password" required />
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

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from './components/AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import Home from './components/Home';
import Chats from './components/Chats';
import ChatRoom from './components/ChatRoom'; 
import Calendar from './components/Calendar';

function App() {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading TripSync...</p>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={user ? <Home /> : <Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/chats" element={user ? <Chats /> : <Navigate to="/" replace />} />
        <Route path="/chats/:groupId" element={user ? <ChatRoom /> : <Navigate to="/" replace />} />
        <Route path="/calendar" element={user ? <Calendar /> : <Navigate to="/" replace />} />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
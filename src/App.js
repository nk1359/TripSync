import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from './components/AuthContext';
import { ToastProvider } from './components/ToastContext';
import FloatingChat from './components/FloatingChat';
import Login from './components/Login';
import Home from './components/Home';
import Search from './components/Search';
import Chats from './components/Chats';
import ChatRoom from './components/ChatRoom'; 
import Planner from './components/Planner';
import Friends from './components/Friends';

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
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/login" element={<Login />} />
          <Route path="/chats" element={user ? <Chats /> : <Navigate to="/" replace />} />
          <Route path="/chats/:groupId" element={user ? <ChatRoom /> : <Navigate to="/" replace />} />
          <Route path="/planner" element={user ? <Planner /> : <Navigate to="/" replace />} />
          <Route path="/friends" element={user ? <Friends /> : <Navigate to="/" replace />} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        
        {/* FloatingChat persists across all pages */}
        {user && <FloatingChat />}
      </Router>
    </ToastProvider>
  );
}

export default App;
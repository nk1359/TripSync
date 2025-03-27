import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FaArrowLeft, FaPaperPlane } from 'react-icons/fa';
import './styles/ChatRoom.css';

const ChatRoom = ({ groupId, groupName, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const currentUser = JSON.parse(localStorage.getItem('user')).username;
  const messagesEndRef = useRef(null);

  useEffect(() => {
    axios
      .get(`http://localhost:5000/api/group_messages/${groupId}`)
      .then((res) => setMessages(res.data))
      .catch((err) => console.error(err));
  }, [groupId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!message.trim()) return;

    axios
      .post('http://localhost:5000/api/send_message', {
        group_id: groupId,
        sender: currentUser,
        message,
      })
      .then(() => {
        setMessages([...messages, { sender: currentUser, message }]);
        setMessage('');
      })
      .catch((err) => console.error(err));
  };

  return (
    <div className="chat-room">
      <div className="chat-header">
        <button className="back-button" onClick={onBack}>
          <FaArrowLeft />
        </button>
        <h2>{groupName}</h2>
      </div>

      <div className="messages-container">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message ${
              msg.sender === currentUser ? 'sent' : 'received'
            }`}
          >
            <div className="message-content">
              <strong className="sender-name">{msg.sender}</strong>
              <p>{msg.message}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
        <input
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="message-input"
        />
        <button onClick={sendMessage} className="send-button">
          <FaPaperPlane />
        </button>
      </div>
    </div>
  );
};

export default ChatRoom;

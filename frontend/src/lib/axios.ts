import axios from 'axios';

// Create a configured axios instance
export const api = axios.create({
  baseURL: 'http://localhost:5000/api', // Your Flask backend URL
  headers: {
    'Content-Type': 'application/json',
  },
});

// Optional: Add an interceptor if you want to automatically attach JWT tokens later
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
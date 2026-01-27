import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Polyfill for WebRTC libraries (Fixes White Screen)
import { Buffer } from 'buffer';
window.global = window;
if (typeof window.process === 'undefined') {
  window.process = { env: {} };
}
window.Buffer = Buffer;

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

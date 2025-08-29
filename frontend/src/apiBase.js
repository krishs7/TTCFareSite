// frontend/src/apiBase.js
const isDev = import.meta.env.DEV;

// When built locally (vite preview), you’re on localhost:4173
const isPreviewLocalhost =
  !isDev && typeof window !== 'undefined' && window.location.hostname === 'localhost';

// In production (Vercel), set VITE_API_BASE to your backend URL
const prodBase = import.meta.env.VITE_API_BASE || '';

export const API_BASE = isDev
  ? '' // proxy to backend in vite dev
  : isPreviewLocalhost
    ? 'http://localhost:4000'
    : prodBase; // e.g. https://ttcfaresite-backend.onrender.com


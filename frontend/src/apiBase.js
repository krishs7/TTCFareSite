// frontend/src/apiBase.js
// Prefer explicit base in ALL modes (dev, preview, prod)
const explicit = (import.meta.env.VITE_API_BASE || '').trim();

const isDev = import.meta.env.DEV;

// When built locally (`vite preview`) and opened on localhost
const isPreviewLocalhost =
  !isDev && typeof window !== 'undefined' && window.location.hostname === 'localhost';

export const API_BASE =
  explicit || (isDev ? '' : isPreviewLocalhost ? 'http://localhost:4000' : '');

// (Optional) quick sanity log — remove after you confirm
if (typeof window !== 'undefined') {
  console.log('[API_BASE]', API_BASE || '(relative to frontend origin)');
}


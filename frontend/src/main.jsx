import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AppShell from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

// ---- PWA registration (explicit) ----
if ('serviceWorker' in navigator) {
  // Use dynamic import so dev builds don't choke
  window.addEventListener('load', async () => {
    try {
      const { registerSW } = await import('virtual:pwa-register');
      // immediate: true => register right away
      registerSW({
        immediate: true,
        onRegistered(swReg) {
          // optional: console.log('[PWA] SW registered', swReg);
        },
        onRegisterError(err) {
          console.error('[PWA] SW register error', err);
        }
      });
    } catch (e) {
      console.error('[PWA] SW import error', e);
    }
  });
}
// -------------------------------------

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  </React.StrictMode>
);


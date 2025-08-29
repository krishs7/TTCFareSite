import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AppShell from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  </React.StrictMode>
);


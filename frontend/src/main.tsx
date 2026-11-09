import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { validateApiConfig } from './api/config';

// Validate API configuration on application initialization
const validation = validateApiConfig();
if (!validation.valid) {
  console.error('[MedVerify Startup] Invalid API configuration:', validation.errors);
} else if (validation.warnings.length > 0) {
  console.warn('[MedVerify Startup] API configuration notice:', validation.warnings);
} else {
  console.log(`[MedVerify Startup] Initialized in ${validation.mode} mode (API base: ${validation.baseUrl || 'Vite proxy relative'})`);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/density.css';
import './styles/presentation.css';
import './i18n';
import { initObservability } from './observability';
import App from './App';

// Phase F0.11 — init Sentry + PostHog before React renders.
initObservability();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

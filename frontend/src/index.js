import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/density.css';
import './styles/presentation.css';
import './i18n';
import { initPostHog } from './lib/posthog';
import { initObservability } from './observability';
import App from './App';

// W4.18.2A.0 — PostHog (LFPDPPP-compliant) FIRST so observability.js detects __loaded and skips re-init.
initPostHog();
// Phase F0.11 — Sentry (+ legacy PostHog no-op when __loaded).
initObservability();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Phase F0.11 — Frontend observability (Sentry + PostHog)
// Init once at app bootstrap. No-op if env keys empty.
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';

let _sentryInited = false;
let _posthogInited = false;

export function initObservability() {
  // Sentry
  const dsn = process.env.REACT_APP_SENTRY_DSN || '';
  if (dsn && !_sentryInited) {
    try {
      Sentry.init({
        dsn,
        environment: process.env.REACT_APP_DMX_ENV || 'preview',
        release: process.env.REACT_APP_DMX_RELEASE || 'dmx-frontend@dev',
        integrations: [
          Sentry.browserTracingIntegration(),
          // LFPDPPP: enmascarar texto/media en replays (no capturar PII en pantalla)
          Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
        ],
        tracesSampleRate: 0.1,
        // 0 = no grabar sesiones al azar (consumían 80% del presupuesto);
        // solo se graban las sesiones que sí tuvieron un error (las útiles).
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        sendDefaultPii: false,
      });
      _sentryInited = true;
    } catch (e) { /* no-op */ }
  }

  // PostHog
  const phKey = process.env.REACT_APP_POSTHOG_KEY || '';
  const phHost = process.env.REACT_APP_POSTHOG_HOST || 'https://us.i.posthog.com';
  // W4.18.2A.0 — skip si lib/posthog.js ya inicializó (LFPDPPP-compliant init lleva precedencia)
  if (phKey && !_posthogInited && !posthog.__loaded) {
    try {
      posthog.init(phKey, {
        api_host: phHost,
        autocapture: true,
        capture_pageview: true,
        capture_pageleave: true,
        persistence: 'localStorage+cookie',
        person_profiles: 'identified_only',
      });
      _posthogInited = true;
    } catch (e) { /* no-op */ }
  }
}

export function identifyUser(user) {
  if (!user) return;
  if (_sentryInited) {
    try {
      Sentry.setUser({ id: user.user_id, email: user.email });
      Sentry.setTag('role', user.role);
      Sentry.setTag('tenant_id', user.tenant_id);
      Sentry.setTag('org_id', user.tenant_id);
    } catch {}
  }
  if (_posthogInited) {
    // W4.18.2A.0 — LFPDPPP: identify SOLO con hash + traits safe (sin email/name/phone)
    try {
      // El hash + identify se manejan en lib/posthog.js identifyUser(); aquí solo notamos que sigue habilitado.
    } catch {}
  }
}

export function resetUser() {
  if (_sentryInited) { try { Sentry.setUser(null); } catch {} }
  if (_posthogInited) { try { posthog.reset(); } catch {} }
}

export function captureEvent(event, properties = {}) {
  if (_posthogInited) {
    try { posthog.capture(event, properties); } catch {}
  }
}

// Unified ML event emitter — mirrors backend observability.emit_ml_event.
// Fires PostHog + POST /api/ml/emit (which persists Mongo + mirrors PostHog again server-side).
export async function emitMlEvent({ event_type, context = {}, ai_decision = {}, user_action = {} }) {
  if (_posthogInited) {
    try {
      posthog.capture(`dmx_ml_${event_type}`, { context, ai_decision, user_action, side: 'client' });
    } catch {}
  }
  try {
    const API = process.env.REACT_APP_BACKEND_URL;
    await fetch(`${API}/api/ml/emit`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type, context, ai_decision, user_action }),
    });
  } catch { /* silent */ }
}

export { Sentry, posthog };

/**
 * W4.18.2A.0 — PostHog client wrapper (LFPDPPP compliant)
 *
 * Reglas LFPDPPP:
 *   - persistence: 'memory'  (sin localStorage · sin cookies tracking)
 *   - mask all sensitive inputs (password/email/tel) en session_recording
 *   - identify SOLO con user_id_hash (SHA256 + salt + truncate 16) — NO PII raw
 *   - honor opt-out: si localStorage `lfpdppp_consent` !== 'granted' → opt_out + stopSessionRecording
 *   - no-op silencioso si REACT_APP_POSTHOG_API_KEY ausente
 *
 * Backwards-compat: lee REACT_APP_POSTHOG_API_KEY (preferido) y REACT_APP_POSTHOG_KEY (legacy F0.11).
 */
import posthog from 'posthog-js';

const PII_KEYS = new Set([
  'email', 'phone', 'tel', 'name', 'first_name', 'last_name',
  'rfc', 'curp', 'address', 'street', 'street_address',
  'password', 'whatsapp', 'cellphone',
]);

// P1.12 · el hash de identidad (analytics_id) lo calcula el BACKEND con su salt.
// El navegador ya NO carga ningún salt ni hashea PII.

let _inited = false;

function consentGranted() {
  try {
    return typeof window !== 'undefined'
      && window.localStorage
      && window.localStorage.getItem('lfpdppp_consent') === 'granted';
  } catch {
    return false;
  }
}

function stripPII(props = {}) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (PII_KEYS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function initPostHog() {
  if (_inited) return;
  const apiKey = process.env.REACT_APP_POSTHOG_API_KEY || process.env.REACT_APP_POSTHOG_KEY || '';
  const apiHost = process.env.REACT_APP_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    if (typeof console !== 'undefined') console.debug('[posthog] disabled (no api key)');
    return;
  }

  // Si observability.js (legacy F0.11) ya inicializó posthog, no re-inicializamos.
  if (posthog && posthog.__loaded) {
    _inited = true;
    return;
  }

  try {
    posthog.init(apiKey, {
      api_host: apiHost,
      persistence: 'memory',
      capture_pageview: false,
      autocapture: {
        dom_event_allowlist: ['click', 'submit', 'change'],
        css_selector_allowlist: ['[data-ph-capture]', 'a', 'button'],
      },
      session_recording: {
        maskAllInputs: true,
        maskInputOptions: { password: true, email: true, tel: true },
        maskTextSelector: '.ph-mask, [data-ph-mask]',
      },
      disable_session_recording: !consentGranted(),
      loaded: (ph) => {
        try {
          if (!consentGranted()) {
            ph.opt_out_capturing();
            if (typeof ph.stopSessionRecording === 'function') ph.stopSessionRecording();
          }
        } catch { /* silent */ }
      },
    });
    _inited = true;
  } catch (e) {
    if (typeof console !== 'undefined') console.debug('[posthog] init failed', e);
  }
}

export function identifyUser(userId, traits = {}) {
  if (!_inited) return;
  // P1.12 · usamos el hash del backend (analytics_id). Nunca enviamos el user_id crudo ni PII.
  const id = traits.analytics_id || null;
  if (!id) return;
  try {
    posthog.identify(id, stripPII({
      role: traits.role,
      tier: traits.tier,
      tenant_slug: traits.tenant_slug,
    }));
  } catch { /* silent */ }
}

export function capturePageview(path) {
  if (!_inited) return;
  try {
    posthog.capture('$pageview', { $current_url: path });
  } catch { /* silent */ }
}

export function captureEvent(name, props = {}) {
  if (!_inited || !name) return;
  try {
    posthog.capture(name, stripPII(props));
  } catch { /* silent */ }
}

export function optIn() {
  if (!_inited) return;
  try {
    posthog.opt_in_capturing();
    if (typeof posthog.startSessionRecording === 'function') posthog.startSessionRecording();
  } catch { /* silent */ }
}

export function optOut() {
  if (!_inited) return;
  try {
    posthog.opt_out_capturing();
    if (typeof posthog.stopSessionRecording === 'function') posthog.stopSessionRecording();
  } catch { /* silent */ }
}

export function resetSession() {
  if (!_inited) return;
  try { posthog.reset(); } catch { /* silent */ }
}

export { posthog };

/**
 * Phase 4 Batch 13 — Tracking infrastructure
 * Captures ?ref=asesor_id from URL, persists 30d cookie, builds attribution snapshots.
 */
const COOKIE_NAME = 'dmx_ref';
const COOKIE_DAYS = 30;
const TOUCHPOINTS_KEY = 'dmx_touchpoints';

function setCookie(name, value, days) {
  const exp = new Date(Date.now() + days * 86400 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function clearCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

function loadTouchpoints() {
  try {
    const raw = localStorage.getItem(TOUCHPOINTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTouchpoints(list) {
  try { localStorage.setItem(TOUCHPOINTS_KEY, JSON.stringify(list.slice(-15))); } catch {}
}

/**
 * Capture ?ref=X from current URL. Returns asesor_id if present.
 * Adds touchpoint to local stack.
 */
export function captureRefCookie() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref) return null;
    setCookie(COOKIE_NAME, ref, COOKIE_DAYS);

    const tp = {
      asesor_id: ref,
      source: 'asesor_link',
      url_original: window.location.href,
      referrer_url: document.referrer || null,
      user_agent: navigator.userAgent,
      cookie_value: ref,
      timestamp: new Date().toISOString(),
    };
    const list = loadTouchpoints();
    list.push(tp);
    saveTouchpoints(list);

    // Fire view tracking event
    const projectMatch = window.location.pathname.match(/\/(?:desarrollo|proyecto)\/([^/?#]+)/);
    if (projectMatch) {
      const API = process.env.REACT_APP_BACKEND_URL;
      fetch(`${API}/api/tracking/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asesor_id: ref,
          project_id: projectMatch[1],
          url: window.location.href,
          referrer: document.referrer,
          user_agent: navigator.userAgent,
        }),
        credentials: 'include',
      }).catch(() => {});
    }
    return ref;
  } catch (e) { console.warn('[tracking] capture failed', e); return null; }
}

/**
 * Returns current attribution snapshot for embedding in lead form submissions.
 */
export function getCurrentAttribution() {
  if (typeof window === 'undefined') return null;
  return {
    touchpoints: loadTouchpoints(),
    current_url: window.location.href,
    referrer: document.referrer || null,
    cookie_ref: getCookie(COOKIE_NAME),
  };
}

/**
 * Clear attribution data (e.g. after conversion).
 */
export function clearAttribution() {
  clearCookie(COOKIE_NAME);
  try { localStorage.removeItem(TOUCHPOINTS_KEY); } catch {}
}

/**
 * Append a touchpoint manually (e.g. from caya_bot or feria scan).
 */
export function appendTouchpoint(tp) {
  const list = loadTouchpoints();
  list.push({ ...tp, timestamp: tp.timestamp || new Date().toISOString() });
  saveTouchpoints(list);
}

/**
 * W4.3 — D.1 · Behavioral Tracker
 * Helper track(event_type, opts) + hook usePageViewTracking().
 * fetch con keepalive:true · silent fail (nunca rompe UX).
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

// session_id generado una vez por tab/session (sessionStorage)
function getSessionId() {
  try {
    let sid = sessionStorage.getItem('dmx_session_id');
    if (!sid) {
      sid = 'ses_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('dmx_session_id', sid);
    }
    return sid;
  } catch {
    return 'ses_fallback_' + Math.random().toString(36).slice(2);
  }
}

/**
 * Dispara un evento behavioral hacia POST /api/track.
 * @param {string} event_type - page_view | feature_use | click | submit | scroll_depth
 * @param {object} opts - { feature, metadata }
 */
export async function track(event_type, opts = {}) {
  try {
    await fetch(`${API}/api/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({
        session_id: getSessionId(),
        event_type: event_type || 'page_view',
        page: window.location.pathname,
        feature: opts.feature || null,
        metadata: opts.metadata || {},
      }),
    });
  } catch {
    // silent fail — nunca rompe UX
  }
}

/**
 * Hook que dispara track('page_view') automático en cada cambio de ruta.
 * Requiere ser montado dentro de <BrowserRouter>.
 */
export function usePageViewTracking() {
  const location = useLocation();
  const prevPath = useRef(null);

  useEffect(() => {
    if (location.pathname === prevPath.current) return;
    prevPath.current = location.pathname;
    const meta = { search: location.search };
    // Etiqueta la zona en origen cuando la URL es una vista pública de zona/mapa.
    // Cierra el ciclo de Live Pulse (señal "view volume" por colonia) sin tocar cada página.
    const m = location.pathname.match(/^\/colonia\/([a-z0-9-]+)/i)
      || location.pathname.match(/^\/mapa\/[^/]+\/([a-z0-9-]+)/i);
    if (m) meta.zone_slug = m[1].toLowerCase();
    track('page_view', { metadata: meta });
  }, [location.pathname, location.search]);
}

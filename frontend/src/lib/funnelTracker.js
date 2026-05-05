/**
 * Phase 4 Batch 20 — funnelTracker
 *
 * Fire & forget POST /api/funnel/event. Captures session_id from sessionStorage,
 * UTM params + ref slug from URL.
 */
const API = process.env.REACT_APP_BACKEND_URL;
const SESSION_KEY = 'dmx_funnel_session';

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = 'sess_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    try { sessionStorage.setItem(SESSION_KEY, id); } catch {}
  }
  return id;
}

function readUtm() {
  try {
    const u = new URL(window.location.href);
    return {
      utm_source: u.searchParams.get('utm_source') || '',
      utm_medium: u.searchParams.get('utm_medium') || '',
      utm_campaign: u.searchParams.get('utm_campaign') || '',
      ref: u.searchParams.get('ref') || '',
    };
  } catch {
    return { utm_source: '', utm_medium: '', utm_campaign: '', ref: '' };
  }
}

export async function trackFunnelEvent(eventType, projectId, metadata = {}) {
  if (!eventType || !projectId) return;
  const { utm_source, utm_medium, utm_campaign, ref } = readUtm();
  try {
    await fetch(`${API}/api/funnel/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event_type: eventType,
        project_id: projectId,
        link_id: ref || null,
        session_id: getSessionId(),
        utm_source, utm_medium, utm_campaign,
        metadata,
      }),
    });
  } catch {}
}

export default { trackFunnelEvent };

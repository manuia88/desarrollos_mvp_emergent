/**
 * W5.5 Parte 2 — Live Pulse API client.
 * Endpoints publicos + autenticados (T3+) + superadmin (auth via session cookie).
 */
const API = process.env.REACT_APP_BACKEND_URL;

async function _get(url) {
  const r = await fetch(`${API}${url}`, { credentials: 'include' });
  let body = {};
  try { body = await r.json(); } catch (_) { body = {}; }
  return { ok: r.ok, status: r.status, body };
}

async function _post(url, payload) {
  const r = await fetch(`${API}${url}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  let body = {};
  try { body = await r.json(); } catch (_) { body = {}; }
  return { ok: r.ok, status: r.status, body };
}

async function _del(url) {
  const r = await fetch(`${API}${url}`, { method: 'DELETE', credentials: 'include' });
  let body = {};
  try { body = await r.json(); } catch (_) { body = {}; }
  return { ok: r.ok, status: r.status, body };
}

// Publico T0
export const getZones = ({ limit = 50, sort = 'score_desc', min_score = 0 } = {}) => {
  const qs = new URLSearchParams({ limit: String(limit), sort, min_score: String(min_score) });
  return _get(`/api/live-pulse/zones?${qs.toString()}`);
};
export const getZoneTimeline = (slug, days = 90) =>
  _get(`/api/live-pulse/zone/${encodeURIComponent(slug)}/timeline?days=${days}`);

// Auth + tier T3+
export const subscribeZone = (zone_slug, threshold_score = 80) =>
  _post('/api/live-pulse/alerts/subscribe', { zone_slug, threshold_score });
export const getMySubs = () => _get('/api/live-pulse/alerts/my-subs');
export const unsubscribe = (sub_id) => _del(`/api/live-pulse/alerts/${encodeURIComponent(sub_id)}`);

// Superadmin
export const getReadiness = () => _get('/api/superadmin/live-pulse/readiness');
export const setFrequency = (frequency) => _post('/api/superadmin/live-pulse/set-frequency', { frequency });
export const getStats = () => _get('/api/superadmin/live-pulse/stats');
export const getScoreDistribution = () => _get('/api/superadmin/live-pulse/score-distribution');

const livePulseApi = {
  getZones, getZoneTimeline,
  subscribeZone, getMySubs, unsubscribe,
  getReadiness, setFrequency, getStats, getScoreDistribution,
};
export default livePulseApi;

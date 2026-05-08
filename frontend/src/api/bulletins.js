/**
 * W3.3 ZZ.3 — Bulletins API Client.
 */
const API = process.env.REACT_APP_BACKEND_URL;

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(b)).catch(() => Promise.reject({ status: r.status }));
  return r.json();
};
const enc = encodeURIComponent;

export async function fetchBulletin(slug, period) {
  return fetch(`${API}/api/bulletins/${enc(slug)}/${enc(period)}`, { credentials: 'include' }).then(j);
}

export function bulletinPdfUrl(slug, period) {
  return `${API}/api/bulletins/${enc(slug)}/${enc(period)}/pdf`;
}

export async function fetchMethodology() {
  return fetch(`${API}/api/public/methodology`, { credentials: 'include' }).then(j);
}

export async function listBulletins({ type, zoneId, period, limit = 50 } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (type)   qs.set('type', type);
  if (zoneId) qs.set('zone_id', zoneId);
  if (period) qs.set('period', period);
  return fetch(`${API}/api/superadmin/bulletins/list?${qs}`, { credentials: 'include' }).then(j);
}

export async function generateBulletin({ type = 'general', zone_id, period, distribute = false }) {
  return fetch(`${API}/api/superadmin/bulletins/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, zone_id, period, distribute }),
  }).then(j);
}

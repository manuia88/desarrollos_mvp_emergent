/** W3.4A — Fraud Detection API Client. */
const API = process.env.REACT_APP_BACKEND_URL;

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(b)).catch(() => Promise.reject({ status: r.status }));
  return r.json();
};
const enc = encodeURIComponent;

export async function listAlerts({ status, severity, source, zoneId, limit = 20, skip = 0 } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('skip', String(skip));
  if (status)   qs.set('status', status);
  if (severity) qs.set('severity', severity);
  if (source)   qs.set('source', source);
  if (zoneId)   qs.set('zone_id', zoneId);
  return fetch(`${API}/api/superadmin/fraud-alerts?${qs}`, { credentials: 'include' }).then(j);
}

export async function fetchAlert(alertId) {
  return fetch(`${API}/api/superadmin/fraud-alerts/${enc(alertId)}`, { credentials: 'include' }).then(j);
}

export async function resolveAlert(alertId, note) {
  return fetch(`${API}/api/superadmin/fraud-alerts/${enc(alertId)}/resolve`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution_note: note || '' }),
  }).then(j);
}

export async function dismissAlert(alertId, reason) {
  return fetch(`${API}/api/superadmin/fraud-alerts/${enc(alertId)}/dismiss`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason || '' }),
  }).then(j);
}

export async function manualScan() {
  return fetch(`${API}/api/superadmin/fraud-alerts/scan`, {
    method: 'POST', credentials: 'include',
  }).then(j);
}

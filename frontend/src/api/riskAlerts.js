/** W3.4B — Risk Alerts API Client. */
const API = process.env.REACT_APP_BACKEND_URL;

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(b)).catch(() => Promise.reject({ status: r.status }));
  return r.json();
};
const enc = encodeURIComponent;

export async function listAlerts({ zoneId, severity, days = 30, limit = 50, skip = 0 } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('skip', String(skip));
  qs.set('days', String(days));
  if (zoneId)   qs.set('zone_id', zoneId);
  if (severity) qs.set('severity', severity);
  return fetch(`${API}/api/superadmin/risk-alerts?${qs}`, { credentials: 'include' }).then(j);
}

export async function fetchTimeline(zoneId, limit = 50) {
  return fetch(
    `${API}/api/superadmin/risk-alerts/timeline/${enc(zoneId)}?limit=${limit}`,
    { credentials: 'include' },
  ).then(j);
}

export async function acknowledgeAlert(changeId) {
  return fetch(
    `${API}/api/superadmin/risk-alerts/${enc(changeId)}/acknowledge`,
    { method: 'POST', credentials: 'include' },
  ).then(j);
}

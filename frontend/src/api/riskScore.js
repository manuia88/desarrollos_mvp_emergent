/** W3.4A — Risk Score API Client. */
const API = process.env.REACT_APP_BACKEND_URL;

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(b)).catch(() => Promise.reject({ status: r.status }));
  return r.json();
};
const enc = encodeURIComponent;

export async function fetchRiskScore(zoneId) {
  return fetch(`${API}/api/risk-score/zone/${enc(zoneId)}`, { credentials: 'include' }).then(j);
}

export async function listAllScores({ tier, limit = 50 } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (tier) qs.set('tier', tier);
  return fetch(`${API}/api/superadmin/risk-score/all?${qs}`, { credentials: 'include' }).then(j);
}

export async function recompute() {
  return fetch(`${API}/api/superadmin/risk-score/recompute`, {
    method: 'POST', credentials: 'include',
  }).then(j);
}

export async function fetchCrimeBreakdown(zoneId, periodMonths = 6) {
  return fetch(
    `${API}/api/superadmin/crime-data/${enc(zoneId)}/breakdown?period_months=${periodMonths}`,
    { credentials: 'include' },
  ).then(j);
}

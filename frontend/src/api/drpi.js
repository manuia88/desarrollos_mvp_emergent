/**
 * W3.3 ZZ.3 — DRPI API Client.
 */
const API = process.env.REACT_APP_BACKEND_URL;

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(b)).catch(() => Promise.reject({ status: r.status }));
  return r.json();
};
const enc = encodeURIComponent;

export async function fetchSnapshot(zoneId, { tier = 'colonia', period, include } = {}) {
  const qs = new URLSearchParams();
  qs.set('tier', tier);
  if (period)  qs.set('period', period);
  if (include) qs.set('include', include);
  return fetch(`${API}/api/drpi/snapshot/${enc(zoneId)}?${qs}`, { credentials: 'include' }).then(j);
}

export async function fetchNational(period) {
  return fetch(`${API}/api/drpi/national/${enc(period)}`, { credentials: 'include' }).then(j);
}

export async function listSnapshots({ period, tier, limit = 200, skip = 0 } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('skip', String(skip));
  if (period) qs.set('period', period);
  if (tier)   qs.set('tier', tier);
  return fetch(`${API}/api/superadmin/drpi/list?${qs}`, { credentials: 'include' }).then(j);
}

export async function recompute() {
  return fetch(`${API}/api/superadmin/drpi/recompute`, {
    method: 'POST', credentials: 'include',
  }).then(j);
}

export async function fetchCoefficients(zoneId, tier = 'colonia') {
  return fetch(
    `${API}/api/superadmin/drpi/coefficients/${enc(zoneId)}?tier=${enc(tier)}`,
    { credentials: 'include' },
  ).then(j);
}

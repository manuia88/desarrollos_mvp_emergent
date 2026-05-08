/**
 * W3.3 ZZ.3 — Investment Explorer API Client.
 */
const API = process.env.REACT_APP_BACKEND_URL;

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(b)).catch(() => Promise.reject({ status: r.status }));
  return r.json();
};
const enc = encodeURIComponent;

export async function listZones({
  sort = 'score', tier = 'colonia',
  buyer_objective = 'balanced', limit = 50, skip = 0,
} = {}) {
  const qs = new URLSearchParams();
  qs.set('sort', sort);
  qs.set('tier', tier);
  qs.set('buyer_objective', buyer_objective);
  qs.set('limit', String(limit));
  qs.set('skip', String(skip));
  return fetch(
    `${API}/api/superadmin/investment-explorer/zones?${qs}`,
    { credentials: 'include' },
  ).then(j);
}

export async function fetchZoneDetail(zoneId, tier = 'colonia') {
  return fetch(
    `${API}/api/superadmin/investment-explorer/zones/${enc(zoneId)}/detail?tier=${enc(tier)}`,
    { credentials: 'include' },
  ).then(j);
}

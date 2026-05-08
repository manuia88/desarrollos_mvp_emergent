/** W3.6 — Data Licensing Bundles client (Superadmin). */
const API = process.env.REACT_APP_BACKEND_URL;

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(b)).catch(() => Promise.reject({ status: r.status }));
  return r.json();
};
const enc = encodeURIComponent;

export async function listBundleTemplates() {
  return fetch(`${API}/api/superadmin/data-licensing/bundles`, { credentials: 'include' }).then(j);
}

export async function listSubscriptions({ status, limit = 100 } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (status) qs.set('status', status);
  return fetch(`${API}/api/superadmin/data-licensing/subscriptions?${qs}`, {
    credentials: 'include',
  }).then(j);
}

export async function createSubscription(body) {
  return fetch(`${API}/api/superadmin/data-licensing/subscriptions`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(j);
}

export async function patchSubscription(id, body) {
  return fetch(`${API}/api/superadmin/data-licensing/subscriptions/${enc(id)}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(j);
}

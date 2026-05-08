/** W3.5 — Superadmin API Keys client. */
const API = process.env.REACT_APP_BACKEND_URL;

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(b)).catch(() => Promise.reject({ status: r.status }));
  return r.json();
};
const enc = encodeURIComponent;

export async function listKeys({ status, tier, limit = 100 } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (status) qs.set('status', status);
  if (tier)   qs.set('tier', tier);
  return fetch(`${API}/api/superadmin/api-keys?${qs}`, { credentials: 'include' }).then(j);
}

export async function createKey({ tenant_id, tier, contact_email, expires_at, monthly_quota_calls }) {
  return fetch(`${API}/api/superadmin/api-keys`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id, tier, contact_email, expires_at, monthly_quota_calls }),
  }).then(j);
}

export async function patchKey(id, body) {
  return fetch(`${API}/api/superadmin/api-keys/${enc(id)}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(j);
}

export async function revokeKey(id) {
  return fetch(`${API}/api/superadmin/api-keys/${enc(id)}`, {
    method: 'DELETE', credentials: 'include',
  }).then(j);
}

export async function fetchUsage(id, days = 30) {
  return fetch(
    `${API}/api/superadmin/api-keys/${enc(id)}/usage?days=${days}`,
    { credentials: 'include' },
  ).then(j);
}

export async function fetchOpenAPI() {
  return fetch(`${API}/api/v1/openapi`).then(j);
}

export async function fetchStripeStatus(tenantId) {
  return fetch(`${API}/api/superadmin/stripe/${enc(tenantId)}`, { credentials: 'include' }).then(j);
}

export async function stripeSubscribe(tenantId, body) {
  return fetch(`${API}/api/superadmin/stripe/${enc(tenantId)}/subscribe`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(j);
}

export async function stripeCancel(tenantId) {
  return fetch(`${API}/api/superadmin/stripe/${enc(tenantId)}/cancel`, {
    method: 'POST', credentials: 'include',
  }).then(j);
}

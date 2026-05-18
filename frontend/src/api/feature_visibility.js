// W5.FF3 · UI Feature Visibility Matrix · API client
// 4 endpoints superadmin · auth via Bearer token + credentials cookie.

const API = process.env.REACT_APP_BACKEND_URL;
const BASE = `${API}/api/superadmin/features`;

const _h = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('dmx_token') || ''}`,
});

async function _j(r) {
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const d = await r.json(); msg = d.detail || d.message || msg; } catch {}
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function fetchCatalog() {
  return _j(await fetch(`${BASE}/catalog`, { headers: _h(), credentials: 'include' }));
}

export async function fetchUsersWithFeatures({ role, tier, search, limit = 50, skip = 0 } = {}) {
  const qs = new URLSearchParams();
  if (role) qs.set('role', role);
  if (tier) qs.set('tier', tier);
  if (search) qs.set('search', search);
  qs.set('limit', String(limit));
  qs.set('skip', String(skip));
  return _j(await fetch(`${BASE}/users?${qs.toString()}`, { headers: _h(), credentials: 'include' }));
}

export async function grantFeature({ user_id, tenant_id, feature_key, enabled }) {
  return _j(await fetch(`${BASE}/grant`, {
    method: 'POST',
    headers: _h(),
    credentials: 'include',
    body: JSON.stringify({ user_id, tenant_id, feature_key, enabled }),
  }));
}

export async function applyTemplate({ user_id, tenant_id, template }) {
  return _j(await fetch(`${BASE}/apply-template`, {
    method: 'POST',
    headers: _h(),
    credentials: 'include',
    body: JSON.stringify({ user_id, tenant_id, template }),
  }));
}

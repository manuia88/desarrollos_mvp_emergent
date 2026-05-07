// W2.3 SA4 — AI Cost Observatory API client
const API = process.env.REACT_APP_BACKEND_URL;

const h = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('dmx_token')}`,
});

async function _j(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || d.message || msg; } catch {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return res.json();
}

const BASE = `${API}/api/superadmin/ai-cost`;

const _qs = (obj) => {
  const qs = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  return qs.toString();
};

export async function getOverview(period = 'month') {
  return _j(await fetch(`${BASE}/overview?period=${period}`, { headers: h(), credentials: 'include' }));
}
export async function getByTenant(params = {}) {
  return _j(await fetch(`${BASE}/by-tenant?${_qs(params)}`, { headers: h(), credentials: 'include' }));
}
export async function getByFeature(params = {}) {
  return _j(await fetch(`${BASE}/by-feature?${_qs(params)}`, { headers: h(), credentials: 'include' }));
}
export async function getByModel(period = 'month') {
  return _j(await fetch(`${BASE}/by-model?period=${period}`, { headers: h(), credentials: 'include' }));
}
export async function getTenantTimeseries(tenantId, days = 30) {
  return _j(await fetch(`${BASE}/tenant/${encodeURIComponent(tenantId)}/timeseries?days=${days}`, { headers: h(), credentials: 'include' }));
}
export async function getForecast(tenantId) {
  const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  return _j(await fetch(`${BASE}/forecast${qs}`, { headers: h(), credentials: 'include' }));
}
export async function listCaps() {
  return _j(await fetch(`${BASE}/caps`, { headers: h(), credentials: 'include' }));
}
export async function upsertCap(body) {
  return _j(await fetch(`${BASE}/caps`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify(body),
  }));
}
export async function patchCap(tenantId, body) {
  return _j(await fetch(`${BASE}/caps/${encodeURIComponent(tenantId)}`, {
    method: 'PATCH', headers: h(), credentials: 'include',
    body: JSON.stringify(body),
  }));
}

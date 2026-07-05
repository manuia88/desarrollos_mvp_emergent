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

// W5.x F1 — User-tier quotas
export async function listUserUsage(params = {}) {
  return _j(await fetch(`${BASE}/users/usage?${_qs(params)}`, {
    headers: h(), credentials: 'include',
  }));
}
export async function getUserQuotaDetail(userId) {
  return _j(await fetch(`${BASE}/users/${encodeURIComponent(userId)}/quota`, {
    headers: h(), credentials: 'include',
  }));
}
export async function updateUserTier(userId, tier) {
  return _j(await fetch(`${BASE}/users/${encodeURIComponent(userId)}/tier`, {
    method: 'PATCH', headers: h(), credentials: 'include',
    body: JSON.stringify({ tier }),
  }));
}

// ── Narrativas IE (censo 2026-07-05: endpoints sin UI → cableados aquí, su casa natural: presupuesto LLM) ──
export async function getNarrativasBudget() {
  return _j(await fetch(`${API}/api/superadmin/narratives/budget`, { headers: h(), credentials: 'include' }));
}
export async function regenerateNarrativa(id, scope) {
  return _j(await fetch(`${API}/api/superadmin/narratives/regenerate?id=${encodeURIComponent(id)}&scope=${encodeURIComponent(scope)}`, { method: 'POST', headers: h(), credentials: 'include' }));
}
export async function batchGenerateNarrativas(scope = 'all') {
  return _j(await fetch(`${API}/api/superadmin/narratives/batch-generate?scope=${encodeURIComponent(scope)}`, { method: 'POST', headers: h(), credentials: 'include' }));
}

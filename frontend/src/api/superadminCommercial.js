// W2.4 SA5 — Commercial API client
const API = process.env.REACT_APP_BACKEND_URL;

const h = () => ({
  'Content-Type': 'application/json',
});

async function _j(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || d.message || msg; } catch {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return res.json();
}

const BASE = `${API}/api/superadmin/commercial`;

export async function getCatalog() { return _j(await fetch(`${BASE}/features/catalog`, { headers: h(), credentials: 'include' })); }
export async function getTenantFeatures(tenantId) { return _j(await fetch(`${BASE}/tenants/${encodeURIComponent(tenantId)}/features`, { headers: h(), credentials: 'include' })); }
export async function upsertTenantFeature(tenantId, featureKey, body) { return _j(await fetch(`${BASE}/tenants/${encodeURIComponent(tenantId)}/features/${encodeURIComponent(featureKey)}`, { method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body) })); }
export async function bulkUpsertFeatures(tenantId, features) { return _j(await fetch(`${BASE}/tenants/${encodeURIComponent(tenantId)}/features/bulk`, { method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify({ features }) })); }
export async function listTemplates() { return _j(await fetch(`${BASE}/plan-templates`, { headers: h(), credentials: 'include' })); }
export async function createTemplate(body) { return _j(await fetch(`${BASE}/plan-templates`, { method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body) })); }
export async function patchTemplate(id, body) { return _j(await fetch(`${BASE}/plan-templates/${encodeURIComponent(id)}`, { method: 'PATCH', headers: h(), credentials: 'include', body: JSON.stringify(body) })); }
export async function applyTemplate(id, tenantId) { return _j(await fetch(`${BASE}/plan-templates/${encodeURIComponent(id)}/apply/${encodeURIComponent(tenantId)}`, { method: 'POST', headers: h(), credentials: 'include' })); }
export async function listSnapshots() { return _j(await fetch(`${BASE}/snapshots`, { headers: h(), credentials: 'include' })); }
export async function createSnapshot(body) { return _j(await fetch(`${BASE}/snapshots`, { method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body) })); }
export async function applySnapshot(id, tenantId, body) { return _j(await fetch(`${BASE}/snapshots/${encodeURIComponent(id)}/apply/${encodeURIComponent(tenantId)}`, { method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body) })); }
export async function getExpiringTrials(withinDays = 14) { return _j(await fetch(`${BASE}/trials/expiring?within_days=${withinDays}`, { headers: h(), credentials: 'include' })); }

// Self-tenant feature flags fetch (used by useFeatureFlag hook)
export async function getMyFeatureFlags() {
  const url = `${API}/api/me/feature-flags`;
  return _j(await fetch(url, { headers: h(), credentials: 'include' }));
}

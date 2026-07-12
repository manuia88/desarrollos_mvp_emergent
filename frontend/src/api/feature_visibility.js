// W5.FF3 · UI Feature Visibility Matrix · API client
// 4 endpoints superadmin · auth via cookie httponly (credentials: 'include').

const API = process.env.REACT_APP_BACKEND_URL;
const BASE = `${API}/api/superadmin/features`;

const _h = () => ({
  'Content-Type': 'application/json',
});

async function _j(r) {
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    let body = null;
    try {
      body = await r.json();
      // detail puede ser string O dict (W5.FF4 · 409 missing_dependencies)
      if (typeof body?.detail === 'string') msg = body.detail;
      else if (body?.detail?.error) msg = body.detail.error;
      else if (typeof body?.message === 'string') msg = body.message;
    } catch { /* non-JSON body */ }
    const e = new Error(msg);
    e.status = r.status;
    e.body = body;
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

// Fase 0.5/3.1 · Planes (snapshots GoHighLevel): asignar un bundle de features a un tenant.
export async function listPlans() {
  return _j(await fetch(`${BASE}/plans`, { headers: _h(), credentials: 'include' }));
}
export async function getTenantPlan(tenantId) {
  return _j(await fetch(`${BASE}/plans/tenant/${encodeURIComponent(tenantId)}`, { headers: _h(), credentials: 'include' }));
}
export async function assignPlan({ tenant_id, plan_id, replace = true }) {
  return _j(await fetch(`${BASE}/plans/assign`, {
    method: 'POST', headers: _h(), credentials: 'include',
    body: JSON.stringify({ tenant_id, plan_id, replace }),
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

// W5.FF4 · Usage analytics
export async function fetchUsage({ days = 7 } = {}) {
  const qs = new URLSearchParams({ days: String(days) });
  return _j(await fetch(`${BASE}/usage?${qs.toString()}`, { headers: _h(), credentials: 'include' }));
}

// ─── W5.FF5 · A/B Testing wrappers ─────────────────────────────────────────
export async function createABExperiment(body) {
  return _j(await fetch(`${BASE}/ab-experiments`, {
    method: 'POST',
    headers: _h(),
    credentials: 'include',
    body: JSON.stringify(body),
  }));
}

export async function listABExperiments({ status = 'active', feature_key } = {}) {
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (feature_key) qs.set('feature_key', feature_key);
  return _j(await fetch(`${BASE}/ab-experiments?${qs.toString()}`, {
    headers: _h(), credentials: 'include',
  }));
}

export async function getExperimentStats(experimentId) {
  return _j(await fetch(`${BASE}/ab-experiments/${encodeURIComponent(experimentId)}/stats`, {
    headers: _h(), credentials: 'include',
  }));
}

export async function stopExperiment(experimentId) {
  return _j(await fetch(`${BASE}/ab-experiments/${encodeURIComponent(experimentId)}/stop`, {
    method: 'POST',
    headers: _h(),
    credentials: 'include',
  }));
}

// ─── W5.FF5 · Bulk CSV upload ──────────────────────────────────────────────
export async function uploadBulkCSV(file) {
  const fd = new FormData();
  fd.append('file', file);
  // Note: NO Content-Type header · browser sets multipart boundary automáticamente.
  const r = await fetch(`${BASE}/bulk-csv`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!r.ok) {
    let body = null;
    let msg = `HTTP ${r.status}`;
    try {
      body = await r.json();
      if (typeof body?.detail === 'string') msg = body.detail;
      else if (body?.detail?.error) msg = body.detail.error;
    } catch { /* non-JSON */ }
    const e = new Error(msg);
    e.status = r.status;
    e.body = body;
    throw e;
  }
  return r.json();
}

// W2.7 Phase Z.0 — Data Lake API client
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

const BASE = `${API}/api/superadmin/data-lake`;

export async function listEtlRuns({ status, limit, skip } = {}) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (limit) p.set('limit', limit);
  if (skip) p.set('skip', skip);
  const qs = p.toString();
  return _j(await fetch(`${BASE}/etl-runs${qs ? '?' + qs : ''}`,
    { headers: h(), credentials: 'include' }));
}

export async function triggerEtl(body = {}) {
  return _j(await fetch(`${BASE}/etl/trigger`,
    { method: 'POST', headers: h(), credentials: 'include',
      body: JSON.stringify(body) }));
}

export async function getCoverage({ tier, days } = {}) {
  const p = new URLSearchParams();
  if (tier) p.set('tier', tier);
  if (days) p.set('days', days);
  const qs = p.toString();
  return _j(await fetch(`${BASE}/coverage${qs ? '?' + qs : ''}`,
    { headers: h(), credentials: 'include' }));
}

export async function getValidationMetrics({ model_name, limit } = {}) {
  const p = new URLSearchParams();
  if (model_name) p.set('model_name', model_name);
  if (limit) p.set('limit', limit);
  const qs = p.toString();
  return _j(await fetch(`${BASE}/validation-metrics${qs ? '?' + qs : ''}`,
    { headers: h(), credentials: 'include' }));
}

export async function runValidationsNow() {
  return _j(await fetch(`${BASE}/validation/run-now`,
    { method: 'POST', headers: h(), credentials: 'include' }));
}

// PUBLIC endpoint — no auth required
export async function getPublicValidation() {
  return _j(await fetch(`${API}/api/data-lake/public/validation`));
}

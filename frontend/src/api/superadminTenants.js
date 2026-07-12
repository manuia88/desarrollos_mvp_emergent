// W1.2 SA1.1 — Superadmin Tenants API
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

export async function listTenants(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  return _j(await fetch(`${API}/api/superadmin/tenants?${qs.toString()}`, { headers: h(), credentials: 'include' }));
}

export async function getTenant(tenantId) {
  return _j(await fetch(`${API}/api/superadmin/tenants/${tenantId}`, { headers: h(), credentials: 'include' }));
}

export async function impersonateTenant(tenantId) {
  return _j(await fetch(`${API}/api/superadmin/tenants/${tenantId}/impersonate`, {
    method: 'POST', headers: h(), credentials: 'include',
  }));
}

export async function endImpersonation() {
  return _j(await fetch(`${API}/api/superadmin/tenants/impersonate/end`, {
    method: 'POST', headers: h(), credentials: 'include',
  }));
}

export async function patchTenantStatus(tenantId, status, reason) {
  return _j(await fetch(`${API}/api/superadmin/tenants/${tenantId}/status`, {
    method: 'PATCH', headers: h(), credentials: 'include',
    body: JSON.stringify({ status, reason }),
  }));
}

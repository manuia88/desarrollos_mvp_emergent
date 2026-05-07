// W1.3 SA1.2 — Superadmin Health API
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

export async function getHealthOverview() {
  return _j(await fetch(`${API}/api/superadmin/health/overview`, { headers: h(), credentials: 'include' }));
}

export async function getCrons() {
  return _j(await fetch(`${API}/api/superadmin/health/crons`, { headers: h(), credentials: 'include' }));
}

export async function getAlerts(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  return _j(await fetch(`${API}/api/superadmin/health/alerts?${qs.toString()}`, { headers: h(), credentials: 'include' }));
}

export async function resolveAlert(alertId) {
  return _j(await fetch(`${API}/api/superadmin/health/alerts/${alertId}/resolve`, {
    method: 'POST', headers: h(), credentials: 'include',
  }));
}

export async function triggerTestAlert() {
  return _j(await fetch(`${API}/api/superadmin/health/alerts/test`, {
    method: 'POST', headers: h(), credentials: 'include',
  }));
}

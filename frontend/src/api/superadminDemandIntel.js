// Inteligencia de demanda — cliente API
const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('dmx_token')}` });
async function _j(res) {
  if (!res.ok) { let m = `HTTP ${res.status}`; try { const d = await res.json(); m = d.detail || m; } catch {} throw new Error(m); }
  return res.json();
}
const BASE = `${API}/api/superadmin/demand-intel`;
const _qs = (o) => Object.entries(o || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export async function getOverview(params = {}) {
  return _j(await fetch(`${BASE}/overview?${_qs(params)}`, { headers: h(), credentials: 'include' }));
}
export async function getFeature(feature, colonia, period = 'month') {
  return _j(await fetch(`${BASE}/feature?${_qs({ feature, colonia, period })}`, { headers: h(), credentials: 'include' }));
}
// Dimensiones profundas: por-qué-NO, intent, qué compite, cuándo, journey.
export async function getDeep() {
  return _j(await fetch(`${BASE}/deep`, { headers: h(), credentials: 'include' }));
}

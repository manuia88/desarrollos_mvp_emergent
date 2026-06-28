// Visibilidad total de granularidad — cliente API
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

const BASE = `${API}/api/superadmin/granularity`;

export async function getCoverage() {
  return _j(await fetch(`${BASE}/coverage`, { headers: h(), credentials: 'include' }));
}
export async function getEntity(entityType, entityId) {
  return _j(await fetch(`${BASE}/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, { headers: h(), credentials: 'include' }));
}
export async function runBackfill(family = 'default') {
  return _j(await fetch(`${BASE}/backfill?family=${encodeURIComponent(family)}`, { method: 'POST', headers: h(), credentials: 'include' }));
}
export async function getStubDiagnosis() {
  return _j(await fetch(`${BASE}/stub-diagnosis`, { headers: h(), credentials: 'include' }));
}

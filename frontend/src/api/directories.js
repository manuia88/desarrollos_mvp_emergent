// Phase 15 · Batch 38 — Directory APIs
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

export async function getDevRedComercial() {
  return _j(await fetch(`${API}/api/dev/red-comercial`, { headers: h(), credentials: 'include' }));
}

export async function getAsesorMisAliados() {
  return _j(await fetch(`${API}/api/asesor/mis-aliados`, { headers: h(), credentials: 'include' }));
}

export async function getInmobiliariaRedComercial() {
  return _j(await fetch(`${API}/api/inmobiliaria/red-comercial`, { headers: h(), credentials: 'include' }));
}

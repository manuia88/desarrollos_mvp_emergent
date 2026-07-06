// Alta manual de desarrolladores y proyectos (superadmin)
const API = process.env.REACT_APP_BACKEND_URL;
const h = { 'Content-Type': 'application/json' };

async function _j(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || d.message || msg; } catch { /* noop */ }
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return res.json();
}

export async function altaDesarrollador(body) {
  return _j(await fetch(`${API}/api/superadmin/alta/desarrollador`, {
    method: 'POST', headers: h, credentials: 'include', body: JSON.stringify(body),
  }));
}

export async function listarDesarrolladores() {
  return _j(await fetch(`${API}/api/superadmin/alta/desarrolladores`, { credentials: 'include' }));
}

export async function altaProyecto(body) {
  return _j(await fetch(`${API}/api/superadmin/alta/proyecto`, {
    method: 'POST', headers: h, credentials: 'include', body: JSON.stringify(body),
  }));
}

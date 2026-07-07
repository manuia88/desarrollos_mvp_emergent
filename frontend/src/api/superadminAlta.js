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

export async function uploadIngesta(files, projectName = '', devOrgId = '') {
  const API = process.env.REACT_APP_BACKEND_URL;
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  if (projectName) form.append('project_name', projectName);
  if (devOrgId) form.append('target_dev_org_id', devOrgId);
  const res = await fetch(`${API}/api/superadmin/bulk-ingest/upload`, {
    method: 'POST', credentials: 'include', body: form,
  });
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

export async function ingestaJob(jobId) {
  const API = process.env.REACT_APP_BACKEND_URL;
  const res = await fetch(`${API}/api/superadmin/bulk-ingest/jobs/${jobId}`, { credentials: 'include' });
  if (!res.ok) return null;
  return res.json();
}

// ─── Ficha de un desarrollador (detalle + gestión granular) ───────────────────

export async function detalleDesarrollador(devOrgId) {
  return _j(await fetch(`${API}/api/superadmin/alta/desarrollador/${encodeURIComponent(devOrgId)}`, { credentials: 'include' }));
}

export async function editarDesarrollador(devOrgId, body) {
  return _j(await fetch(`${API}/api/superadmin/alta/desarrollador/${encodeURIComponent(devOrgId)}`, {
    method: 'PATCH', headers: h, credentials: 'include', body: JSON.stringify(body),
  }));
}

export async function darAccesoDesarrollador(devOrgId, body) {
  return _j(await fetch(`${API}/api/superadmin/alta/desarrollador/${encodeURIComponent(devOrgId)}/dar-acceso`, {
    method: 'POST', headers: h, credentials: 'include', body: JSON.stringify(body),
  }));
}

export async function editarProyecto(projectId, body) {
  return _j(await fetch(`${API}/api/superadmin/alta/proyecto/${encodeURIComponent(projectId)}`, {
    method: 'PATCH', headers: h, credentials: 'include', body: JSON.stringify(body),
  }));
}

// Phase 7.11 — Drive Watch Service API helpers (developer multi-tenant + superadmin alias).
const API = process.env.REACT_APP_BACKEND_URL;

async function _req(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      const j = await r.json();
      msg = j.detail || j.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// Per-development scope. Path prefix toggles between superadmin / developer alias.
function _basePath(role) {
  return role === 'superadmin' ? '/api/superadmin/drive' : '/api/desarrollador/drive';
}

export async function fetchDriveOAuthUrl(devId, role) {
  return _req(`${_basePath(role)}/oauth-url?development_id=${encodeURIComponent(devId)}`);
}

export async function fetchDriveStatus(devId, role) {
  return _req(`${_basePath(role)}/${encodeURIComponent(devId)}/status`);
}

export async function fetchDriveFolders(devId, role) {
  return _req(`${_basePath(role)}/${encodeURIComponent(devId)}/folders`);
}

export async function setDriveFolder(devId, role, folder_id, folder_name) {
  return _req(`${_basePath(role)}/${encodeURIComponent(devId)}/folder`, {
    method: 'POST',
    body: JSON.stringify({ folder_id, folder_name }),
  });
}

export async function syncDriveNow(devId, role) {
  return _req(`${_basePath(role)}/${encodeURIComponent(devId)}/sync-now`, { method: 'POST' });
}

export async function disconnectDrive(devId, role) {
  return _req(`${_basePath(role)}/${encodeURIComponent(devId)}/disconnect`, { method: 'POST' });
}

export async function listAllDriveConnections() {
  return _req('/api/superadmin/drive/connections');
}

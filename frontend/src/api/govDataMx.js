// W6.MOV.2 · Gov Data MX API client (8 endpoints)
// Track A · sources + force refresh
// Track B · cron status
// Track C · upload + list + delete
// Public · aggregated indicator
const API = process.env.REACT_APP_BACKEND_URL || '';

function authHeaders() {
  const token =
    localStorage.getItem('access_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function _req(url, opts = {}) {
  const res = await fetch(`${API}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch (_e) { /* ignore */ }
    const err = new Error(body?.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

// ── Track A · sources status ────────────────────────────────────────────────
export async function listSources() {
  return _req('/api/superadmin/gov-data-mx/sources', {
    headers: authHeaders(),
  });
}

export async function refreshSource(sourceId) {
  return _req(
    `/api/superadmin/gov-data-mx/refresh/${encodeURIComponent(sourceId)}`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    },
  );
}

// ── Track B · cron status ───────────────────────────────────────────────────
export async function getCronStatus() {
  return _req('/api/superadmin/gov-data-mx/cron-status', {
    headers: authHeaders(),
  });
}

// ── Aggregated stats ────────────────────────────────────────────────────────
export async function getStats() {
  return _req('/api/superadmin/gov-data-mx/stats', {
    headers: authHeaders(),
  });
}

// ── Track C · upload ────────────────────────────────────────────────────────
export async function uploadFile({ file, source_label, schema_hint }) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('source_label', source_label);
  if (schema_hint) fd.append('schema_hint', schema_hint);
  // NOTE · NO setear Content-Type · browser establece boundary
  const res = await fetch(`${API}/api/superadmin/gov-data-mx/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...authHeaders() },
    body: fd,
  });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch (_e) { /* ignore */ }
    const err = new Error(body?.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

export async function listUploads({ limit = 50, offset = 0, include_deleted = false } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    include_deleted: String(include_deleted),
  });
  return _req(`/api/superadmin/gov-data-mx/uploads?${params.toString()}`, {
    headers: authHeaders(),
  });
}

export async function deleteUpload(uploadId, reason) {
  return _req(
    `/api/superadmin/gov-data-mx/uploads/${encodeURIComponent(uploadId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
}

// ── Public · aggregated indicator (no raw) ─────────────────────────────────
export async function getPublicSource(sourceId) {
  return _req(`/api/gov-data-mx/public/${encodeURIComponent(sourceId)}`);
}

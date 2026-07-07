// Phase 13 · Batch 36 — Advisor Whitelist + Auto-Approve API helpers
// Uses fetch (consistent with rest of codebase — no axios)
const API = process.env.REACT_APP_BACKEND_URL;

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('dmx_token')}`,
});

async function _j(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      msg = d.detail || d.message || msg;
    } catch { /* ignore */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ─── Asesor side ──────────────────────────────────────────────────────────────

/** Enviar solicitud de acceso a inventario de un developer */
export async function requestWhitelistAccess(payload) {
  return _j(await fetch(`${API}/api/asesor/whitelist/request`, {
    method: 'POST',
    credentials: 'include', headers: authHeaders(),
    body: JSON.stringify(payload),
  }));
}

/** Obtener mis solicitudes (cualquier estado) */
export async function getMyWhitelistRequests() {
  return _j(await fetch(`${API}/api/asesor/whitelist/me`, {
    credentials: 'include', headers: authHeaders(),
  }));
}

/** Obtener IDs de developers con acceso aprobado */
export async function getAuthorizedDevOrgs() {
  return _j(await fetch(`${API}/api/asesor/whitelist/authorized-devs`, {
    credentials: 'include', headers: authHeaders(),
  }));
}

// ─── Developer side ───────────────────────────────────────────────────────────

/** Solicitudes pendientes de aprobación */
export async function getDevWhitelistPending() {
  return _j(await fetch(`${API}/api/dev/whitelist/pending`, {
    credentials: 'include', headers: authHeaders(),
  }));
}

/** Todas las solicitudes (con filtro opcional por status) */
export async function getDevWhitelistAll(status) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return _j(await fetch(`${API}/api/dev/whitelist/all${qs}`, {
    credentials: 'include', headers: authHeaders(),
  }));
}

/** Aprobar una solicitud */
export async function approveWhitelistRequest(authId, comentario) {
  return _j(await fetch(`${API}/api/dev/whitelist/${authId}/approve`, {
    method: 'POST',
    credentials: 'include', headers: authHeaders(),
    body: JSON.stringify({ comentario: comentario || null }),
  }));
}

/** Rechazar una solicitud */
export async function rejectWhitelistRequest(authId, comentario) {
  return _j(await fetch(`${API}/api/dev/whitelist/${authId}/reject`, {
    method: 'POST',
    credentials: 'include', headers: authHeaders(),
    body: JSON.stringify({ comentario }),
  }));
}

/** Revocar un acceso aprobado */
export async function revokeWhitelistAccess(authId, reason) {
  return _j(await fetch(`${API}/api/dev/whitelist/${authId}/revoke`, {
    method: 'POST',
    credentials: 'include', headers: authHeaders(),
    body: JSON.stringify({ reason }),
  }));
}

/** Aprobar múltiples solicitudes a la vez */
export async function bulkApproveWhitelistRequests(authIds, comentario) {
  return _j(await fetch(`${API}/api/dev/whitelist/bulk-approve`, {
    method: 'POST',
    credentials: 'include', headers: authHeaders(),
    body: JSON.stringify({ auth_ids: authIds, comentario: comentario || null }),
  }));
}

// ─── Auto-Approve Rule ────────────────────────────────────────────────────────

export async function getAutoApproveRule() {
  return _j(await fetch(`${API}/api/dev/auto-approve-rule`, {
    credentials: 'include', headers: authHeaders(),
  }));
}

export async function saveAutoApproveRule(payload) {
  return _j(await fetch(`${API}/api/dev/auto-approve-rule`, {
    method: 'PUT',
    credentials: 'include', headers: authHeaders(),
    body: JSON.stringify(payload),
  }));
}

export async function simulateAutoApproveRule(payload) {
  return _j(await fetch(`${API}/api/dev/auto-approve-rule/simulate`, {
    method: 'POST',
    credentials: 'include', headers: authHeaders(),
    body: JSON.stringify(payload),
  }));
}

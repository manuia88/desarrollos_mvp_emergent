// Phase 14 · Batch 37 — Internal Users API helpers
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

// ─── Developer Internal Users ─────────────────────────────────────────────────

export async function inviteDevUser(payload) {
  return _j(await fetch(`${API}/api/dev/internal-users`, { method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(payload) }));
}
export async function getDevInternalUsers() {
  return _j(await fetch(`${API}/api/dev/internal-users`, { headers: h(), credentials: 'include' }));
}
export async function patchDevUser(email, patch) {
  return _j(await fetch(`${API}/api/dev/internal-users/${encodeURIComponent(email)}`, { method: 'PATCH', headers: h(), credentials: 'include', body: JSON.stringify(patch) }));
}
export async function suspendDevUser(email) {
  return _j(await fetch(`${API}/api/dev/internal-users/${encodeURIComponent(email)}`, { method: 'DELETE', headers: h(), credentials: 'include' }));
}
export async function resendDevInvitation(invitationId) {
  return _j(await fetch(`${API}/api/dev/internal-users/invitations/${invitationId}/resend`, { method: 'POST', headers: h(), credentials: 'include' }));
}
export async function setDevExternalInventory(enabled) {
  return _j(await fetch(`${API}/api/dev/settings/external-inventory`, { method: 'PUT', headers: h(), credentials: 'include', body: JSON.stringify({ enabled }) }));
}
export async function getDevMiniMarket() {
  return _j(await fetch(`${API}/api/dev/mini-market`, { headers: h(), credentials: 'include' }));
}

// ─── Inmobiliaria Internal Users ─────────────────────────────────────────────

export async function inviteInmUser(payload) {
  return _j(await fetch(`${API}/api/inmobiliaria/internal-users`, { method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(payload) }));
}
export async function getInmInternalUsers() {
  return _j(await fetch(`${API}/api/inmobiliaria/internal-users`, { headers: h(), credentials: 'include' }));
}
export async function patchInmUser(email, patch) {
  return _j(await fetch(`${API}/api/inmobiliaria/internal-users/${encodeURIComponent(email)}`, { method: 'PATCH', headers: h(), credentials: 'include', body: JSON.stringify(patch) }));
}
export async function suspendInmUser(email) {
  return _j(await fetch(`${API}/api/inmobiliaria/internal-users/${encodeURIComponent(email)}`, { method: 'DELETE', headers: h(), credentials: 'include' }));
}
export async function setInmExternalInventory(enabled) {
  return _j(await fetch(`${API}/api/inmobiliaria/settings/external-inventory`, { method: 'PUT', headers: h(), credentials: 'include', body: JSON.stringify({ enabled }) }));
}
export async function getInmMiniMarket() {
  return _j(await fetch(`${API}/api/inmobiliaria/mini-market`, { headers: h(), credentials: 'include' }));
}

// ─── Invitation Lookup (public) ───────────────────────────────────────────────

export async function lookupInvitation(token) {
  return _j(await fetch(`${API}/api/auth/in-house/invitation?token=${encodeURIComponent(token)}`, { credentials: 'include' }));
}
export async function acceptInvitation(token, name, password) {
  return _j(await fetch(`${API}/api/auth/in-house/accept-invitation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name, password: password || undefined }),
    credentials: 'include',
  }));
}

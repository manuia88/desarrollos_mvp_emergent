// Phase 14 · Batch 37 — Cross-Org Partnerships API helpers
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

export async function createCrossPartnership(payload) {
  return _j(await fetch(`${API}/api/cross-partnerships`, {
    method: 'POST', headers: h(), body: JSON.stringify(payload),
  }));
}

export async function getCrossPartnerships(role, status) {
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (status) params.set('status', status);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return _j(await fetch(`${API}/api/cross-partnerships${qs}`, { headers: h() }));
}

export async function approveCrossPartnership(partnershipId) {
  return _j(await fetch(`${API}/api/cross-partnerships/${partnershipId}/approve`, {
    method: 'POST', headers: h(), body: JSON.stringify({}),
  }));
}

export async function rejectCrossPartnership(partnershipId, reason) {
  return _j(await fetch(`${API}/api/cross-partnerships/${partnershipId}/reject`, {
    method: 'POST', headers: h(), body: JSON.stringify({ reason }),
  }));
}

export async function revokeCrossPartnership(partnershipId, reason) {
  return _j(await fetch(`${API}/api/cross-partnerships/${partnershipId}/revoke`, {
    method: 'POST', headers: h(), body: JSON.stringify({ reason }),
  }));
}

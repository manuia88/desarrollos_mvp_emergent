// Phase 18 · Batch 35 — Inmobiliaria entity API helpers (signup, AMPI,
// invitations, dev-partnerships).
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};
const post = (url, body) => j(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});
const patch = (url, body) => j(url, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

// Public — Signup + AMPI
export const verifyAmpiId   = (ampi_id) => post('/api/inmobiliaria/ampi-verify', { ampi_id });
export const inmobiliariaSignup = (payload) => post('/api/auth/inmobiliaria/signup', payload);

// Authenticated
export const getInmobiliariaMe = () => j('/api/inmobiliaria/me');

// Advisor invitations
export const inviteAdvisor = (payload) => post('/api/inmobiliaria/users/invite', payload);
export const listAdvisorRelationships = (status) =>
  j(`/api/inmobiliaria/advisor-relationships${status ? `?status=${status}` : ''}`);

// Developer partnerships
export const createDevPartnership = (payload) => post('/api/inmobiliaria/dev-partnerships', payload);
export const listDevPartnerships = (status) =>
  j(`/api/inmobiliaria/dev-partnerships${status ? `?status=${status}` : ''}`);
export const updateDevPartnershipStatus = (partnershipId, status) =>
  patch(`/api/inmobiliaria/dev-partnerships/${partnershipId}`, { status });

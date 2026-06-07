// Índices DMX (I04) — API client
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include' });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};

// Superadmin · terminal de los 5 índices por colonia
export const listIndices = ({ tier, limit } = {}) => {
  const qs = new URLSearchParams();
  if (tier) qs.set('tier', tier);
  if (limit) qs.set('limit', String(limit));
  const q = qs.toString();
  return j(`/api/superadmin/indices${q ? `?${q}` : ''}`);
};

// Público (tier-gated) · índices de una zona
export const getZoneIndices = (zoneId) => j(`/api/indices/zona/${encodeURIComponent(zoneId)}`);

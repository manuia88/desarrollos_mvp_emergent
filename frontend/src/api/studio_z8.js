// W5.22 Z.8 — Studio Landings API helpers
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};
const post = (url, body) =>
  j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const patch = (url, body) =>
  j(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const del = (url) => j(url, { method: 'DELETE' });

// ─── Portal (T2+) ─────────────────────────────────────────────────────────
export const createLanding = (body) => post('/api/studio/landing', body);
export const listLandings = ({ project_id = '', status = '', template_key = '', limit = 30, skip = 0 } = {}) => {
  const qs = new URLSearchParams();
  if (project_id) qs.set('project_id', project_id);
  if (status) qs.set('status', status);
  if (template_key) qs.set('template_key', template_key);
  qs.set('limit', String(limit));
  qs.set('skip', String(skip));
  return j(`/api/studio/landing/list?${qs.toString()}`);
};
export const getLanding = (id) => j(`/api/studio/landing/${id}`);
export const patchLanding = (id, body) => patch(`/api/studio/landing/${id}`, body);
export const publishLanding = (id, published = true) => post(`/api/studio/landing/${id}/publish`, { published });
export const deleteLanding = (id) => del(`/api/studio/landing/${id}`);
export const createABVariant = (id, variant_b_template_key) =>
  post(`/api/studio/landing/${id}/ab-variant`, { variant_b_template_key });
export const getABStats = (gid) => j(`/api/studio/landing/ab/${gid}/stats`);
export const declareWinner = (gid, winner_variant = null) =>
  post(`/api/studio/landing/ab/${gid}/declare-winner`, { winner_variant });
export const exportPdfUrl = (id) => `${API}/api/studio/landing/${id}/export-pdf`;

// ─── Public ───────────────────────────────────────────────────────────────
export const getPublicLanding = (slug, preview = false) =>
  j(`/api/landing/${slug}${preview ? '?preview=1' : ''}`);
export const submitPublicLead = (slug, payload) =>
  post(`/api/landing/${slug}/lead`, { payload });
export const trackPixelUrl = (slug) => `${API}/api/landing/${slug}/track?ts=${Date.now()}`;

// W5.22 Z.8 — Studio Landings API helpers (extended Z.8.2)
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

// ─── Z.8.2 · sections + tracking + catalog + starters + undo ──────────────
export const patchSections = (id, sections) => patch(`/api/studio/landing/${id}/sections`, { sections });
export const undoSections = (id) => post(`/api/studio/landing/${id}/undo`, {});
export const patchTrackingPixels = (id, pixels) => patch(`/api/studio/landing/${id}/tracking-pixels`, pixels);
export const getStarters = () => j('/api/studio/landing/starters');
export const listThemes = () => j('/api/studio/landing/themes');
export const catalogDevelopments = () => j('/api/studio/landing/catalog/developments');
export const catalogAsesor = () => j('/api/studio/landing/catalog/asesor');
export const catalogMarketplaceFilters = () => j('/api/studio/landing/catalog/marketplace-filters');

// ─── Public ───────────────────────────────────────────────────────────────
export const getPublicLanding = (slug, preview = false) =>
  j(`/api/landing/${slug}${preview ? '?preview=1' : ''}`);
export const submitPublicLead = (slug, payload) =>
  post(`/api/landing/${slug}/lead`, { payload });
export const trackPixelUrl = (slug) => `${API}/api/landing/${slug}/track?ts=${Date.now()}`;

// ─── Z.8.4 · Marketplace ──────────────────────────────────────────────────
export const queryMarketplace = (slug, params = {}) => {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.q) qs.set('q', params.q);
  if (params.cities?.length) qs.set('cities', params.cities.join(','));
  if (params.colonias?.length) qs.set('colonias', params.colonias.join(','));
  if (params.status?.length) qs.set('status', params.status.join(','));
  if (params.price_min != null) qs.set('price_min', String(params.price_min));
  if (params.price_max != null) qs.set('price_max', String(params.price_max));
  if (params.amenities?.length) qs.set('amenities', params.amenities.join(','));
  if (params.sort_by) qs.set('sort_by', params.sort_by);
  return j(`/api/landing/${slug}/marketplace?${qs.toString()}`);
};
export const updateMarketplaceConfig = (id, cfg) => patch(`/api/studio/landing/${id}/marketplace-config`, cfg);
export const previewMarketplace = (id, cfg) => post(`/api/studio/landing/${id || '_new'}/marketplace-preview`, cfg);

// ─── Z.8.5 · Property templates · Routing · Auto-fill ─────────────────────
export const listPropertyTemplates = () => j('/api/studio/landing/property-templates');
export const applyTemplateStructure = (id) => post(`/api/studio/landing/${id}/apply-template-structure`, {});
export const autoFillLanding = (id) => post(`/api/studio/landing/${id}/auto-fill`, {});
export const updateRoutingConfig = (id, cfg) => patch(`/api/studio/landing/${id}/routing-config`, cfg);
export const catalogResales = (limit = 30, skip = 0) => j(`/api/studio/landing/catalog/resales?limit=${limit}&skip=${skip}`);

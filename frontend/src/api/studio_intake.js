// W5.22 Z.8.7 Sub-B2 — Studio Property Intake API helpers
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

export const createIntake = (body) => post('/api/studio/property-intake', body);
export const getIntake = (id) => j(`/api/studio/property-intake/${id}`);
export const patchIntake = (id, patchObj) => patch(`/api/studio/property-intake/${id}`, { patch: patchObj });
export const listIntakes = ({ template_key, property_type, limit = 30, skip = 0 } = {}) => {
  const qs = new URLSearchParams();
  if (template_key) qs.set('template_key', template_key);
  if (property_type) qs.set('property_type', property_type);
  qs.set('limit', String(limit));
  qs.set('skip', String(skip));
  return j(`/api/studio/property-intake/list?${qs.toString()}`);
};
export const generateCopy = (intakeId, forceRegenerate = false) =>
  post(`/api/studio/property-intake/${intakeId}/generate-copy`, { intake_id: intakeId, force_regenerate: forceRegenerate });

// Z.8.7 Sub-D · publish toggle
export const publishIntake = (intakeId, published = true) =>
  post(`/api/studio/property-intake/${intakeId}/publish`, { published });

// Z.8.7 Sub-E · public lead capture (consumido por templates monolíticos)
export const submitIntakeLead = (slug, payload) => {
  return fetch(`${API}/api/studio/property-intake/public/${slug}/lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ payload: payload || {} }),
  }).then((r) => r.ok ? r.json() : Promise.reject(new Error('Lead no aceptado')));
};

// Attempt public-by-slug fetch · 404 graceful (Z.8.7 backend Sub-B1 sin endpoint publico aun)
export const getPublicIntakeBySlug = async (slug) => {
  try {
    return await j(`/api/studio/property-intake/public/${slug}`);
  } catch (e) {
    if (e.status === 404 || e.status === 405) return null;
    throw e;
  }
};

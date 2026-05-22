/**
 * W5.ASR.5 Parte 2 — API helpers para Lead Capture
 * Alias management · FB Lead Ads config · Stats superadmin
 */
const BASE = process.env.REACT_APP_BACKEND_URL;

const _get = (url) =>
  fetch(`${BASE}${url}`, { credentials: 'include' }).then((r) => r.json());

const _post = (url, body) =>
  fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  }).then((r) => r.json());

/** Asesor — listar aliases de captura de email */
export const listAliases = () => _get('/api/asesor/lead-capture/aliases');

/** Asesor — crear alias (idempotente) */
export const createAlias = (alias_slug = '') =>
  _post('/api/asesor/lead-capture/aliases', { alias_slug: alias_slug || undefined });

/** Asesor — listar configuraciones FB Lead Ads */
export const listFBConfigs = () => _get('/api/asesor/lead-capture/fb-config');

/** Asesor — registrar config FB Lead Ads */
export const createFBConfig = ({ fb_page_id, form_id, stub_mode = true }) =>
  _post('/api/asesor/lead-capture/fb-config', { fb_page_id, form_id, stub_mode });

/** Superadmin — estadísticas de captura */
export const getSourcesStats = (days = 30) =>
  _get(`/api/superadmin/lead-capture/stats?days=${days}`);


/** W5.x F7 — Behavioral score · cada 15s · fail-silent (404 retorna null) */
export const postLeadCaptureScore = async (body) => {
  try {
    const r = await fetch(`${BASE}/api/lead-capture/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

/** W5.x F7 — Submit lead capture · enriquece error con body.detail */
export const postLeadCapture = async (body) => {
  const r = await fetch(`${BASE}/api/lead-capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw Object.assign(new Error(data.detail || r.statusText), { status: r.status, body: data });
  }
  return r.json();
};


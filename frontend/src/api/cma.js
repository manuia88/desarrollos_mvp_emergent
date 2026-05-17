// W5.ASR.4 Parte 1 · CMA API client (asesor + public).
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
  j(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

// ─── Asesor (authenticated) ────────────────────────────────────────────────
export const generateCMA = (subject) =>
  post('/api/asesor/cma/generate', { subject });

export const listCMAs = ({ limit = 50, offset = 0 } = {}) =>
  j(`/api/asesor/cma/list?limit=${limit}&offset=${offset}`);

export const getCMA = (cmaId) =>
  j(`/api/asesor/cma/${cmaId}`);

// ─── Public (no auth) ──────────────────────────────────────────────────────
export const getPublicCMA = (cmaId) =>
  j(`/api/public/cma/${cmaId}`);

// Helper para construir URL pública compartible
export const publicCMAUrl = (cmaId) =>
  `${window.location.origin}/cma-publico/${cmaId}`;

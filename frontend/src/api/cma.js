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

// ─── W5.ASR.4 Parte 2 · PDF + Share meta ───────────────────────────────────
export const downloadCMAPdf = async (cmaId) => {
  const r = await fetch(`${API}/api/asesor/cma/${cmaId}/pdf`, { credentials: 'include' });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw Object.assign(new Error(e.detail || 'Error al generar PDF'), { status: r.status });
  }
  const blob = await r.blob();
  const cd = r.headers.get('Content-Disposition') || '';
  const m = /filename="([^"]+)"/.exec(cd);
  const filename = m ? m[1] : `CMA_${cmaId}.pdf`;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  return filename;
};

export const getCMAShareMeta = (cmaId) =>
  j(`/api/share/cma/${cmaId}/meta`);

export const cmaOgImageUrl = (cmaId) =>
  `${API}/api/share/cma/${cmaId}/og-image`;

// Helper para construir URL pública compartible
export const publicCMAUrl = (cmaId) =>
  `${window.location.origin}/cma-publico/${cmaId}`;

// W5.ASR.4 Parte 2 — URL con subdomain del asesor
export const subdomainCMAUrl = (slug, cmaId) =>
  `https://${slug}.asesores.desarrollosmx.io/cma/${cmaId}`;

/**
 * W5.23 — Battle Card API client.
 *
 * Wrappers sobre /api/dev/battle-card/{project_id}/*
 */
const API = process.env.REACT_APP_BACKEND_URL;

async function _fetch(path) {
  const res = await fetch(`${API}${path}`, { credentials: 'include' });
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body?.detail?.message || 'tier_locked');
    err.code = body?.detail?.code || 'tier_locked';
    err.status = 403;
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Error ${res.status}`);
  }
  return res.json();
}

/**
 * Datos completos de la Battle Card (score + dims + ranking + competidores + accion).
 * @param {string} projectId
 */
export async function getBattleCard(projectId) {
  return _fetch(`/api/dev/battle-card/${encodeURIComponent(projectId)}`);
}

/**
 * Top 3 competidores en la misma zona.
 * @param {string} projectId
 */
export async function getCompetitors(projectId) {
  return _fetch(`/api/dev/battle-card/${encodeURIComponent(projectId)}/competitors`);
}

/**
 * Timeline ranking historico.
 * @param {string} projectId
 * @param {number} weeks
 */
export async function getHistory(projectId, weeks = 12) {
  return _fetch(`/api/dev/battle-card/${encodeURIComponent(projectId)}/history?weeks=${weeks}`);
}

/**
 * Solo la recomendacion proxima accion.
 * @param {string} projectId
 */
export async function getRecommendation(projectId) {
  return _fetch(`/api/dev/battle-card/${encodeURIComponent(projectId)}/recommendation`);
}

/**
 * URL del PDF export (abrir en nueva pestana).
 * @param {string} projectId
 */
export function getPdfUrl(projectId) {
  return `${API}/api/dev/battle-card/${encodeURIComponent(projectId)}/export.pdf`;
}

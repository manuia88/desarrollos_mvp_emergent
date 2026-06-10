// Superadmin API helpers
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail?.message || body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};

// F2.1 · El Grafo del Comprador agregado de toda la ciudad (todos los devs, anónimo · k-anonimato).
export const getGrafoComprador     = (coloniaId) => j(`/api/superadmin/grafo-comprador${coloniaId ? `?colonia_id=${encodeURIComponent(coloniaId)}` : ''}`);
// F2.5 · El Cerebro del Mercado (cómo se califica vs la realidad + palancas aprendidas).
export const getCerebroMercado     = ()           => j('/api/superadmin/cerebro-mercado');
// F2.12 · La Terminal de Mercado CDMX (oferta + 3 índices vendibles + demanda + aprendizaje · k-anónimo).
export const getTerminalMercado    = (top = 8)    => j(`/api/superadmin/terminal-mercado?top=${top}`);
// F5.1 · Ranking de Bancabilidad de todos los proyectos (producto de datos para bancos/fondos).
export const getBancabilidadRanking = (top = 50)  => j(`/api/superadmin/bancabilidad?top=${top}`);
export const listDataSources       = ()   => j('/api/superadmin/data-sources');
export const getDataSourcesStats   = ()   => j('/api/superadmin/data-sources/stats');
// Cobertura de Datos · qué receta alimenta qué, de qué fuente, en qué estado, cómo conectarla
export const getRecipesCoverage    = ()   => j('/api/superadmin/recipes-coverage');
export const getDataSource         = (id) => j(`/api/superadmin/data-sources/${id}`);
export const listIngestionJobs     = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([_, v]) => v != null)).toString();
  return j(`/api/superadmin/ingestion-jobs${qs ? `?${qs}` : ''}`);
};
export const listSourceUploads     = (id) => j(`/api/superadmin/data-sources/${id}/uploads`);
export const listRecentUploads     = ()   => j('/api/superadmin/uploads/recent');

// Phase A2 mutations
export const updateCredentials = (id, body) => j(`/api/superadmin/data-sources/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
export const testConnection = (id) => j(`/api/superadmin/data-sources/${id}/test`, { method: 'POST' });
export const syncSource     = (id) => j(`/api/superadmin/data-sources/${id}/sync`, { method: 'POST' });

// Phase A4
export const triggerCron    = (job) => j('/api/superadmin/cron/trigger', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ job }),
});
export const getUpload      = (id) => j(`/api/superadmin/uploads/${id}`);
export const reprocessUpload = (id) => j(`/api/superadmin/uploads/${id}/process`, { method: 'POST' });
export const downloadUploadUrl = (id) => `${API}/api/superadmin/uploads/${id}/download`;

// Phase B3 — scores admin
export const listScores = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([_, v]) => v != null && v !== '')).toString();
  return j(`/api/superadmin/scores${qs ? `?${qs}` : ''}`);
};
export const listRecipes = () => j('/api/superadmin/scores/recipes');
export const scoreHistory = (zoneId, code) => j(`/api/superadmin/scores/history?zone_id=${encodeURIComponent(zoneId)}&code=${encodeURIComponent(code)}`);
export const recomputeAll = (body = {}) => j('/api/superadmin/scores/recompute-all', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ allow_paid: false, include_colonia: true, include_proyecto: true, ...body }),
});
export const recomputeAllStatus = (taskId) => j(`/api/superadmin/scores/recompute-all/status${taskId ? `?task_id=${taskId}` : ''}`);
export const recomputeZone = (zoneId, codes = [], allowPaid = false) => j('/api/superadmin/scores/recompute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ zone_id: zoneId, codes, allow_paid: allowPaid }),
});

/**
 * W5.12 Parte 2 — Knowledge Graph API client.
 * Endpoints superadmin only (auth via session cookie).
 */
const API = process.env.REACT_APP_BACKEND_URL;

async function _get(url) {
  const r = await fetch(`${API}${url}`, { credentials: 'include' });
  let body = {};
  try { body = await r.json(); } catch (_) { body = {}; }
  return { ok: r.ok, status: r.status, body };
}

async function _post(url, payload) {
  const r = await fetch(`${API}${url}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  let body = {};
  try { body = await r.json(); } catch (_) { body = {}; }
  return { ok: r.ok, status: r.status, body };
}

export const getKgHealth      = () => _get('/api/superadmin/kg/health');
export const getKgStats       = () => _get('/api/superadmin/kg/stats');
export const getKgTemplates   = () => _get('/api/superadmin/kg/templates');
export const runKgQuery       = (template, params) => _post('/api/superadmin/kg/query', { template, params });
export const getKgSubgraph    = (node_id, depth = 1, node_type) => {
  const qs = new URLSearchParams({ node_id, depth: String(depth) });
  if (node_type) qs.set('node_type', node_type);
  return _get(`/api/superadmin/kg/subgraph?${qs.toString()}`);
};
export const getKgAnomalies   = ({ severity, type, limit = 50, skip = 0 } = {}) => {
  const qs = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  if (severity) qs.set('severity', severity);
  if (type) qs.set('type', type);
  return _get(`/api/superadmin/kg/anomalies?${qs.toString()}`);
};
export const triggerKgRebuild = () => _post('/api/superadmin/kg/trigger-rebuild');
export const triggerKgAnomaly = () => _post('/api/superadmin/kg/trigger-anomaly');

export default {
  getKgHealth, getKgStats, getKgTemplates, runKgQuery, getKgSubgraph,
  getKgAnomalies, triggerKgRebuild, triggerKgAnomaly,
};

/**
 * Phase 4 Batch 20 — Asesor metrics + tracking links + funnel/sankey API
 * (Plus B21: Tour completion + Team productivity + Team aggregated)
 */
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, {
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json', ...(opts.headers || {}) } : (opts.headers || {}),
    ...opts,
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};

// Batch 21
export const getTourCompletion = (period = '30d') =>
  j(`/api/metrics/tour-completion?period=${period}`);

export const getTeamProductivity = (period = '30d') =>
  j(`/api/metrics/team-productivity?period=${period}`);

export const getTeamAggregated = (period = '30d') =>
  j(`/api/metrics/team-aggregated?period=${period}`);

// Batch 20 — Asesor metrics
export const getAsesorMetrics = (period = '30d') =>
  j('/api/asesor/metrics/me?period=' + period);

export const getAsesorTeamMetrics = (period = '30d') =>
  j('/api/asesor/metrics/team?period=' + period);

export const getAsesorTimeseries = (asesorId, period = '90d') =>
  j(`/api/asesor/metrics/${asesorId}/timeseries?period=${period}`);

// Batch 20 — Tracking links
export const listLinks = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return j('/api/asesor/links' + (qs ? '?' + qs : ''));
};

export const postLink = (payload) =>
  j('/api/asesor/links', { method: 'POST', body: JSON.stringify(payload) });

export const deleteLink = (linkId) =>
  j(`/api/asesor/links/${linkId}`, { method: 'DELETE' });

// Batch 20 — Funnel + Sankey
export const getFunnel = (projectId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return j(`/api/funnel/${projectId}` + (qs ? '?' + qs : ''));
};

export const getFunnelBreakdown = (projectId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return j(`/api/funnel/${projectId}/breakdown` + (qs ? '?' + qs : ''));
};

export const getFunnelSuggestion = (projectId, period = '30d') =>
  j(`/api/funnel/${projectId}/suggestion?period=${period}`);

export const getSankey = (projectId, period = '30d') =>
  j(`/api/sankey/attribution?project_id=${projectId}&period=${period}`);

export default {
  getTourCompletion, getTeamProductivity, getTeamAggregated,
  getAsesorMetrics, getAsesorTeamMetrics, getAsesorTimeseries,
  listLinks, postLink, deleteLink,
  getFunnel, getFunnelBreakdown, getFunnelSuggestion, getSankey,
};

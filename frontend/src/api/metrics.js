/**
 * Phase 4 Batch 20 — Asesor metrics + tracking links + funnel/sankey API.
 */
const API = process.env.REACT_APP_BACKEND_URL;

async function j(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const getTeamProductivity = (period = '30d') =>
  j('/api/metrics/team-productivity?period=' + period);

export const getTeamAggregated = (period = '30d') =>
  j('/api/metrics/team-aggregated?period=' + period);

// Batch 20
export const getAsesorMetrics = (period = '30d') =>
  j('/api/asesor/metrics/me?period=' + period);

export const getAsesorTeamMetrics = (period = '30d') =>
  j('/api/asesor/metrics/team?period=' + period);

export const getAsesorTimeseries = (asesorId, period = '90d') =>
  j(`/api/asesor/metrics/${asesorId}/timeseries?period=${period}`);

export const listLinks = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return j('/api/asesor/links' + (qs ? '?' + qs : ''));
};

export const postLink = (payload) =>
  j('/api/asesor/links', { method: 'POST', body: JSON.stringify(payload) });

export const deleteLink = (linkId) =>
  j(`/api/asesor/links/${linkId}`, { method: 'DELETE' });

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
  getTeamProductivity, getTeamAggregated,
  getAsesorMetrics, getAsesorTeamMetrics, getAsesorTimeseries,
  listLinks, postLink, deleteLink,
  getFunnel, getFunnelBreakdown, getFunnelSuggestion, getSankey,
};

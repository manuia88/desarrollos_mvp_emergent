/**
 * Phase 4 Batch 21 — Team metrics API.
 */
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};

/** Sub-A · GET /api/metrics/tour-completion?period=30d */
export const getTourCompletion = (period = '30d') =>
  j(`/api/metrics/tour-completion?period=${period}`);

/** Sub-B · GET /api/metrics/team-productivity?period=30d */
export const getTeamProductivity = (period = '30d') =>
  j(`/api/metrics/team-productivity?period=${period}`);

/** Sub-C · GET /api/metrics/team-aggregated?period=30d */
export const getTeamAggregated = (period = '30d') =>
  j(`/api/metrics/team-aggregated?period=${period}`);

export default { getTourCompletion, getTeamProductivity, getTeamAggregated };

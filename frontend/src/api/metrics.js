/**
 * Phase 4 Batch 21 — Team metrics API.
 */
const API = process.env.REACT_APP_BACKEND_URL;

async function j(path) {
  const res = await fetch(`${API}${path}`, { credentials: 'include' });
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

export default { getTeamProductivity, getTeamAggregated };

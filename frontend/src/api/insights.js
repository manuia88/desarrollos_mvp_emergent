/**
 * Phase 4 Batch 22 — Project Insights API client.
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

export const getInsightsResumen = (projectId) =>
  j(`/api/dev/projects/${projectId}/insights/resumen`);

export const getInsightsMarketValue = (projectId) =>
  j(`/api/dev/projects/${projectId}/insights/market-value`);

export const getInsightsEngagement = (projectId, period = '30d') =>
  j(`/api/dev/projects/${projectId}/insights/engagement?period=${period}`);

export const getInsightsComparables = (projectId, topN = 5) =>
  j(`/api/dev/projects/${projectId}/insights/comparables?top_n=${topN}`);

export const getInsightsPredictions = (projectId) =>
  j(`/api/dev/projects/${projectId}/insights/ai/predictions`);

export const getInsightsRecommendations = (projectId) =>
  j(`/api/dev/projects/${projectId}/insights/ai/recommendations`);

export const getInsightsNarrative = (projectId, period = '30d', force = false) =>
  j(`/api/dev/projects/${projectId}/insights/ai/narrative?period=${period}${force ? '&force=true' : ''}`);

export const exportComparablesUrl = (projectId, format = 'csv', topN = 5) => {
  const API_BASE = process.env.REACT_APP_BACKEND_URL;
  return `${API_BASE}/api/dev/projects/${projectId}/insights/comparables/export?format=${format}&top_n=${topN}`;
};

export async function downloadComparables(projectId, format = 'csv', topN = 5) {
  const url = exportComparablesUrl(projectId, format, topN);
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `comparables-${projectId}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export default {
  getInsightsResumen,
  getInsightsEngagement,
  getInsightsComparables,
  getInsightsPredictions,
  getInsightsRecommendations,
  getInsightsNarrative,
};

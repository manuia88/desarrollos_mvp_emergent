/**
 * Batch 21 Sub-A — Metrics API helpers
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

/** GET /api/metrics/tour-completion?period=30d */
export const getTourCompletion = (period = '30d') =>
  j(`/api/metrics/tour-completion?period=${period}`);

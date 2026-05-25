// W5.22 Z.5 — Hook Predictor API wrappers (3 endpoints).
// Reusa fetch + credentials include · NO depende de axios.
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
  j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

export const scoreHook = ({ text, target_audience }) =>
  post('/api/hook-predictor/score', { text, target_audience: target_audience || null });

export const getHookStats = (days = 30) =>
  j(`/api/hook-predictor/stats?days=${encodeURIComponent(days)}`);

export const getHookStatsGlobal = (days = 30) =>
  j(`/api/superadmin/hook-predictor/stats-global?days=${encodeURIComponent(days)}`);

// Phase 4 Batch 0.5 — Diagnostic API helpers
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};
const post = (url, body) => j(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});
const patch = (url, body) => j(url, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

// Project diagnostics
export const runProjectDiagnostic = (pid, scope = 'all', modules = null) =>
  post(`/api/dev/projects/${pid}/diagnostic/run`, { scope, modules });
export const getLatestDiagnostic = (pid) =>
  j(`/api/dev/projects/${pid}/diagnostic/latest`);
export const getDiagnosticHistory = (pid, limit = 20) =>
  j(`/api/dev/projects/${pid}/diagnostic/history?limit=${limit}`);
export const runAutoFix = (pid, actionId) =>
  post(`/api/dev/projects/${pid}/diagnostic/auto-fix/${actionId}`);
export const aiRecommendProbe = (pid, probeInfo) =>
  post(`/api/dev/projects/${pid}/diagnostic/ai-recommend`, probeInfo);
export const listProbeRegistry = () =>
  j('/api/dev/diagnostic/probe-registry');

// User diagnostics
export const runUserDiagnostic = (uid) =>
  post(`/api/diagnostic/user/${uid}/run`);
export const getUserDiagnosticLatest = (uid) =>
  j(`/api/diagnostic/user/${uid}/latest`);

// Problem reports
export const createProblemReport = (payload) =>
  post('/api/diagnostic/problem-reports', payload);
export const listProblemReports = (status = null) =>
  j(`/api/superadmin/problem-reports${status ? `?status=${status}` : ''}`);
export const getProblemReport = (rid) =>
  j(`/api/superadmin/problem-reports/${rid}`);
export const patchProblemReport = (rid, body) =>
  patch(`/api/superadmin/problem-reports/${rid}`, body);

// Superadmin dashboards
export const getSystemMap = () => j('/api/superadmin/system-map');
export const getProbeRecurrence = (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== '')
  ).toString();
  return j(`/api/superadmin/probe-recurrence${qs ? `?${qs}` : ''}`);
};
export const getPerOrgDashboard = () => j('/api/superadmin/diagnostics/per-org');

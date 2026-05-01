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

export const listDataSources       = ()   => j('/api/superadmin/data-sources');
export const getDataSourcesStats   = ()   => j('/api/superadmin/data-sources/stats');
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

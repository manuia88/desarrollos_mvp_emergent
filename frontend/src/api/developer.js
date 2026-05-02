// Developer portal API helpers
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};
const post = (url, body) => j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const patch = (url, body) => j(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const del = (url) => j(url, { method: 'DELETE' });

export const getDashboard = () => j('/api/desarrollador/dashboard');
export const listInventory = (devId) => j(`/api/desarrollador/inventario${devId ? `?dev_id=${devId}` : ''}`);
export const patchUnitStatus = (b) => patch('/api/desarrollador/inventario/unit-status', b);
export const getDemand = () => j('/api/desarrollador/demanda');
export const generateReport = (month) => post(`/api/desarrollador/reportes/generar${month ? `?month=${month}` : ''}`);
export const listReports = () => j('/api/desarrollador/reportes');
export const listPricing = () => j('/api/desarrollador/pricing/suggestions');
export const actPricing = (id, body) => patch(`/api/desarrollador/pricing/suggestions/${id}`, body);
export const getCompetitors = (devId, radius) => {
  const qs = new URLSearchParams({ ...(devId ? { dev_id: devId } : {}), ...(radius ? { radius_km: radius } : {}) }).toString();
  return j(`/api/desarrollador/competidores?${qs}`);
};
export const ackCompetitor = (b) => post('/api/desarrollador/competidores/alert-ack', b);
export const getAudit = () => j('/api/desarrollador/audit');

// Phase 4 Batch 1 — Bulk Upload
export const bulkUploadParse = (formData) => j('/api/dev/bulk-upload/parse', { method: 'POST', body: formData });
export const bulkUploadCommit = (b) => post('/api/dev/bulk-upload/commit', b);
export const listBulkJobs = () => j('/api/dev/bulk-upload/jobs');

// Phase 4 Batch 1 — Unit Holds
export const createHold = (unitId, b) => post(`/api/dev/units/${unitId}/hold`, b);
export const releaseHold = (unitId, devId) => del(`/api/dev/units/${unitId}/hold?dev_id=${devId}`);
export const getHold = (unitId) => j(`/api/dev/units/${unitId}/hold`);
export const listHolds = (devId) => j(`/api/dev/holds${devId ? `?dev_id=${devId}` : ''}`);

// Phase 4 Batch 1 — Internal Users
export const listInternalUsers = () => j('/api/dev/internal-users');
export const createInternalUser = (b) => post('/api/dev/internal-users', b);
export const patchInternalUser = (id, b) => patch(`/api/dev/internal-users/${id}`, b);
export const deleteInternalUser = (id) => del(`/api/dev/internal-users/${id}`);

// Phase 4 Batch 1 — Org Settings
export const getOrgSettings = () => j('/api/dev/org/settings');
export const patchOrgSettings = (b) => patch('/api/dev/org/settings', b);

// Phase 4 Batch 1 — ERP Webhooks
export const listErpWebhooks = () => j('/api/dev/erp-webhooks');
export const createErpWebhook = (b) => post('/api/dev/erp-webhooks', b);
export const patchErpWebhook = (id, b) => patch(`/api/dev/erp-webhooks/${id}`, b);
export const listErpEvents = (provider) => j(`/api/dev/erp-webhooks/${provider}/events`);

// Phase 4 Batch 1 — Content Calendar
export const submitContent = (b) => post('/api/dev/content/upload', b);
export const listContent = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString();
  return j(`/api/dev/content${qs ? `?${qs}` : ''}`);
};
export const approveContent = (id, b) => post(`/api/dev/content/${id}/approve`, b || {});
export const rejectContent = (id, b) => post(`/api/dev/content/${id}/reject`, b || {});
export const publishContent = (id) => post(`/api/dev/content/${id}/publish`);

// Phase 4 Batch 1 — Geolocation
export const saveProjectLocation = (projectId, b) => patch(`/api/dev/projects/${projectId}/location`, b);
export const listProjects = () => j('/api/dev/projects');

// Phase 4 Batch 2 — Project location read
export const getProjectLocation = (projectId) => j(`/api/dev/projects/${projectId}/location`);

// Phase 4 Batch 2 — Absorption + Forecast analytics
export const getAbsorptionAnalytics = (projectId) => j(`/api/dev/analytics/absorption${projectId ? `?project_id=${projectId}` : ''}`);
export const getForecast = (consolidated) => j(`/api/dev/analytics/forecast${consolidated ? '?consolidated=true' : ''}`);
export const adjustForecast = (b) => post('/api/dev/analytics/forecast/adjust', b);

// Phase 4 Batch 2 — Competitor enriched
export const getCompetitorsEnriched = (devId, radius) => {
  const qs = new URLSearchParams({ ...(devId ? { dev_id: devId } : {}), ...(radius ? { radius_km: radius } : {}) }).toString();
  return j(`/api/dev/competitors/enriched${qs ? `?${qs}` : ''}`);
};
export const getCompetitorHistory = (compId) => j(`/api/dev/competitors/${compId}/history`);
export const saveAlertConfig = (b) => post('/api/dev/competitors/alert-config', b);

// Phase 4 Batch 2 — IE breakdown + drill-down
export const getIEBreakdown = (projectId) => j(`/api/dev/ie/projects/${projectId}/breakdown`);
export const getIEImprove = (projectId, code) => j(`/api/dev/ie/projects/${projectId}/improve?code=${encodeURIComponent(code)}`);

// Phase 4 Batch 2 — Construction progress
export const getConstructionProgress = (projectId) => j(`/api/dev/construction/${projectId}/progress`);
export const updateConstructionStage = (projectId, b) => post(`/api/dev/construction/${projectId}/update-stage`, b);
export const addConstructionComment = (projectId, b) => post(`/api/dev/construction/${projectId}/comment`, b);

// Phase 4 Batch 2.1 — Colonia benchmark + notifications + per-unit progress + simulate
export const getColoniaBenchmark = (projectId) => j(`/api/dev/ie/projects/${projectId}/colonia-benchmark`);
export const simulateCompetitorPrice = (competitorId, deltaPct) => post(`/api/dev/competitors/${competitorId}/simulate-price-update`, { delta_pct: deltaPct });
export const listNotifications = (unreadOnly = false) => j(`/api/dev/notifications${unreadOnly ? '?unread_only=true' : ''}`);
export const markNotificationRead = (nid) => post(`/api/dev/notifications/${nid}/read`);
export const markAllNotificationsRead = () => post('/api/dev/notifications/mark-all-read');
export const updateUnitProgress = (projectId, b) => post(`/api/dev/construction/${projectId}/unit-update`, b);

// Phase 4 Batch 3 — Internal user invitations + GeoJSON export
export const verifyInvitation = (token) => j(`/api/dev/invitations/${token}/verify`);
export const acceptInvitation = (token, b) => post(`/api/dev/invitations/${token}/accept`, b);
export const internalLogin = (email, password) => post('/api/auth/internal/login', { email, password });
export const getProjectGeoJsonUrl = (projectId) => `${process.env.REACT_APP_BACKEND_URL}/api/dev/projects/${projectId}/export/geojson`;

// Phase 4 Batch 4 — Leads + project brokers
export const createLead = (b) => post('/api/dev/leads', b);
export const listLeads = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return j(`/api/dev/leads${qs ? `?${qs}` : ''}`);
};
export const patchLead = (id, b) => fetch(`${process.env.REACT_APP_BACKEND_URL}/api/dev/leads/${id}`, {
  method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
}).then(async r => { const d = await r.json(); if (!r.ok) { const e = new Error(d.detail || r.statusText); e.body = d; e.status = r.status; throw e; } return d; });
export const appendLeadNote = (id, text) => post(`/api/dev/leads/${id}/note`, { text });
export const assignLead = (id, user_id) => post(`/api/dev/leads/${id}/assign`, { user_id });
export const moveLeadColumn = (id, target_status) => post(`/api/dev/leads/${id}/move-column`, { target_status });
export const getLeadsKanban = (projectId) => j(`/api/dev/leads/kanban${projectId ? `?project_id=${projectId}` : ''}`);
export const getLeadsAnalytics = (projectId) => j(`/api/dev/leads/analytics${projectId ? `?project_id=${projectId}` : ''}`);
export const listProjectBrokers = (projectId, includeRevoked) => j(`/api/dev/projects/${projectId}/brokers${includeRevoked ? '?include_revoked=true' : ''}`);
export const assignProjectBroker = (projectId, b) => post(`/api/dev/projects/${projectId}/brokers`, b);
export const patchProjectBroker = (projectId, rowId, b) => fetch(`${process.env.REACT_APP_BACKEND_URL}/api/dev/projects/${projectId}/brokers/${rowId}`, {
  method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
}).then(async r => { const d = await r.json(); if (!r.ok) { const e = new Error(d.detail || r.statusText); e.body = d; e.status = r.status; throw e; } return d; });
export const revokeProjectBroker = (projectId, rowId) => fetch(`${process.env.REACT_APP_BACKEND_URL}/api/dev/projects/${projectId}/brokers/${rowId}`, {
  method: 'DELETE', credentials: 'include',
}).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(d.detail || r.statusText); e.body = d; e.status = r.status; throw e; } return d; });


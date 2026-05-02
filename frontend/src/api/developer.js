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


// Phase 4 Batch 4.1 — Cita Registration + DMX Inmobiliaria + Anti-fraude
export const createCita = (b) => post('/api/cita', b);
export const getSlotAvailability = (projectId, date) => j(`/api/projects/${projectId}/slots/availability?date=${date}`);
export const configureSlots = (projectId, slots) => post(`/api/dev/projects/${projectId}/slots`, { slots });
export const getAsesorCitas = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return j(`/api/asesor/citas${qs ? `?${qs}` : ''}`);
};
export const getDevCitas = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return j(`/api/dev/citas${qs ? `?${qs}` : ''}`);
};
export const patchCita = (id, b) => fetch(`${process.env.REACT_APP_BACKEND_URL}/api/cita/${id}`, {
  method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
}).then(async r => { const d = await r.json(); if (!r.ok) { const e = new Error(JSON.stringify(d.detail) || r.statusText); e.body = d; e.status = r.status; throw e; } return d; });
export const getCitaWaTemplate = (id, type = 'success') => j(`/api/cita/${id}/wa-template?type=${type}`);
export const approveLeadReview = (id) => post(`/api/dev/leads/${id}/approve-review`);
export const rejectLeadReview = (id) => post(`/api/dev/leads/${id}/reject-review`);
// Inmobiliaria
export const listInmobiliarias = () => j('/api/inmobiliaria/list');
export const createInmAsesor = (b) => post('/api/inmobiliaria/asesores', b);
export const listInmAsesores = (inmId = 'dmx_root') => j(`/api/inmobiliaria/asesores?inmobiliaria_id=${inmId}`);
export const patchInmAsesor = (id, b) => fetch(`${process.env.REACT_APP_BACKEND_URL}/api/inmobiliaria/asesores/${id}`, {
  method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
}).then(async r => { const d = await r.json(); if (!r.ok) { const e = new Error(d.detail || r.statusText); e.body = d; e.status = r.status; throw e; } return d; });
export const disableInmAsesor = (id) => fetch(`${process.env.REACT_APP_BACKEND_URL}/api/inmobiliaria/asesores/${id}`, {
  method: 'DELETE', credentials: 'include',
}).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(d.detail || r.statusText); e.body = d; e.status = r.status; throw e; } return d; });
export const getInmobiliariaDashboard = (period = '30d', inmId = 'dmx_root') =>
  j(`/api/inmobiliaria/dashboard?period=${period}&inmobiliaria_id=${inmId}`);


// Phase 4 Batch 4.4 — Analytics
export const getDevAnalyticsCancelReasons = (period = '30d', projectId) =>
  j(`/api/dev/analytics/cancel-reasons?period=${period}${projectId ? `&project_id=${projectId}` : ''}`);
export const getInmAnalyticsCancelReasons = (period = '30d', projectId) =>
  j(`/api/inmobiliaria/analytics/cancel-reasons?period=${period}${projectId ? `&project_id=${projectId}` : ''}`);
export const getDevMovementAlerts = (period = '30d') =>
  j(`/api/dev/analytics/movement-alerts?period=${period}`);
export const getHeatCohort = (period = '30d', projectId) =>
  j(`/api/dev/analytics/heat-cohort?period=${period}${projectId ? `&project_id=${projectId}` : ''}`);

// Phase 4 Batch 6 — Demand Heatmap + Engagement Analytics
export const getDemandHeatmap = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return j(`/api/dev/analytics/demand-heatmap${qs ? `?${qs}` : ''}`);
};
export const getEngagementUnits = (projectId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return j(`/api/dev/projects/${projectId}/engagement-units${qs ? `?${qs}` : ''}`);
};
export const getEngagementUnitTimeline = (projectId, unitId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return j(`/api/dev/projects/${projectId}/engagement-units/${unitId}/timeline${qs ? `?${qs}` : ''}`);
};

// Phase 4 Batch 7 — Site Selection AI
export const createSiteStudy = (b) => post('/api/dev/site-selection/studies', b);
export const runSiteStudy = (id) => post(`/api/dev/site-selection/studies/${id}/run`);
export const listSiteStudies = (status) =>
  j(`/api/dev/site-selection/studies${status ? `?status=${status}` : ''}`);
export const getSiteStudy = (id) => j(`/api/dev/site-selection/studies/${id}`);
export const exportSiteStudyPdf = (id) => post(`/api/dev/site-selection/studies/${id}/export-pdf`);
export const siteStudyDownloadUrl = (fileId) =>
  `${process.env.REACT_APP_BACKEND_URL}/api/dev/site-selection/files/${fileId}`;
// Phase 4 Batch 7.1
export const compareSiteStudies = (ids) =>
  j(`/api/dev/site-selection/studies/compare?ids=${encodeURIComponent(ids.join(','))}`);
export const simulateExpansion = (studyId, body) =>
  post(`/api/dev/site-selection/studies/${studyId}/simulate`, body);
export const getExpansionSimulation = (simId) =>
  j(`/api/dev/site-selection/simulations/${simId}`);
export const listExpansionSimulations = (studyId) =>
  j(`/api/dev/site-selection/studies/${studyId}/simulations`);
export const exportSimulationPdf = (simId) =>
  post(`/api/dev/site-selection/simulations/${simId}/export-pdf`);

// Phase 4 Batch 8 — Cash Flow Forecast IA
export const recalcCashFlow = (projectId, body = {}) =>
  post(`/api/dev/projects/${projectId}/cash-flow/recalc`, body);
export const getCashFlowCurrent = (projectId) =>
  j(`/api/dev/projects/${projectId}/cash-flow/current`);
export const getCashFlowHistory = (projectId) =>
  j(`/api/dev/projects/${projectId}/cash-flow/history`);
export const getCashFlowScenarios = (projectId) =>
  j(`/api/dev/projects/${projectId}/cash-flow/scenarios`);
export const getCashFlowRecommendations = (projectId) =>
  j(`/api/dev/projects/${projectId}/cash-flow/recommendations`);
export const applyCashFlowRecommendation = (projectId, body) =>
  post(`/api/dev/projects/${projectId}/cash-flow/recommendations/apply`, body);
export const exportCashFlowPdf = (projectId) =>
  post(`/api/dev/projects/${projectId}/cash-flow/export-pdf`);
export const cashFlowDownloadUrl = (projectId, fileId) =>
  `${process.env.REACT_APP_BACKEND_URL}/api/dev/projects/${projectId}/cash-flow/files/${fileId}`;

// Phase 4 Batch 10 — Mis Proyectos
export const listProjectsWithStats = () => j('/api/dev/projects/list-with-stats');
export const getProjectSummary = (projectId) => j(`/api/dev/projects/${projectId}/summary`);

// Phase 4 Batch 11 — Amenidades, Comercialización, Unit Drawer
export const getProjectAmenities = (pid) => j(`/api/dev/projects/${pid}/amenities`);
export const patchProjectAmenities = (pid, b) => patch(`/api/dev/projects/${pid}/amenities`, b);
export const getCommercialization = (pid) => j(`/api/dev/projects/${pid}/commercialization`);
export const patchCommercialization = (pid, b) => patch(`/api/dev/projects/${pid}/commercialization`, b);
export const listBrokers = (pid) => j(`/api/dev/projects/${pid}/brokers`);
export const assignBroker = (pid, b) => post(`/api/dev/projects/${pid}/brokers`, b);
export const patchBroker = (pid, brokerId, b) => patch(`/api/dev/projects/${pid}/brokers/${brokerId}`, b);
export const listPreassignments = (pid) => j(`/api/dev/projects/${pid}/preassignments`);
export const createPreassignment = (pid, b) => post(`/api/dev/projects/${pid}/preassignments`, b);
export const deletePreassignment = (pid, userId) => del(`/api/dev/projects/${pid}/preassignments/${userId}`);
export const getUnitPriceHistory = (devId, unitId) => j(`/api/dev/units/${devId}/${unitId}/price-history`);
export const getUnitComparables = (devId, unitId) => j(`/api/dev/units/${devId}/${unitId}/comparables`);
export const getUnitMarketComparables = (devId, unitId) => j(`/api/dev/units/${devId}/${unitId}/market-comparables`);
export const getUnitAIPrediction = (devId, unitId) => post(`/api/dev/units/${devId}/${unitId}/ai-prediction`, {});
export const patchUnit = (devId, unitId, b) => patch(`/api/dev/units/${devId}/${unitId}`, b);
export const getUnitEngagement = (devId, unitId) => j(`/api/dev/units/${devId}/${unitId}/engagement`);
export const listDevAssets = (devId, type) => j(`/api/developments/${devId}/assets${type ? `?asset_type=${type}` : ''}`);
export const listDevDocuments = (devId, type) => j(`/api/desarrollador/developments/${devId}/documents${type ? `?doc_type=${type}` : ''}`);
export const uploadDevDocument = (devId, formData) => j(`/api/desarrollador/developments/${devId}/documents/upload`, { method: 'POST', body: formData });





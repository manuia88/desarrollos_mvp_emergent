// Universal Leads API — Phase 4 Batch 4.2
// Used by all kanban surfaces (asesor, dev, inmobiliaria) with scope-aware permission tiers.
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

const qs = (obj) => {
  const usp = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') usp.append(k, v);
  });
  const s = usp.toString();
  return s ? `?${s}` : '';
};

// ─── Universal Kanban ─────────────────────────────────────────────────────
// scope: 'mine' | 'all_org' | 'all_inmobiliaria'
export const getKanban = (params = {}) => j(`/api/leads/kanban${qs(params)}`);

// ─── Universal Lead Detail ────────────────────────────────────────────────
export const getLead = (leadId) => j(`/api/leads/${leadId}`);

// ─── Universal Move Column ────────────────────────────────────────────────
export const moveColumn = (leadId, targetStatus) =>
  post(`/api/leads/${leadId}/move-column`, { target_status: targetStatus });

// ─── Conditional Sections (403 if no permission) ──────────────────────────
export const getConversation = (leadId) => j(`/api/leads/${leadId}/conversation`);
export const getAiSummary = (leadId) => j(`/api/leads/${leadId}/ai-summary`);

// ─── Cross-project View ───────────────────────────────────────────────────
export const getClientLeads = (clientGid) => j(`/api/clients/${clientGid}/leads`);

// ─── Phase 4 Batch 4.3 — Cita lifecycle ───────────────────────────────────
export const citaPostAction = (apptId, action, extra = {}) =>
  post(`/api/cita/${apptId}/post-action`, { action, ...extra });

export const leadPostRealizadaFollowup = (leadId, has_proposal, notes = null) =>
  post(`/api/leads/${leadId}/post-realizada-followup`, { has_proposal, notes });

// ─── Phase 4 Batch 4.4 — AI Engine ────────────────────────────────────────
export const recalcHeat = (leadId) => post(`/api/leads/${leadId}/recalc-heat`, {});
export const getHeat = (leadId) => j(`/api/leads/${leadId}/heat`);
export const getAiSummaryV2 = (leadId) => j(`/api/leads/${leadId}/ai-summary-v2`);
export const refreshAiSummary = (leadId) => post(`/api/leads/${leadId}/refresh-ai-summary`, {});

// ─── Phase 4 Batch 5 — Pricing A/B + Reports ─────────────────────────────
export const listPricingExperiments = (params = {}) => {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && usp.append(k, v));
  const s = usp.toString();
  return j(`/api/dev/pricing-experiments${s ? `?${s}` : ''}`);
};
export const createPricingExperiment = (body) => post('/api/dev/pricing-experiments', body);
export const patchPricingExperiment = (id, body) => j(`/api/dev/pricing-experiments/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const pricingResults = (id) => j(`/api/dev/pricing-experiments/${id}/results`);

export const listReportTemplates = () => j('/api/dev/reports/templates');
export const createReportTemplate = (body) => post('/api/dev/reports/templates', body);
export const generateReport = (body) => post('/api/dev/reports/generate', body);
export const listReportDistributions = () => j('/api/dev/reports/distributions');
export const createReportDistribution = (body) => post('/api/dev/reports/distributions', body);
export const reportDownloadUrl = (fileId) => `${process.env.REACT_APP_BACKEND_URL}/api/dev/reports/files/${fileId}`;

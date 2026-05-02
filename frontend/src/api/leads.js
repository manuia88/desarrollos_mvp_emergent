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

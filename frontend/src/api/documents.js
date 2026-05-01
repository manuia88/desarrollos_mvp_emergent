// Document Intelligence API helpers — Phase 7.1 + 7.2
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(
      new Error(body.detail?.message || body.detail || r.statusText),
      { status: r.status, body }
    );
  }
  return r.json();
};

// Choose superadmin or developer scope based on caller (UI passes role).
const base = (scope = 'superadmin') => `/api/${scope === 'developer' ? 'desarrollador' : 'superadmin'}`;

export const listDocTypes = () => j('/api/superadmin/document-types');

export const listDevDocuments = (devId, params = {}, scope = 'superadmin') => {
  const qs = new URLSearchParams(Object.entries(params).filter(([_, v]) => v != null && v !== '')).toString();
  return j(`${base(scope)}/developments/${encodeURIComponent(devId)}/documents${qs ? `?${qs}` : ''}`);
};

export const listAllDocuments = (params = {}, scope = 'superadmin') => {
  const qs = new URLSearchParams(Object.entries(params).filter(([_, v]) => v != null && v !== '')).toString();
  return j(`${base(scope)}/documents${qs ? `?${qs}` : ''}`);
};

export const getDocument = (docId, scope = 'superadmin') =>
  j(`${base(scope)}/documents/${encodeURIComponent(docId)}`);

export const reprocessOcr = (docId, scope = 'superadmin') =>
  j(`${base(scope)}/documents/${encodeURIComponent(docId)}/reprocess-ocr`, { method: 'POST' });

export const deleteDocument = (docId, scope = 'superadmin') =>
  j(`${base(scope)}/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' });

export const downloadDocumentUrl = (docId, scope = 'superadmin') =>
  `${API}${base(scope)}/documents/${encodeURIComponent(docId)}/download`;

export const uploadDocument = async (devId, { file, doc_type, upload_notes, period_start, period_end }, scope = 'superadmin') => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('doc_type', doc_type);
  if (upload_notes) fd.append('upload_notes', upload_notes);
  if (period_start) fd.append('period_relevant_start', period_start);
  if (period_end) fd.append('period_relevant_end', period_end);
  const r = await fetch(`${API}${base(scope)}/developments/${encodeURIComponent(devId)}/documents/upload`, {
    method: 'POST', credentials: 'include', body: fd,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};

// ─── Phase 7.2 — Extraction ────────────────────────────────────────────────
export const triggerExtraction = (docId, scope = 'superadmin') =>
  j(`${base(scope)}/documents/${encodeURIComponent(docId)}/extract`, { method: 'POST' });

export const getExtraction = (docId, scope = 'superadmin') =>
  j(`${base(scope)}/documents/${encodeURIComponent(docId)}/extraction`);

export const bulkExtract = (devId, scope = 'superadmin') =>
  j(`${base(scope)}/developments/${encodeURIComponent(devId)}/documents/bulk-extract`, { method: 'POST' });

// ─── Phase 7.3 — Cross-Check ───────────────────────────────────────────────
export const triggerCrossCheck = (devId, scope = 'superadmin') =>
  j(`${base(scope)}/developments/${encodeURIComponent(devId)}/cross-check`, { method: 'POST' });

export const getDevCrossCheck = (devId, scope = 'superadmin') =>
  j(`${base(scope)}/developments/${encodeURIComponent(devId)}/cross-check`);

export const getCrossCheckStats = () => j('/api/superadmin/cross-checks/stats/global');

export const getPricingCrossCheckWarnings = () => j('/api/desarrollador/pricing/cross-check-warnings');

// ─── Phase 7.5 — Auto-Sync ─────────────────────────────────────────────────
export const getSyncPreview = (devId, scope = 'superadmin') =>
  j(`${base(scope)}/developments/${encodeURIComponent(devId)}/sync-preview`);

export const applySync = (devId, scope = 'superadmin') =>
  j(`${base(scope)}/developments/${encodeURIComponent(devId)}/sync-apply`, { method: 'POST' });

export const revertSync = (devId, auditId, scope = 'superadmin') =>
  j(`${base(scope)}/developments/${encodeURIComponent(devId)}/sync-revert/${encodeURIComponent(auditId)}`, { method: 'POST' });

export const getSyncAudit = (devId, scope = 'superadmin') =>
  j(`${base(scope)}/developments/${encodeURIComponent(devId)}/sync-audit`);

export const lockSyncField = (devId, field, locked, scope = 'superadmin') =>
  j(`${base(scope)}/developments/${encodeURIComponent(devId)}/sync-lock-field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field, locked }),
  });

export const getSyncPending = (scope = 'superadmin') =>
  j(`${base(scope)}/sync/pending-summary`);

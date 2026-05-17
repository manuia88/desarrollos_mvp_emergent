/**
 * W5.11 Parte 2 — API helpers para Entity Resolution + Audit Chain
 */
const BASE = process.env.REACT_APP_BACKEND_URL;

const _get = (url) =>
  fetch(`${BASE}${url}`, { credentials: 'include' }).then((r) => r.json());

const _post = (url, body = {}) =>
  fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  }).then((r) => r.json());

// ── Pending duplicates ──────────────────────────────────────────────────────
export const listPendingDuplicates = ({ entity_type, tier, limit = 50, skip = 0 } = {}) => {
  const q = new URLSearchParams();
  if (entity_type) q.set('entity_type', entity_type);
  if (tier) q.set('tier', tier);
  q.set('limit', limit);
  q.set('skip', skip);
  return _get(`/api/superadmin/entity-resolution/pending?${q}`);
};

export const mergePending = (id) => _post(`/api/superadmin/entity-resolution/pending/${id}/merge`);
export const rejectPending = (id) => _post(`/api/superadmin/entity-resolution/pending/${id}/reject`);
export const ignorePending = (id) => _post(`/api/superadmin/entity-resolution/pending/${id}/ignore`);
export const undoMerge = (mergeId) => _post(`/api/superadmin/entity-resolution/undo/${mergeId}`);

// ── Supporting lists ─────────────────────────────────────────────────────────
export const listBlacklist = (limit = 50) =>
  _get(`/api/superadmin/entity-resolution/blacklist?limit=${limit}`);

export const listFraudPatterns = (limit = 20) =>
  _get(`/api/superadmin/entity-resolution/fraud-patterns?limit=${limit}`);

export const listDedupRuns = (limit = 10) =>
  _get(`/api/superadmin/entity-resolution/runs?limit=${limit}`);

export const triggerDedupRun = () =>
  _post('/api/superadmin/entity-resolution/trigger-run');

// ── Audit ────────────────────────────────────────────────────────────────────
export const verifyAuditChain = ({ from_id, to_id } = {}) => {
  const q = new URLSearchParams();
  if (from_id) q.set('from_id', from_id);
  if (to_id) q.set('to_id', to_id);
  return _get(`/api/superadmin/audit/verify-chain?${q}`);
};

export const queryAuditLog = ({ entity_id, entity_type, actor_user_id, action, date_from, date_to, limit = 100, skip = 0 } = {}) => {
  const q = new URLSearchParams();
  if (entity_id) q.set('entity_id', entity_id);
  if (entity_type) q.set('entity_type', entity_type);
  if (actor_user_id) q.set('actor_user_id', actor_user_id);
  if (action) q.set('action', action);
  if (date_from) q.set('date_from', date_from);
  if (date_to) q.set('date_to', date_to);
  q.set('limit', limit);
  q.set('skip', skip);
  return _get(`/api/superadmin/audit/log?${q}`);
};

export const exportAuditLog = async () => {
  const all = [];
  let skip = 0;
  const BATCH = 500;
  let done = false;
  while (!done) {
    const r = await queryAuditLog({ limit: BATCH, skip });
    const rows = r.audit_log || [];
    all.push(...rows);
    if (rows.length < BATCH) done = true;
    else skip += BATCH;
    if (skip > 50000) done = true; // safety cap
  }
  return all;
};

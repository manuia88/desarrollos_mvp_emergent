// api/audit.js — helpers para Audit Log (Phase F0.1)
const BASE = process.env.REACT_APP_BACKEND_URL;

function getHeaders() {
  return { 'Content-Type': 'application/json' };
}

export async function fetchAuditLog({ entity_type, actor_user_id, action, from, to, page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (entity_type) params.set('entity_type', entity_type);
  if (actor_user_id) params.set('actor_user_id', actor_user_id);
  if (action) params.set('action', action);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('page', page);
  params.set('limit', limit);
  const res = await fetch(`${BASE}/api/audit/log?${params}`, { credentials: 'include', headers: getHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchEntityTrail(entity_type, entity_id) {
  const res = await fetch(`${BASE}/api/audit/log/entity/${entity_type}/${entity_id}`, { credentials: 'include', headers: getHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchAuditStats() {
  const res = await fetch(`${BASE}/api/audit/log/stats`, { credentials: 'include', headers: getHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

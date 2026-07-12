// W2.2 SA3 — Audit Log API client
const API = process.env.REACT_APP_BACKEND_URL;

const h = () => ({
  'Content-Type': 'application/json',
});

async function _j(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || d.message || msg; } catch {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return res.json();
}

const BASE = `${API}/api/superadmin/audit`;

function _qs(params) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v != null && v !== '' && v !== 'all') qs.set(k, v);
  });
  return qs.toString();
}

export async function listEntries(filters = {}) {
  return _j(await fetch(`${BASE}/entries?${_qs(filters)}`, { headers: h(), credentials: 'include' }));
}
// Timeline UNIFICADO de los 3 portales (audit_log + developer_audit + lead_events + price_events + engagement_events).
export async function listUnified(filters = {}) {
  return _j(await fetch(`${BASE}/unified?${_qs(filters)}`, { headers: h(), credentials: 'include' }));
}

export async function getEntry(id) {
  return _j(await fetch(`${BASE}/entries/${encodeURIComponent(id)}`, {
    headers: h(), credentials: 'include',
  }));
}

export async function entityTimeline(entityType, entityId) {
  return _j(await fetch(
    `${BASE}/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/timeline`,
    { headers: h(), credentials: 'include' },
  ));
}

export async function distinctActors() {
  return _j(await fetch(`${BASE}/distinct/actors`, { headers: h(), credentials: 'include' }));
}

export async function distinctEntityTypes() {
  return _j(await fetch(`${BASE}/distinct/entity-types`, { headers: h(), credentials: 'include' }));
}

// D (B3) — Actividad de IA: qué decidió/mutó cada agente vs humanos (consume actor.by_ai)
export async function getAiActivity(days = 7) {
  return _j(await fetch(`${BASE}/ai-activity?days=${days}`, { headers: h(), credentials: 'include' }));
}

export async function getStats() {
  return _j(await fetch(`${BASE}/stats`, { headers: h(), credentials: 'include' }));
}

export function exportUrl(format, filters = {}) {
  return `${BASE}/export?format=${format}&${_qs(filters)}`;
}

// W2.1 SA2 — Data Sources Hub API client
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

const BASE = `${API}/api/superadmin/data-hub`;

export async function listConnectors() {
  return _j(await fetch(`${BASE}/connectors`, { headers: h(), credentials: 'include' }));
}

export async function getConnector(id) {
  return _j(await fetch(`${BASE}/connectors/${encodeURIComponent(id)}`, { headers: h(), credentials: 'include' }));
}

export async function testConnector(id) {
  return _j(await fetch(`${BASE}/connectors/${encodeURIComponent(id)}/test`, {
    method: 'POST', headers: h(), credentials: 'include',
  }));
}

export async function retryConnector(id) {
  return _j(await fetch(`${BASE}/connectors/${encodeURIComponent(id)}/retry`, {
    method: 'POST', headers: h(), credentials: 'include',
  }));
}

export async function replayConnector(id, fromTs, toTs) {
  return _j(await fetch(`${BASE}/connectors/${encodeURIComponent(id)}/replay`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({ from_ts: fromTs, to_ts: toTs }),
  }));
}

export async function listInvocations(id, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  return _j(await fetch(
    `${BASE}/connectors/${encodeURIComponent(id)}/invocations?${qs.toString()}`,
    { headers: h(), credentials: 'include' },
  ));
}

// ── Insights externos (censo 2026-07-05: admin sin UI → cableado en el Hub de Fuentes, su casa natural) ──
export async function getInsightsCronStatus() {
  return _j(await fetch(`${API}/api/superadmin/insights/cron-status`, { headers: h(), credentials: 'include' }));
}
export async function refreshInsightSource(sourceId) {
  return _j(await fetch(`${API}/api/superadmin/insights/refresh/${encodeURIComponent(sourceId)}`, { method: 'POST', headers: h(), credentials: 'include' }));
}
export async function listInsightCourses() {
  return _j(await fetch(`${API}/api/insights/courses?limit=50`, { headers: h(), credentials: 'include' }));
}
export async function createInsightCourse(body) {
  return _j(await fetch(`${API}/api/superadmin/insights/courses`, { method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body) }));
}
export async function deleteInsightCourse(slug) {
  return _j(await fetch(`${API}/api/superadmin/insights/courses/${encodeURIComponent(slug)}`, { method: 'DELETE', headers: h(), credentials: 'include' }));
}

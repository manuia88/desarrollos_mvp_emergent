// W2.1 SA2 — Data Sources Hub API client
const API = process.env.REACT_APP_BACKEND_URL;

const h = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('dmx_token')}`,
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

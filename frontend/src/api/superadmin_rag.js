// W5.x F2 Sub-F — Superadmin RAG inspector API client
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

const BASE = `${API}/api/superadmin/rag`;

export async function getRagStats() {
  return _j(await fetch(`${BASE}/stats`, { headers: h(), credentials: 'include' }));
}

export async function queryRag(body) {
  return _j(await fetch(`${BASE}/query`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify(body),
  }));
}

export async function triggerRagReindex() {
  return _j(await fetch(`${BASE}/reindex`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({}),
  }));
}

// W5.25 — Widget Embed Analytics API client (superadmin only).
const API = process.env.REACT_APP_BACKEND_URL;

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* noop */ }
    const err = new Error((body && (body.detail || body.error)) || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

export async function getEmbedStats({ widget_type = '', days = 30, limit = 50, skip = 0 } = {}) {
  const qs = new URLSearchParams();
  if (widget_type) qs.set('widget_type', widget_type);
  qs.set('days', String(days));
  qs.set('limit', String(limit));
  qs.set('skip', String(skip));
  const res = await fetch(`${API}/api/superadmin/widgets/embed-stats?${qs.toString()}`, {
    credentials: 'include', headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  return handle(res);
}

export async function getNewDomains() {
  const res = await fetch(`${API}/api/superadmin/widgets/embed-new-domains`, {
    credentials: 'include', headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  return handle(res);
}

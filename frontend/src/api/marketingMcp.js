// W6.MOV.4 · Marketing Distribution MCP API client (superadmin-only).
// 5 endpoints: POST publish, POST schedule, GET history, GET stats, DELETE scheduled/{id}.
const API = process.env.REACT_APP_BACKEND_URL || '';

function authHeaders() {
  const token =
    localStorage.getItem('access_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function _req(url, opts = {}) {
  const res = await fetch(`${API}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch (_e) { /* ignore */ }
    const err = new Error(body?.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

export async function publishMcp({ text, platforms, extras } = {}) {
  return _req('/api/superadmin/marketing-mcp/publish', {
    method: 'POST',
    body: JSON.stringify({ text, platforms: platforms || null, extras: extras || null }),
  });
}

export async function scheduleMcp({ text, platforms, scheduled_at, extras } = {}) {
  return _req('/api/superadmin/marketing-mcp/schedule', {
    method: 'POST',
    body: JSON.stringify({ text, platforms: platforms || null, scheduled_at, extras: extras || null }),
  });
}

export async function getMcpHistory({ days = 30, limit = 50 } = {}) {
  const p = new URLSearchParams({ days: String(days), limit: String(limit) });
  return _req(`/api/superadmin/marketing-mcp/history?${p.toString()}`);
}

export async function getMcpStats() {
  return _req('/api/superadmin/marketing-mcp/stats');
}

export async function cancelScheduledMcp(scheduledId) {
  return _req(`/api/superadmin/marketing-mcp/scheduled/${encodeURIComponent(scheduledId)}`, {
    method: 'DELETE',
  });
}

// W6.MOV.1 · SOC Franchise API client
// 6 endpoints: leaderboard (público) + my-score/user (advisor) + stats/certify/revoke (superadmin)
// Usa fetch nativo · NO depende de axios.
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
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
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

export async function getLeaderboard({ level, limit = 20, skip = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  if (level) params.set('level', level);
  return _req(`/api/soc-franchise/leaderboard?${params.toString()}`);
}

export async function getMyScore() {
  return _req(`/api/soc-franchise/my-score`, { headers: authHeaders() });
}

export async function getUserScore(userId) {
  return _req(`/api/soc-franchise/user/${encodeURIComponent(userId)}`, {
    headers: authHeaders(),
  });
}

export async function getSocStats() {
  return _req(`/api/superadmin/soc-franchise/stats`, { headers: authHeaders() });
}

export async function certifyUser({ user_id, level, reason }) {
  return _req(`/api/superadmin/soc-franchise/certify`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ user_id, level, reason }),
  });
}

export async function revokeUser({ user_id, reason }) {
  return _req(`/api/superadmin/soc-franchise/revoke`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ user_id, reason }),
  });
}

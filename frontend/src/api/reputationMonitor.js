// W7.AS.6 · Reputation Monitor API client (superadmin)
// 5 endpoints · fetch nativo · NO axios.
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
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(opts.headers || {}),
    },
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

export async function getMentions({ days = 30, sentiment, source, status, limit = 50, skip = 0 } = {}) {
  const p = new URLSearchParams({ days: String(days), limit: String(limit), skip: String(skip) });
  if (sentiment) p.set('sentiment', sentiment);
  if (source) p.set('source', source);
  if (status) p.set('status', status);
  return _req(`/api/superadmin/reputation/mentions?${p.toString()}`);
}

export async function getStats(days = 30) {
  return _req(`/api/superadmin/reputation/stats?days=${days}`);
}

export async function scanNow({ brand_keywords, sources } = {}) {
  return _req(`/api/superadmin/reputation/scan-now`, {
    method: 'POST',
    body: JSON.stringify({ brand_keywords, sources }),
  });
}

export async function getAlertsHistory(days = 30) {
  return _req(`/api/superadmin/reputation/alerts-history?days=${days}`);
}

export async function markMention(mention_id, status) {
  return _req(
    `/api/superadmin/reputation/mark-mention/${encodeURIComponent(mention_id)}`,
    {
      method: 'POST',
      body: JSON.stringify({ status }),
    },
  );
}

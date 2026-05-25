/**
 * W5.10 — Social/Ads (Meta multi-tenant · STUB-aware) · API client (9 endpoints).
 */
const API = process.env.REACT_APP_BACKEND_URL;

async function _get(url) {
  const r = await fetch(`${API}${url}`, { credentials: 'include' });
  let body = {};
  try { body = await r.json(); } catch (_) { body = {}; }
  return { ok: r.ok, status: r.status, body };
}

async function _post(url, payload) {
  const r = await fetch(`${API}${url}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  let body = {};
  try { body = await r.json(); } catch (_) { body = {}; }
  return { ok: r.ok, status: r.status, body };
}

const enc = encodeURIComponent;

// 1 — Build Meta OAuth URL (advisor)
export const getOAuthUrl = () => _get('/api/social-ads/oauth/url');

// 2 — OAuth callback (público · normalmente alcanzado por redirect del browser)
export const oauthCallback = (code, state) =>
  _get(`/api/social-ads/oauth/callback?code=${enc(code)}&state=${enc(state)}`);

// 3 — Own ad accounts (advisor)
export const getAccounts = () => _get('/api/social-ads/accounts');

// 4 — Disconnect connection by account (advisor)
export const disconnectAccount = (accountId) =>
  _post(`/api/social-ads/accounts/${enc(accountId)}/disconnect`, {});

// 5 — Campaigns for account (advisor)
export const getCampaigns = (accountId, status = '') => {
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  const qs = q.toString();
  return _get(`/api/social-ads/accounts/${enc(accountId)}/campaigns${qs ? `?${qs}` : ''}`);
};

// 6 — Budget suggestion IA (advisor)
export const getBudgetSuggestion = (accountId) =>
  _get(`/api/social-ads/accounts/${enc(accountId)}/budget-suggestion`);

// 7 — Performance time series (advisor)
export const getPerformance = (accountId, days = 30) =>
  _get(`/api/social-ads/accounts/${enc(accountId)}/performance?days=${enc(days)}`);

// 8 — Superadmin: tenants conectados
export const getSuperadminTenants = () => _get('/api/superadmin/social-ads/tenants');

// 9 — Superadmin: stats globales + Meta API health
export const getSuperadminStats = () => _get('/api/superadmin/social-ads/stats');

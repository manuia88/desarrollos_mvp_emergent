// W3.9c — Watchlist API client
const API = process.env.REACT_APP_BACKEND_URL;

async function _send(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${url}`, opts);
  let parsed = null;
  try { parsed = await r.json(); } catch { /* empty */ }
  if (!r.ok) {
    return Promise.reject({ status: r.status, body: parsed });
  }
  return parsed;
}

export const subscribeWatchlist = ({ email, zone_ids = [], scope = 'both' }) =>
  _send('POST', '/api/watchlist/subscribe', { email, zone_ids, scope });

export const getWatchlistManage = (manageToken) =>
  _send('GET', `/api/watchlist/manage/${encodeURIComponent(manageToken)}`);

export const updateWatchlistManage = (manageToken, updates) =>
  _send('POST', `/api/watchlist/manage/${encodeURIComponent(manageToken)}`, updates);

export const unsubscribeWatchlist = (manageToken) =>
  _send('DELETE', `/api/watchlist/manage/${encodeURIComponent(manageToken)}`);

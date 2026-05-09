/** W3.9b — Public Watchlist Subscribe API Client. */
const API = process.env.REACT_APP_BACKEND_URL;

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(b)).catch(() => Promise.reject({ status: r.status }));
  return r.json();
};

export async function subscribeWatchlist({ email, zone_ids = [], scope = 'both' }) {
  return fetch(`${API}/api/watchlist/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, zone_ids, scope }),
  }).then(j);
}

export async function getWatchlistManage(manageToken) {
  return fetch(`${API}/api/watchlist/manage/${encodeURIComponent(manageToken)}`).then(j);
}

export async function updateWatchlistManage(manageToken, updates) {
  return fetch(`${API}/api/watchlist/manage/${encodeURIComponent(manageToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  }).then(j);
}

export async function unsubscribeWatchlist(manageToken) {
  return fetch(`${API}/api/watchlist/manage/${encodeURIComponent(manageToken)}`, {
    method: 'DELETE',
  }).then(j);
}

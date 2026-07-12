// W6.MOV.3 · Reviews Residentes API client
// 6 endpoints: GET zone/dev/summary + POST superadmin scrape + GET stats + DELETE
// Usa fetch nativo · NO depende de axios.
const API = process.env.REACT_APP_BACKEND_URL || '';

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

export async function getZoneReviews(zoneId) {
  return _req(`/api/reviews/zone/${encodeURIComponent(zoneId)}`);
}

export async function getDevelopmentReviews(devId) {
  return _req(`/api/reviews/development/${encodeURIComponent(devId)}`);
}

export async function getReviewsSummary(entityType, entityId) {
  return _req(`/api/reviews/summary/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
}

export async function forceScrapeReviews(entityType, entityId) {
  return _req(
    `/api/superadmin/reviews/scrape/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function getReviewsStats() {
  return _req(`/api/superadmin/reviews/stats`);
}

export async function deleteEntityReviews(entityType, entityId) {
  return _req(
    `/api/superadmin/reviews/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    { method: 'DELETE' },
  );
}

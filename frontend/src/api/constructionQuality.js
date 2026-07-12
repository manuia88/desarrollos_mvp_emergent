// W6.MOV.5 · Construction Quality Index API client
// 5 endpoints: GET index/list + GET superadmin stats + POST refresh + POST manual override
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

export async function getQualityIndex(developmentId) {
  return _req(`/api/construction-quality/${encodeURIComponent(developmentId)}`);
}

export async function listByQuality({ min_score, tier, limit = 50, skip = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  if (min_score != null) params.set('min_score', String(min_score));
  if (tier) params.set('tier', tier);
  return _req(`/api/construction-quality?${params.toString()}`);
}

export async function getQualityStats() {
  return _req(`/api/superadmin/construction-quality/stats`);
}

export async function refreshQuality(developmentId) {
  return _req(
    `/api/superadmin/construction-quality/refresh/${encodeURIComponent(developmentId)}`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export async function setManualOverride({ development_id, score, reason }) {
  return _req(`/api/superadmin/construction-quality/manual-override`, {
    method: 'POST',
    body: JSON.stringify({ development_id, score, reason }),
  });
}

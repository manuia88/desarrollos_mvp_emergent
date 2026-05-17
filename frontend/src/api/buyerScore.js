// api/buyerScore.js — helpers para endpoints buyer score (superadmin + asesor).
const API = process.env.REACT_APP_BACKEND_URL;

function _authHeaders() {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function _handle(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

/** Resumen agregado: total buyers + by_tier + avg_score + last_run */
export async function getBuyerScoreSummary() {
  const res = await fetch(`${API}/api/superadmin/buyer-score/summary`, {
    headers: _authHeaders(),
  });
  return _handle(res);
}

/** Tabla per-user con componentes. tier: 'hot'|'warm'|'cold'|undefined */
export async function getBuyerScorePerUser({ tier, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (tier) params.set('tier', tier);
  params.set('limit', String(limit));
  const res = await fetch(`${API}/api/superadmin/buyer-score/per-user?${params}`, {
    headers: _authHeaders(),
  });
  return _handle(res);
}

/** Trigger manual del recompute (superadmin only) */
export async function triggerBuyerScoreRecompute() {
  const res = await fetch(`${API}/api/superadmin/buyer-score/trigger-recompute`, {
    method: 'POST',
    headers: _authHeaders(),
  });
  return _handle(res);
}

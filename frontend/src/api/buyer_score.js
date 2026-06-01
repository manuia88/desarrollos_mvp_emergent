// Buyer Score (W5.4) · API wrappers
//  - getBuyerScore(leadId) → fail-silent null on 404/error (advisor consumer)
//  - getBuyerScoreSummary / getBuyerScorePerUser / triggerBuyerScoreRecompute (superadmin)
const BASE = process.env.REACT_APP_BACKEND_URL;

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

// Advisor: single-lead lookup · fail-silent. E0.1: ruta real bajo /api/asesor que
// resuelve lead→comprador→score por email+teléfono (antes apuntaba a una ruta inexistente).
export const getBuyerScore = async (leadId) => {
  if (!leadId) return null;
  try {
    const r = await fetch(
      `${BASE}/api/asesor/lead/${encodeURIComponent(leadId)}/buyer-score`,
      { headers: _authHeaders() },
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

// Superadmin: aggregate summary (total buyers · by_tier · avg_score · last_run)
export async function getBuyerScoreSummary() {
  const res = await fetch(`${BASE}/api/superadmin/buyer-score/summary`, {
    headers: _authHeaders(),
  });
  return _handle(res);
}

// Superadmin: per-user table (tier filter optional · 'hot'|'warm'|'cold')
export async function getBuyerScorePerUser({ tier, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (tier) params.set('tier', tier);
  params.set('limit', String(limit));
  const res = await fetch(`${BASE}/api/superadmin/buyer-score/per-user?${params}`, {
    headers: _authHeaders(),
  });
  return _handle(res);
}

// Superadmin: manual recompute trigger
export async function triggerBuyerScoreRecompute() {
  const res = await fetch(`${BASE}/api/superadmin/buyer-score/trigger-recompute`, {
    method: 'POST',
    headers: _authHeaders(),
  });
  return _handle(res);
}

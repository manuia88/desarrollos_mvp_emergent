// Buyer Score (W5.4) · API wrappers
//  - getBuyerScore(leadId) → fail-silent null on 404/error (advisor consumer)
//  - getBuyerScoreSummary / getBuyerScorePerUser / triggerBuyerScoreRecompute (superadmin)
const BASE = process.env.REACT_APP_BACKEND_URL;

// La app autentica por COOKIE de sesión (credentials: 'include'), NO por Bearer token en localStorage.
// (Verificación en navegador real 2026-07-05: sin credentials → 401 'No autenticado'; con credentials → 200.
//  El fix previo de "llave del token" era inútil porque no hay token en localStorage — la auth es cookie.)
const _opts = (extra = {}) => ({
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  ...extra,
});

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
      _opts(),
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

// Superadmin: aggregate summary (total buyers · by_tier · avg_score · last_run)
export async function getBuyerScoreSummary() {
  return _handle(await fetch(`${BASE}/api/superadmin/buyer-score/summary`, _opts()));
}

// Superadmin: per-user table (tier filter optional · 'hot'|'warm'|'cold')
export async function getBuyerScorePerUser({ tier, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (tier) params.set('tier', tier);
  params.set('limit', String(limit));
  return _handle(await fetch(`${BASE}/api/superadmin/buyer-score/per-user?${params}`, _opts()));
}

// Superadmin: manual recompute trigger
export async function triggerBuyerScoreRecompute() {
  return _handle(await fetch(`${BASE}/api/superadmin/buyer-score/trigger-recompute`, _opts({ method: 'POST' })));
}

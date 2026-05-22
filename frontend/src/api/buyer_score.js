// W5 cleanup · API wrapper para Buyer Score (W5.4 backend)
const BASE = process.env.REACT_APP_BACKEND_URL;

/**
 * GET /api/buyer-score/{lead_id}
 * Retorna null fail-silent en 404 / errores de red.
 */
export const getBuyerScore = async (leadId) => {
  if (!leadId) return null;
  try {
    const r = await fetch(
      `${BASE}/api/buyer-score/${encodeURIComponent(leadId)}`,
      { credentials: 'include' },
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

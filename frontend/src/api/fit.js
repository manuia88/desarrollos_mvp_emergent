// W5.x F11 · API helpers para Fit buyer↔property compatibility
// Backend en construccion paralela · fail-silent en 404 / errores de red
const BASE = process.env.REACT_APP_BACKEND_URL;

const _safe = async (url, fallback) => {
  try {
    const r = await fetch(`${BASE}${url}`, { credentials: 'include' });
    if (!r.ok) return fallback;
    return await r.json();
  } catch {
    return fallback;
  }
};

/** GET /api/fit/score · returns null fail-silent */
export const getFitScore = (leadId, propertyId) => {
  if (!leadId || !propertyId) return Promise.resolve(null);
  const qs = new URLSearchParams({
    lead_id: String(leadId),
    property_id: String(propertyId),
  }).toString();
  return _safe(`/api/fit/score?${qs}`, null);
};

/** GET /api/fit/lead/{lead_id}/top-properties · fail-silent { properties: [] } */
export const getTopPropertiesForLead = (leadId, limit = 5) => {
  if (!leadId) return Promise.resolve({ properties: [] });
  return _safe(
    `/api/fit/lead/${encodeURIComponent(leadId)}/top-properties?limit=${limit}`,
    { properties: [] },
  );
};

/** GET /api/fit/property/{property_id}/top-leads · fail-silent { leads: [] } */
export const getTopLeadsForProperty = (propertyId, limit = 5) => {
  if (!propertyId) return Promise.resolve({ leads: [] });
  return _safe(
    `/api/fit/property/${encodeURIComponent(propertyId)}/top-leads?limit=${limit}`,
    { leads: [] },
  );
};

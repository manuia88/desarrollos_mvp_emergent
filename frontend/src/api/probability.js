/**
 * W5.19 — Probability UX API client.
 *
 * Wrappers sobre GET /api/probability/{type}?id=X&months=Y&listed=Z
 */
const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Consulta genérica de probabilidad.
 * @param {string} type - sells_complete | drpi_up | closes_below_listed
 * @param {string} id - entity_id
 * @param {object} params - { months?, listed? }
 * @returns {Promise<object>} shape estándar
 */
export async function getProbability(type, id, params = {}) {
  const qs = new URLSearchParams({ id });
  if (params.months != null) qs.set('months', String(params.months));
  if (params.listed != null) qs.set('listed', String(params.listed));
  const res = await fetch(`${API}/api/probability/${type}?${qs.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json();
}

/**
 * Probabilidad de que un proyecto venda todas sus unidades en N meses.
 * @param {string} projectId
 * @param {number} months
 */
export async function getSellsComplete(projectId, months = 12) {
  return getProbability('sells_complete', projectId, { months });
}

/**
 * Probabilidad de que el DRPI de una zona suba en N meses.
 * @param {string} zoneSlug
 * @param {number} months
 */
export async function getDrpiUp(zoneSlug, months = 3) {
  return getProbability('drpi_up', zoneSlug, { months });
}

/**
 * Probabilidad de que el precio de cierre esté por debajo del precio listado.
 * @param {string} propertyId
 * @param {number} listedPrice
 */
export async function getCloseBelowListed(propertyId, listedPrice) {
  return getProbability('closes_below_listed', propertyId, { listed: listedPrice });
}


/**
 * W5 cleanup · fail-silent wrapper para ProbabilityCard
 * Acepta { type, id, months, listed } · retorna null si error · NO throws.
 */
export async function fetchProbabilityCardData({ type, id, months, listed } = {}) {
  if (!type || !id) return null;
  try {
    return await getProbability(type, id, { months, listed });
  } catch {
    return null;
  }
}

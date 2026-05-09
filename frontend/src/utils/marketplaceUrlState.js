// W4.2D1 — marketplaceUrlState.js
// Helpers para sincronización URL <→ estado de filtros del Marketplace.
// URL canónico: /marketplace?colonia=polanco&precio_max=15000000&recamaras_min=2&stage=preventa
// Orden params: ALFABÉTICO. Sin nulls/vacíos.

const VALID_KEYS = ['colonia', 'precio_max', 'recamaras_max', 'recamaras_min', 'stage', 'tipo'];

/**
 * Deserializa URLSearchParams → filtros internos del Marketplace.
 * Mapping canónico → interno:
 *   colonia       → coloniaFilter (string) + filters.colonia ([colonia])
 *   precio_max    → filters.max_price
 *   recamaras_min → filters.beds (min value; max ignored en UI actual)
 *   recamaras_max → (preserved, no UI mapping yet)
 *   tipo          → filters.tipo
 *   stage         → filters.stage
 */
export function urlToFilters(search) {
  const params = new URLSearchParams(search);
  const filters = {};
  let coloniaFilter = null;

  const colonia = params.get('colonia');
  if (colonia) {
    coloniaFilter = colonia;
    // Also seed filters.colonia array so TopFilters shows active state
    filters.colonia = [colonia];
  }

  const precioMax = params.get('precio_max');
  if (precioMax) {
    const v = parseInt(precioMax, 10);
    if (!isNaN(v)) filters.max_price = v;
  }

  const recMin = params.get('recamaras_min');
  if (recMin) {
    const v = parseInt(recMin, 10);
    if (!isNaN(v)) filters.beds = v;
  }

  const tipo = params.get('tipo');
  if (tipo) filters.tipo = tipo;

  const stage = params.get('stage');
  if (stage) filters.stage = stage;

  return { filters, coloniaFilter };
}

/**
 * Serializa el estado actual → canonical query string.
 * Lee coloniaFilter (string) + filters (object).
 */
export function filtersToUrl(filters, coloniaFilter) {
  const out = {};

  if (coloniaFilter) out.colonia = coloniaFilter;
  // Also support colonia array (pick first if array)
  else if (Array.isArray(filters.colonia) && filters.colonia.length === 1) {
    out.colonia = filters.colonia[0];
  }

  if (filters.max_price) out.precio_max = String(filters.max_price);
  if (filters.beds) out.recamaras_min = String(filters.beds);
  if (filters.tipo) out.tipo = filters.tipo;
  if (filters.stage) out.stage = filters.stage;

  // Build params in alphabetical order (canonical)
  const params = new URLSearchParams();
  Object.keys(out)
    .filter(k => VALID_KEYS.includes(k) && out[k] != null && out[k] !== '')
    .sort()
    .forEach(k => params.set(k, out[k]));

  return params.toString();
}

/**
 * Builds the full canonical URL for a filter combination.
 */
export function buildCanonicalUrl(filters, coloniaFilter, baseUrl = '') {
  const qs = filtersToUrl(filters, coloniaFilter);
  return `${baseUrl}/marketplace${qs ? '?' + qs : ''}`;
}

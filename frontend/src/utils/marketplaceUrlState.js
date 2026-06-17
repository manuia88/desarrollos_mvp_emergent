// W4.2D1 — marketplaceUrlState.js
// Helpers para sincronización URL <→ estado de filtros del Marketplace.
// URL canónico: /marketplace?colonia=polanco&precio_max=15000000&recamaras_min=2&stage=preventa
//              &unit_feature=terraza&unit_feature=roof_garden&orientacion=Sur&piso_min=8&amenity=gym
// Orden params: ALFABÉTICO. Sin nulls/vacíos.
//
// Ampliado (granularidad fina): antes solo sobrevivían 6 keys → el resto se perdía al recargar/compartir.
// Ahora persisten también: alcaldia, tipo, amenity[], unit_feature[] (terraza/estacionamiento_independiente/
// roof_garden/bodega/pet_friendly/balcon), orientacion[], piso_min, banos, estacionamientos, m2_min/max.

// Keys escalares (string/number) ↔ key interna de `filters`
const SCALAR = {
  precio_max: 'max_price', precio_min: 'min_price', recamaras_min: 'beds',
  banos: 'baths', estacionamientos: 'parking', m2_min: 'min_sqm', m2_max: 'max_sqm',
  piso_min: 'piso_min', alcaldia: 'alcaldia', tipo: 'tipo', stage: 'stage',
};
// Keys multi-valor (arrays) — mismo nombre URL e interno
const ARRAY_KEYS = ['amenity', 'unit_feature', 'orientacion'];
const NUMERIC = new Set(['max_price', 'min_price', 'beds', 'baths', 'parking', 'min_sqm', 'max_sqm', 'piso_min']);

export function urlToFilters(search) {
  const params = new URLSearchParams(search);
  const filters = {};
  let coloniaFilter = null;

  const colonia = params.get('colonia');
  if (colonia) { coloniaFilter = colonia; filters.colonia = [colonia]; }

  for (const [urlKey, fKey] of Object.entries(SCALAR)) {
    const raw = params.get(urlKey);
    if (raw == null || raw === '') continue;
    if (NUMERIC.has(fKey)) {
      const v = parseInt(raw, 10);
      if (!isNaN(v)) filters[fKey] = v;
    } else {
      filters[fKey] = raw;
    }
  }
  for (const k of ARRAY_KEYS) {
    const vals = params.getAll(k).filter(Boolean);
    if (vals.length) filters[k] = vals;
  }
  return { filters, coloniaFilter };
}

export function filtersToUrl(filters, coloniaFilter) {
  const params = new URLSearchParams();
  const scalarOut = {};

  if (coloniaFilter) scalarOut.colonia = coloniaFilter;
  else if (Array.isArray(filters.colonia) && filters.colonia.length === 1) scalarOut.colonia = filters.colonia[0];

  for (const [urlKey, fKey] of Object.entries(SCALAR)) {
    const v = filters[fKey];
    if (v != null && v !== '') scalarOut[urlKey] = String(v);
  }
  // Arrays → multi-valor
  const arrayOut = {};
  for (const k of ARRAY_KEYS) {
    if (Array.isArray(filters[k]) && filters[k].length) arrayOut[k] = filters[k].slice();
  }

  // Orden alfabético canónico
  [...Object.keys(scalarOut), ...Object.keys(arrayOut)].sort().forEach((k) => {
    if (k in scalarOut) params.set(k, scalarOut[k]);
    else arrayOut[k].forEach((val) => params.append(k, val));
  });
  return params.toString();
}

export function buildCanonicalUrl(filters, coloniaFilter, baseUrl = '') {
  const qs = filtersToUrl(filters, coloniaFilter);
  return `${baseUrl}/marketplace${qs ? '?' + qs : ''}`;
}

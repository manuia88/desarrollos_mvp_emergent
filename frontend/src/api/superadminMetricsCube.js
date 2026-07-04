// W2.5 SA6 — Metrics Cube API client
const API = process.env.REACT_APP_BACKEND_URL;

const h = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('dmx_token')}`,
});

async function _j(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || d.message || msg; } catch {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return res.json();
}

const BASE = `${API}/api/superadmin/metrics-cube`;

export async function getTiers() {
  return _j(await fetch(`${BASE}/tiers`, { headers: h(), credentials: 'include' }));
}

export async function listTier(tier, { parentId, search, sort, period, limit, skip,
  sliceBy, propertyType, priceTier } = {}) {
  const p = new URLSearchParams();
  if (parentId) p.set('parent_id', parentId);
  if (search) p.set('search', search);
  if (sort) p.set('sort', sort);
  if (period) p.set('period', period);
  if (limit) p.set('limit', limit);
  if (skip) p.set('skip', skip);
  if (sliceBy) p.set('slice_by', sliceBy);
  if (propertyType) p.set('property_type', propertyType);
  if (priceTier) p.set('price_tier', priceTier);
  const qs = p.toString();
  return _j(await fetch(`${BASE}/${encodeURIComponent(tier)}${qs ? '?' + qs : ''}`,
    { headers: h(), credentials: 'include' }));
}

export async function getTierDetail(tier, tierId, { period, sliceBy, propertyType, priceTier } = {}) {
  const p = new URLSearchParams();
  if (period) p.set('period', period);
  if (sliceBy) p.set('slice_by', sliceBy);
  if (propertyType) p.set('property_type', propertyType);
  if (priceTier) p.set('price_tier', priceTier);
  const qs = p.toString();
  return _j(await fetch(`${BASE}/${encodeURIComponent(tier)}/${encodeURIComponent(tierId)}${qs ? '?' + qs : ''}`,
    { headers: h(), credentials: 'include' }));
}

export async function getTierChildren(tier, tierId, { period } = {}) {
  const qs = period ? `?period=${period}` : '';
  return _j(await fetch(
    `${BASE}/${encodeURIComponent(tier)}/${encodeURIComponent(tierId)}/children${qs}`,
    { headers: h(), credentials: 'include' }));
}

export async function getHeatmap({ metric, tier, period, bbox } = {}) {
  const p = new URLSearchParams();
  if (metric) p.set('metric', metric);
  if (tier) p.set('tier', tier);
  if (period) p.set('period', period);
  if (bbox) p.set('bbox', bbox);
  return _j(await fetch(`${BASE}/heatmap?${p.toString()}`,
    { headers: h(), credentials: 'include' }));
}

export async function getComparables(tierId, { radiusKm = 2, limit = 20 } = {}) {
  const p = new URLSearchParams({
    tier_id: tierId, radius_km: String(radiusKm), limit: String(limit),
  });
  return _j(await fetch(`${BASE}/comparables?${p.toString()}`,
    { headers: h(), credentials: 'include' }));
}

export async function getUnitDetail(unitId) {
  return _j(await fetch(`${BASE}/unit/${encodeURIComponent(unitId)}`,
    { headers: h(), credentials: 'include' }));
}

export async function refreshAggregations() {
  return _j(await fetch(`${BASE}/refresh`, { method: 'POST', headers: h(), credentials: 'include' }));
}

// W2.8 Phase Z.1 — Consolidated cube endpoints
export async function queryCrossCut({ dimensions, period, propertyType, priceTier, tier } = {}) {
  const p = new URLSearchParams();
  if (Array.isArray(dimensions)) p.set('dimensions', dimensions.join(','));
  else if (dimensions) p.set('dimensions', dimensions);
  if (period) p.set('period', period);
  if (propertyType) p.set('property_type', propertyType);
  if (priceTier) p.set('price_tier', priceTier);
  if (tier) p.set('tier', tier);
  return _j(await fetch(`${BASE}/cross-cut?${p.toString()}`,
    { headers: h(), credentials: 'include' }));
}

export async function compareZones(zoneIds, period = 'current') {
  return _j(await fetch(`${BASE}/compare`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({ zone_ids: zoneIds, period }),
  }));
}

export async function triggerBackfill(fromDate, toDate, zoneIds = null) {
  return _j(await fetch(`${BASE}/backfill`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({ from_date: fromDate, to_date: toDate, zone_ids: zoneIds }),
  }));
}

export async function getBackfillStatus(jobId) {
  return _j(await fetch(`${BASE}/backfill/${encodeURIComponent(jobId)}`,
    { headers: h(), credentials: 'include' }));
}

export async function getCacheStats() {
  return _j(await fetch(`${BASE}/cache-stats`, { headers: h(), credentials: 'include' }));
}

// Fase 3.1 · inteligencia del cubo (hedónico + demand-gap) para la god-view
export async function getCubeAmenityRanker(colonia) {
  const qs = colonia ? `?colonia=${encodeURIComponent(colonia)}` : '';
  return _j(await fetch(`${BASE}/amenity-ranker${qs}`, { headers: h(), credentials: 'include' }));
}
export async function getCubeDemandGap(top = 10) {
  return _j(await fetch(`${BASE}/demand-gap?top=${top}`, { headers: h(), credentials: 'include' }));
}

// Cubo Unificado — el CONTRATO: catálogo hipergranular (métricas × familia × granularidad × lineaje × k-anon)
export async function getCubeCatalog() {
  return _j(await fetch(`${BASE}/catalog`, { headers: h(), credentials: 'include' }));
}

// F3 · despachar el brief a los devs de la colonia + ver el retorno (respuestas de los devs)
export async function sendCubeProductBrief(briefId) {
  return _j(await fetch(`${BASE}/product-brief/${encodeURIComponent(briefId)}/send`, { method: 'POST', headers: h(), credentials: 'include' }));
}
export async function listCubeProductBriefs(estado) {
  const qs = estado ? `?estado=${encodeURIComponent(estado)}` : '';
  return _j(await fetch(`${BASE}/product-briefs${qs}`, { headers: h(), credentials: 'include' }));
}

// N5 Slice 1 — la ACCIÓN desde el cubo: genera y persiste el brief de producto para una colonia
// (reusa el generador del founder-console; F3 lo despacha al dev).
export async function createCubeProductBrief(colonia, { terrenoM2 = 1000, tipologia = null } = {}) {
  return _j(await fetch(`${BASE}/product-brief`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({ colonia, terreno_m2: terrenoM2, tipologia }),
  }));
}

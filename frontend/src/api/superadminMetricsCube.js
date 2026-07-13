// W2.5 SA6 — Metrics Cube API client
const API = process.env.REACT_APP_BACKEND_URL;

const h = () => ({
  'Content-Type': 'application/json',
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

// CUBO TOTAL F2 — CONSULTA LIBRE: filtros arbitrarios + agrupación (el motor del Explorador)
export async function runConsulta(filtros, agruparPor = [], universo = 'unidades') {
  return _j(await fetch(`${BASE}/consulta`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({ filtros, agrupar_por: agruparPor, universo }),
  }));
}
export async function getConsultaCampos() {
  return _j(await fetch(`${BASE}/consulta/campos`, { headers: h(), credentials: 'include' }));
}

// CUBO TOTAL F3 — Atlax compilador: pregunta en español → corte validado {filtros, agrupar_por, universo}
export async function parsePregunta(texto) {
  return _j(await fetch(`${BASE}/consulta/pregunta`, {
    method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify({ texto }),
  }));
}

// CUBO TOTAL F3 — espejo de demanda: el mismo corte del lado comprador. Con nOferta (unidades
// del corte) el back calcula la TENSIÓN oferta↔demanda (personas por unidad) + momentum.
export async function runEspejo(filtros, universo = 'unidades', nOferta = null) {
  return _j(await fetch(`${BASE}/consulta/espejo`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({ filtros, universo, n_oferta: nOferta }),
  }));
}

// CUBO TOTAL F5 — el tiempo del cubo: historia del corte guardado + eventos del átomo
export async function getVistaHistoria(viewId) {
  return _j(await fetch(`${BASE}/consulta/vistas/${encodeURIComponent(viewId)}/historia`, { headers: h(), credentials: 'include' }));
}
export async function publicarVista(viewId, publicado = true) {
  return _j(await fetch(`${BASE}/consulta/vistas/${encodeURIComponent(viewId)}/publicar`, {
    method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify({ publicado }),
  }));
}
export async function getAtomEventos(unitId) {
  return _j(await fetch(`${BASE}/atom/${encodeURIComponent(unitId)}/eventos`, { headers: h(), credentials: 'include' }));
}

// CUBO TOTAL F3 — vistas guardadas del Explorador (REUSA el CRUD de demand-intel, tipo 'explorador')
const VISTAS = `${API}/api/superadmin/demand-intel/vistas`;
export async function listVistas() {
  return _j(await fetch(VISTAS, { headers: h(), credentials: 'include' }));
}
export async function saveVista(nombre, definicion, alerta = null) {
  return _j(await fetch(VISTAS, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({ nombre, tipo: 'explorador', definicion, alerta }),
  }));
}
export async function deleteVista(viewId) {
  return _j(await fetch(`${VISTAS}/${encodeURIComponent(viewId)}`, {
    method: 'DELETE', headers: h(), credentials: 'include',
  }));
}

// Cubo Unificado — HISTORIA: series de tiempo del histórico materializado (dmx_market_snapshots).
// Sin tierId lista las entidades con serie disponible; con tierId devuelve la serie [{period,value}].
export async function getCubeTimeseries({ tier = 'colonia', tierId = '', measure = 'demand_interactions', gran = 'month', limit = 120 } = {}) {
  const p = new URLSearchParams({ tier, measure, gran, limit: String(limit) });
  if (tierId) p.set('tier_id', tierId);
  return _j(await fetch(`${API}/api/superadmin/demand-intel/timeseries?${p.toString()}`, { headers: h(), credentials: 'include' }));
}

// Cubo Unificado — la LENTE LICENCIABLE: agregados de mercado por colonia (k-anon, sin nombres de dev)
export async function getCubeLicensable(period = 'current') {
  return _j(await fetch(`${BASE}/licensable?period=${encodeURIComponent(period)}`, { headers: h(), credentials: 'include' }));
}

// Cubo Unificado — el ÁTOMO: una unidad con TODOS sus indicadores por familia (máxima hipergranularidad)
export async function getCubeAtom(unitId) {
  return _j(await fetch(`${BASE}/atom/${encodeURIComponent(unitId)}`, { headers: h(), credentials: 'include' }));
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

// Equilibrio 4S — god-view del dato real de estudios (competidores por estudio + gap radar + cobertura IAB).
export async function getMarket4sOverview() {
  return _j(await fetch(`${API}/api/superadmin/market-4s/overview`, { headers: h(), credentials: 'include' }));
}
export async function loadMarket4s() {
  return _j(await fetch(`${API}/api/superadmin/market-4s/load`, { method: 'POST', headers: h(), credentials: 'include' }));
}

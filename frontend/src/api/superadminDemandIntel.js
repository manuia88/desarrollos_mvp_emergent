// Inteligencia de demanda — cliente API
const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('dmx_token')}` });
async function _j(res) {
  if (!res.ok) { let m = `HTTP ${res.status}`; try { const d = await res.json(); m = d.detail || m; } catch {} throw new Error(m); }
  return res.json();
}
const BASE = `${API}/api/superadmin/demand-intel`;
const _qs = (o) => Object.entries(o || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export async function getOverview(params = {}) {
  return _j(await fetch(`${BASE}/overview?${_qs(params)}`, { headers: h(), credentials: 'include' }));
}
export async function getFeature(feature, colonia, period = 'month') {
  return _j(await fetch(`${BASE}/feature?${_qs({ feature, colonia, period })}`, { headers: h(), credentials: 'include' }));
}
// Dimensiones profundas: por-qué-NO, intent, qué compite, cuándo, journey.
export async function getDeep() {
  return _j(await fetch(`${BASE}/deep`, { headers: h(), credentials: 'include' }));
}
// 20 granularidades avanzadas (estacionalidad, balance, absorción, RFM, elasticidad, fugas, atribución, etc.).
export async function getGranularAdvanced() {
  return _j(await fetch(`${BASE}/granular-advanced`, { headers: h(), credentials: 'include' }));
}
// Dinámica de zona a 3 escalas + Índice de Inteligencia de Zona (fusión de 8 motores por colonia).
export async function getZonas() {
  return _j(await fetch(`${BASE}/zonas`, { headers: h(), credentials: 'include' }));
}
// Terminal de Zona — carga perezosa por eje (resumen/escalas/inteligencia/atributos/financiero/cruces/compuestas).
export async function getTerminal(axis = 'resumen') {
  return _j(await fetch(`${BASE}/terminal-zona?axis=${encodeURIComponent(axis)}`, { headers: h(), credentials: 'include' }));
}
// Grid de Métricas — el mapa de TODAS las medidas (oferta/demanda/cruce) × dimensiones, con celdas teóricas.
export async function getGridOverview() {
  return _j(await fetch(`${BASE}/grid/overview`, { headers: h(), credentials: 'include' }));
}
// Una celda del grid: valor + procedencia (de dónde sale el número). params: {measure, geo_nivel, geo_valor, tipologia, rango_m2, tier_precio, atributo, vista, etapa, ventana}.
export async function getGridCell(params = {}) {
  return _j(await fetch(`${BASE}/grid/cell?${_qs(params)}`, { headers: h(), credentials: 'include' }));
}
// Ranking de zonas por una medida. params: {measure, por, top}.
export async function getGridRanking(params = {}) {
  return _j(await fetch(`${BASE}/grid/ranking?${_qs(params)}`, { headers: h(), credentials: 'include' }));
}
// Insights redactados desde el grid (con n, cohorte y fuente).
export async function getGridInsights() {
  return _j(await fetch(`${BASE}/grid/insights`, { headers: h(), credentials: 'include' }));
}
// Atlas — navegación: hijos de una entidad (ciudad→alcaldía→corredor→colonia→desarrollo→prototipo→unidad).
export async function getAtlasChildren(tipo = 'ciudad', id = 'CDMX') {
  return _j(await fetch(`${BASE}/atlas/children?${_qs({ tipo, id })}`, { headers: h(), credentials: 'include' }));
}
// Atlas — ficha universal de métricas de una entidad (temas con procedencia + fusión + conductual + nav).
export async function getAtlasEntity(tipo, id, ventana = '90d') {
  return _j(await fetch(`${BASE}/atlas/entity?${_qs({ tipo, id, ventana })}`, { headers: h(), credentials: 'include' }));
}
// Explorador Faceteado — catálogo: poblaciones, facets por población, ventanas, series.
export async function getFacetCatalog() {
  return _j(await fetch(`${BASE}/facet/catalog`, { headers: h(), credentials: 'include' }));
}
// Conteo faceteado de OFERTA y DEMANDA (independiente + relacional/gap) por un facet, en geo+ventana. filtros = objeto → JSON.
export async function getFacetQuery({ poblacion, group_by, geo_nivel, geo_valor, ventana, filtros } = {}) {
  const params = { poblacion, group_by, geo_nivel, geo_valor, ventana };
  if (filtros && Object.keys(filtros).length > 0) params.filtros = JSON.stringify(filtros);
  return _j(await fetch(`${BASE}/facet/query?${_qs(params)}`, { headers: h(), credentials: 'include' }));
}
// Cross-tab 2D — facet_a × facet_b (conteos por celda).
export async function getFacetCrosstab({ poblacion, facet_a, facet_b, geo_nivel, geo_valor } = {}) {
  return _j(await fetch(`${BASE}/facet/crosstab?${_qs({ poblacion, facet_a, facet_b, geo_nivel, geo_valor })}`, { headers: h(), credentials: 'include' }));
}
// Serie temporal del conteo (por día/semana/quincena/mes, N periodos atrás).
export async function getFacetSerie({ granularidad, periodos, geo_nivel, geo_valor } = {}) {
  return _j(await fetch(`${BASE}/facet/serie?${_qs({ granularidad, periodos, geo_nivel, geo_valor })}`, { headers: h(), credentials: 'include' }));
}
// "Lo que NO existe" — huecos: búsquedas con 0 oferta (demanda insatisfecha).
export async function getFacetUnmet(top = 12) {
  return _j(await fetch(`${BASE}/facet/unmet?${_qs({ top })}`, { headers: h(), credentials: 'include' }));
}

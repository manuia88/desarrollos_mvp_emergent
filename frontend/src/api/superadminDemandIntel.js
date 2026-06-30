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
// Indicadores de ATRIBUTOS (estándar INDICADOR) — cada número con uso/fuente/comparativo/granularidad/dimensión. geo se omite si vacío.
export async function getIndicadoresAtributos({ geo_nivel, geo_valor } = {}) {
  return _j(await fetch(`${BASE}/indicadores/atributos?${_qs({ geo_nivel, geo_valor })}`, { headers: h(), credentials: 'include' }));
}
// Indicadores FINANCIERO (estándar INDICADOR) — cada número con uso/fuente/comparativo/granularidad/dimensión. geo se omite si vacío.
export async function getIndicadoresFinanciero({ geo_nivel, geo_valor } = {}) {
  return _j(await fetch(`${BASE}/indicadores/financiero?${_qs({ geo_nivel, geo_valor })}`, { headers: h(), credentials: 'include' }));
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
// Explorador (árbol) — un nodo: hijos (siguiente nivel) + cada segmento INDEPENDIENTE (oferta/demanda/gap) + fichas técnicas + características. id de unidad = "devid::unitnumber".
export async function getExplorar({ tipo = 'ciudad', id = 'CDMX', combinaciones = true } = {}) {
  return _j(await fetch(`${BASE}/explorar?${_qs({ tipo, id, combinaciones })}`, { headers: h(), credentials: 'include' }));
}
// Explorador · DRILL de un segmento (clic en '2rec'): OFERTA (entidades) + DEMANDA (perfil) + tensión. tipo/id/top como query, body={filtros,extra} JSON.
export async function postExplorarSegmento({ tipo = 'colonia', id = '', top = 60 } = {}, body = {}) {
  return _j(await fetch(`${BASE}/explorar/segmento?${_qs({ tipo, id, top })}`, {
    method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body || {}),
  }));
}
// Explorador · MODO AUTO — el cubo encuentra solo: oportunidades (demanda>oferta) + sobreofertas, rankeadas. geo se omite si vacío.
export async function getExplorarOportunidades({ geo_nivel, geo_valor, top = 15 } = {}) {
  return _j(await fetch(`${BASE}/explorar/oportunidades?${_qs({ geo_nivel, geo_valor, top })}`, { headers: h(), credentials: 'include' }));
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
// Drill-down ("cuáles") — LISTA de entidades reales detrás de un conteo. filtros = objeto → JSON.
export async function getFacetList({ poblacion, geo_nivel, geo_valor, ventana, filtros, limit } = {}) {
  const params = { poblacion, geo_nivel, geo_valor, ventana, limit };
  if (filtros && Object.keys(filtros).length > 0) params.filtros = JSON.stringify(filtros);
  return _j(await fetch(`${BASE}/facet/list?${_qs(params)}`, { headers: h(), credentials: 'include' }));
}
// Comparativas (¿por qué?) — catálogo: splits (atributo por el que partir) + outcomes (métrica de resultado).
export async function getCompareCatalog() {
  return _j(await fetch(`${BASE}/compare/catalog`, { headers: h(), credentials: 'include' }));
}
// Comparativas — parte los desarrollos por un split y compara una métrica de resultado entre grupos (+delta, lectura, procedencia).
export async function getCompareRun({ split, outcome, geo_nivel, geo_valor } = {}) {
  return _j(await fetch(`${BASE}/compare/run?${_qs({ split, outcome, geo_nivel, geo_valor })}`, { headers: h(), credentials: 'include' }));
}
// Comparativas — hallazgos automáticos ordenados por impacto (el porqué redactado, con confianza).
export async function getCompareInsights(top = 15) {
  return _j(await fetch(`${BASE}/compare/insights?${_qs({ top })}`, { headers: h(), credentials: 'include' }));
}
// Fechas de lanzamiento — cobertura (capturado/estimado/sin dato) + detalle por desarrollo. Base de las métricas de velocidad.
export async function getLaunchCoverage() {
  return _j(await fetch(`${BASE}/compare/launch-coverage`, { headers: h(), credentials: 'include' }));
}
// Fechas de lanzamiento — captura la fecha real de un desarrollo (AAAA-MM). Manda dev_id y fecha_lanzamiento como query params.
export async function setLaunch(dev_id, fecha_lanzamiento) {
  return _j(await fetch(`${BASE}/compare/set-launch?${_qs({ dev_id, fecha_lanzamiento })}`, { method: 'POST', headers: h(), credentials: 'include' }));
}
// Mapa de tensión — opciones del heatmap: métricas disponibles + dimensiones de segmento (con sus valores) + lectura.
export async function getHeatmapOpciones() {
  return _j(await fetch(`${BASE}/heatmap/opciones`, { headers: h(), credentials: 'include' }));
}
// Mapa de tensión — puntos por colonia recoloreables. Modo MÉTRICA (?metrica=...) o SEGMENTO (?dimension=...&valor=...). Params vacíos se omiten.
export async function getHeatmap({ metrica, dimension, valor } = {}) {
  return _j(await fetch(`${BASE}/heatmap?${_qs({ metrica, dimension, valor })}`, { headers: h(), credentials: 'include' }));
}
// Screener — métricas screenables + operadores (>,<,≥,≤,=) + un ejemplo de criterios para precargar.
export async function getScreenerMetricas() {
  return _j(await fetch(`${BASE}/screener/metricas`, { headers: h(), credentials: 'include' }));
}
// Screener — busca las colonias que cumplen TODOS los criterios. criterios = [{metrica, op, valor}] → BODY JSON. ordenar_por/desc/top como query params.
export async function postScreenerBuscar(criterios, { ordenar_por, desc = true, top = 40 } = {}) {
  return _j(await fetch(`${BASE}/screener/buscar?${_qs({ ordenar_por, desc, top })}`, {
    method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(criterios || []),
  }));
}

// ── Techo del cubo: what-if · lookalike · sankey · memorándum · simetría · vistas/alertas ──
export async function getWhatifOpciones() {
  return _j(await fetch(`${BASE}/whatif/opciones`, { headers: h(), credentials: 'include' }));
}
export async function getWhatif({ geo_valor, agregar, tipologia } = {}) {
  return _j(await fetch(`${BASE}/whatif?${_qs({ geo_valor, agregar, tipologia })}`, { headers: h(), credentials: 'include' }));
}
export async function getLookalike({ colonia, top = 6 } = {}) {
  return _j(await fetch(`${BASE}/lookalike?${_qs({ colonia, top })}`, { headers: h(), credentials: 'include' }));
}
export async function getSankey({ por = 'tipologia', geo_nivel, geo_valor } = {}) {
  return _j(await fetch(`${BASE}/sankey?${_qs({ por, geo_nivel, geo_valor })}`, { headers: h(), credentials: 'include' }));
}
export async function getMemorandum({ colonia } = {}) {
  return _j(await fetch(`${BASE}/memorandum?${_qs({ colonia })}`, { headers: h(), credentials: 'include' }));
}
export async function getSimetria({ geo_nivel, geo_valor } = {}) {
  return _j(await fetch(`${BASE}/simetria?${_qs({ geo_nivel, geo_valor })}`, { headers: h(), credentials: 'include' }));
}
export async function getVistas() {
  return _j(await fetch(`${BASE}/vistas`, { headers: h(), credentials: 'include' }));
}
export async function postVista(body) {
  return _j(await fetch(`${BASE}/vistas`, { method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body || {}) }));
}
export async function deleteVista(viewId) {
  return _j(await fetch(`${BASE}/vistas/${encodeURIComponent(viewId)}`, { method: 'DELETE', headers: h(), credentials: 'include' }));
}
export async function getVistasAlertas() {
  return _j(await fetch(`${BASE}/vistas/alertas`, { headers: h(), credentials: 'include' }));
}

// ── Saltos conceptuales: el cubo DISEÑA (auto-arquitecto) + ACTÚA (activación cross-portal) ──
export async function getDisenar({ colonia, top = 3 } = {}) {
  return _j(await fetch(`${BASE}/disenar?${_qs({ colonia, top })}`, { headers: h(), credentials: 'include' }));
}
export async function postActivar(body) {
  return _j(await fetch(`${BASE}/activar`, { method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body || {}) }));
}
export async function getAcciones({ destino, estado } = {}) {
  return _j(await fetch(`${BASE}/acciones?${_qs({ destino, estado })}`, { headers: h(), credentials: 'include' }));
}

// Catálogo de colonias para el picker compartido (workbench).
export async function getColonias() {
  return _j(await fetch(`${BASE}/colonias`, { headers: h(), credentials: 'include' }));
}

// Hub de motores — catálogo + correr cualquier motor del cubo (goal: 100% visibles).
export async function getEnginesCatalog() {
  return _j(await fetch(`${BASE}/engines/catalog`, { headers: h(), credentials: 'include' }));
}
export async function getEngineRun({ engine_id, colonia_id, alcaldia, dev_id, categoria } = {}) {
  return _j(await fetch(`${BASE}/engines/run?${_qs({ engine_id, colonia_id, alcaldia, dev_id, categoria })}`, { headers: h(), credentials: 'include' }));
}

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

// Match de una UNIDAD contra los criterios de búsqueda (mismo criterio que el backend unit-aware).
// Se usa para resaltar en la lista de precios cuál unidad cumple la búsqueda del comprador.
const KEY = 'dmx_match_criteria';

export function saveMatchCriteria(c) {
  try {
    if (c && Object.keys(c).length) sessionStorage.setItem(KEY, JSON.stringify({ ...c, _ts: Date.now() }));
    else sessionStorage.removeItem(KEY);
  } catch { /* noop */ }
}

export function readMatchCriteria() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    // Vale 45 min (es "la última búsqueda"); si es vieja, no resaltamos nada raro.
    if (c._ts && Date.now() - c._ts > 45 * 60 * 1000) return null;
    return c;
  } catch { return null; }
}

// Criterios FÍSICOS de la unidad (recámaras/baños/cajones/m²/precio/features/orientación). El enganche/mensualidad
// dependen del esquema del dev → no se resaltan aquí (se calculan en el buscador).
export function unitMatchesCriteria(u, c) {
  if (!u || !c) return false;
  if (u.status && u.status !== 'disponible') return false;
  if (c.beds && (u.bedrooms || 0) < c.beds) return false;
  if (c.baths && (u.bathrooms || 0) < c.baths) return false;
  if (c.parking && (u.parking_spots || 0) < c.parking) return false;
  const sqm = u.m2_total || u.m2_privative || 0;
  if (c.min_sqm && sqm < c.min_sqm) return false;
  if (c.max_sqm && sqm > c.max_sqm) return false;
  const pr = u.price || 0;
  if (c.min_price && pr < c.min_price) return false;
  if (c.max_price && pr > c.max_price) return false;
  for (const f of (c.unit_feature || [])) if (!u[f]) return false;
  if ((c.orientacion || []).length && !c.orientacion.map((o) => String(o).toLowerCase()).includes(String(u.orientation || '').toLowerCase())) return false;
  return true;
}

// Etiqueta humana de los criterios (para el banner "Tu búsqueda: …").
export function criteriaSummary(c) {
  if (!c) return '';
  const FEAT = { balcon: 'balcón', terraza: 'terraza', roof_garden: 'roof garden', bodega: 'bodega', estacionamiento_independiente: 'cajón independiente', pet_friendly: 'pet friendly' };
  const parts = [];
  if (c.beds) parts.push(`${c.beds}+ rec`);
  if (c.baths) parts.push(`${c.baths}+ baños`);
  if (c.parking) parts.push(`${c.parking}+ cajones`);
  if (c.min_sqm || c.max_sqm) parts.push(`${c.min_sqm || ''}${c.min_sqm && c.max_sqm ? '–' : ''}${c.max_sqm || ''} m²`);
  if (c.min_price || c.max_price) {
    const m = (n) => '$' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M';
    parts.push(c.min_price && c.max_price ? `${m(c.min_price)}–${m(c.max_price)}` : c.max_price ? `hasta ${m(c.max_price)}` : `desde ${m(c.min_price)}`);
  }
  (c.unit_feature || []).forEach((f) => parts.push(FEAT[f] || f));
  (c.orientacion || []).forEach((o) => parts.push(`orientación ${o}`));
  return parts.join(' · ');
}

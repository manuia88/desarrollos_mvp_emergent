// API helpers for marketplace
import { visitorId } from '../lib/buyerSignal';
const API = process.env.REACT_APP_BACKEND_URL;

// ─── Developments (new public marketplace model) ──────────────────────────────
export async function fetchDevelopments(filters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (Array.isArray(v)) v.forEach(x => qs.append(k, x));
    else qs.append(k, v);
  }
  const r = await fetch(`${API}/api/developments?${qs.toString()}`);
  if (!r.ok) throw new Error('developments fetch failed');
  return r.json();
}

export async function fetchDevelopment(id) {
  const r = await fetch(`${API}/api/developments/${id}`);
  if (!r.ok) throw new Error('development fetch failed');
  return r.json();
}

// "Los que más se asemejan" — cuando nada cumple TODO, rankea por criterios cumplidos + dice qué falta.
export async function fetchCasiCumple(filters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.append(k, v);
  }
  const r = await fetch(`${API}/api/developments/casi?${qs.toString()}`);
  if (!r.ok) return { casi: [] };
  return r.json();
}

// ¿Es Buena Compra? — precio justo (AVM) + buen momento (ciclo) + veredicto. Opcional por-unidad.
export async function fetchBuySignal(devId, unit = {}) {
  const qs = new URLSearchParams();
  if (unit.price) qs.set('price', unit.price);
  if (unit.m2) qs.set('m2', unit.m2);
  if (unit.rec != null) qs.set('rec', unit.rec);
  if (unit.ban != null) qs.set('ban', unit.ban);
  const q = qs.toString();
  const r = await fetch(`${API}/api/public/buy-signal/${devId}${q ? `?${q}` : ''}`);
  if (!r.ok) throw new Error('buy-signal fetch failed');
  return r.json();
}

// ¿Me conviene comprar? — rentar vs comprar (A03) + costo total a N años (A05).
export async function fetchOwnership(devId, opts = {}) {
  const enganche = opts.engancheRatio != null ? opts.engancheRatio : 0.20;
  const years = opts.years != null ? opts.years : 10;
  const qs = new URLSearchParams({ enganche_pct: String(enganche), years: String(years) });
  if (opts.price) qs.set('price', opts.price);
  if (opts.m2) qs.set('m2', opts.m2);
  const r = await fetch(`${API}/api/public/ownership/${devId}?${qs.toString()}`);
  if (!r.ok) throw new Error('ownership fetch failed');
  return r.json();
}

// B2.1 — Fotos reales del comprador (watermarked). Sírvelas con `${API}${public_url}`.
// Fail-open: devuelve {count:0, assets:[]} si falla, para no romper la ficha.
export async function fetchDevelopmentAssets(id, assetType = null) {
  const qs = assetType ? `?asset_type=${encodeURIComponent(assetType)}` : '';
  try {
    const r = await fetch(`${API}/api/developments/${encodeURIComponent(id)}/assets${qs}`);
    if (!r.ok) return { count: 0, assets: [] };
    return r.json();
  } catch {
    return { count: 0, assets: [] };
  }
}

export async function fetchDevelopmentUnits(id, filters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '') continue;
    qs.append(k, v);
  }
  const r = await fetch(`${API}/api/developments/${id}/units?${qs.toString()}`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchSimilarDevelopments(id) {
  const r = await fetch(`${API}/api/developments/${id}/similar`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchDeveloper(id) {
  const r = await fetch(`${API}/api/developers/${id}`);
  if (!r.ok) throw new Error('developer fetch failed');
  return r.json();
}

export async function fetchDevBriefing(id) {
  const r = await fetch(`${API}/api/developments/${id}/briefing`, { method: 'POST' });
  if (!r.ok) throw new Error('briefing failed');
  return r.json();
}

export async function aiSearchParse(query) {
  const r = await fetch(`${API}/api/properties/search-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) return { filters: {}, query };
  return r.json();
}

// CUBO F4.1 — espejo personal del corte: bandas de demanda k-anon ("10-24 personas buscan esto")
// + unidades disponibles del corte. Nunca conteos exactos (lente pública del cubo).
export async function fetchEspejoCorte(filters) {
  let visitor_id = null;
  try { visitor_id = visitorId(); } catch { /* noop */ }
  const r = await fetch(`${API}/api/properties/espejo-corte`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters, visitor_id }),
  });
  if (!r.ok) return { ok: false };
  return r.json();
}

// ─── Colonias / legacy Phase 3 properties (kept for existing detail page) ────

export async function fetchColonias() {
  const r = await fetch(`${API}/api/colonias`);
  if (!r.ok) throw new Error('colonias fetch failed');
  return r.json();
}

export async function fetchColonia(id) {
  const r = await fetch(`${API}/api/colonias/${id}`);
  if (!r.ok) throw new Error('colonia fetch failed');
  return r.json();
}

export async function fetchProperties(filters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (Array.isArray(v)) v.forEach(x => qs.append(k, x));
    else qs.append(k, v);
  }
  const r = await fetch(`${API}/api/properties?${qs.toString()}`);
  if (!r.ok) throw new Error('properties fetch failed');
  return r.json();
}

export async function fetchProperty(id) {
  const r = await fetch(`${API}/api/properties/${id}`);
  if (!r.ok) throw new Error('property fetch failed');
  return r.json();
}

export async function fetchSimilar(id) {
  const r = await fetch(`${API}/api/properties/${id}/similares`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchBriefing(id) {
  const r = await fetch(`${API}/api/properties/${id}/briefing`, { method: 'POST' });
  if (!r.ok) throw new Error('briefing failed');
  return r.json();
}

// ─── Batch 24 — Map Intelligence ─────────────────────────────────────────────

export async function fetchHeatmapLayer(layer = 'price', zoomLevel = 3, bbox = null) {
  const qs = new URLSearchParams({ layer, zoom_level: zoomLevel });
  if (bbox) qs.set('bbox', bbox);
  const r = await fetch(`${API}/api/public/map/heatmap?${qs.toString()}`);
  if (!r.ok) throw new Error('heatmap fetch failed');
  return r.json();
}

export async function fetchMapLevels() {
  const r = await fetch(`${API}/api/public/map/levels`);
  if (!r.ok) throw new Error('map levels fetch failed');
  return r.json();
}

export async function fetchColoniaFull(coloniaId) {
  const r = await fetch(`${API}/api/public/map/colonia/${coloniaId}`);
  if (!r.ok) throw new Error(`colonia ${coloniaId} fetch failed`);
  return r.json();
}

export async function searchByImage(file) {
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${API}/api/public/search/by-image`, {
    method: 'POST',
    body: form,
  });
  if (r.status === 429) throw new Error('Demasiadas solicitudes. Espera 1 minuto e intenta de nuevo.');
  if (r.status === 413) throw new Error('Imagen demasiado grande. Máximo 5 MB.');
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.detail || 'Error en búsqueda por imagen');
  }
  return r.json();
}

// ─── Batch 25 — External Search + Saved Searches ─────────────────────────────

export async function parseExternalUrl(url) {
  const r = await fetch(`${API}/api/public/search/by-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (r.status === 429) throw new Error('Demasiadas solicitudes. Espera 1 minuto e intenta de nuevo.');
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || data.error || 'Error al procesar la URL');
  return data;
}

export async function saveSearch(email, filters, alertFrequency = 'weekly', visitorId = null) {
  const r = await fetch(`${API}/api/public/saved-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, filters, alert_frequency: alertFrequency, visitor_id: visitorId }),
  });
  if (r.status === 429) throw new Error('Demasiadas solicitudes. Intenta en 1 minuto.');
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error al guardar la búsqueda');
  return data;
}

// ─── Batch 26 — Lead-Capture Tools (Reporte + Quiz + Comparador) ────────────

export async function requestColoniaReport(coloniaId, email, acceptedTerms = true) {
  const r = await fetch(`${API}/api/public/colonia/${encodeURIComponent(coloniaId)}/report-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, accepted_terms: acceptedTerms }),
  });
  if (r.status === 429) throw new Error('Demasiadas solicitudes. Intenta en 1 minuto.');
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error generando el reporte');
  return data;
}

export async function submitQuiz(email, answers, acceptedTerms = true) {
  const r = await fetch(`${API}/api/public/quiz/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, answers, accepted_terms: acceptedTerms }),
  });
  if (r.status === 429) throw new Error('Demasiadas solicitudes. Intenta en 1 minuto.');
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error al procesar tu quiz');
  return data;
}

export async function compareEntities(entityType, ids) {
  const r = await fetch(`${API}/api/public/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type: entityType, ids }),
  });
  if (r.status === 429) throw new Error('Demasiadas solicitudes. Intenta en 1 minuto.');
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || data.error || 'Error en la comparación');
  return data;
}

export async function downloadComparePdf(entityType, ids) {
  const r = await fetch(`${API}/api/public/compare/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type: entityType, ids }),
  });
  if (!r.ok) throw new Error('Error generando el PDF');
  return r.blob();
}

export async function compareEntitiesBuyer(entityType, ids) {
  const r = await fetch(`${API}/api/comprador/compare`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type: entityType, ids }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.detail || data.error || 'Error en la comparación premium');
  }
  return r.json();
}

export async function downloadComparePdfBuyer(entityType, ids) {
  const r = await fetch(`${API}/api/comprador/compare/pdf`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type: entityType, ids }),
  });
  if (!r.ok) throw new Error('Error generando el PDF premium');
  return r.blob();
}

// ─── Batch 27 — Mortgage Calculator + Colonia History + Share ───────────────

export async function calculateMortgage(payload) {
  const r = await fetch(`${API}/api/public/mortgage/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (r.status === 429) throw new Error('Demasiadas solicitudes. Intenta en 1 minuto.');
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error al calcular hipoteca');
  return data;
}

export async function saveMortgage(email, calculation, propiedadId, acceptedTerms = true) {
  const r = await fetch(`${API}/api/public/mortgage/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email, calculation, propiedad_id: propiedadId, accepted_terms: acceptedTerms,
    }),
  });
  if (r.status === 429) throw new Error('Demasiadas solicitudes. Intenta en 1 minuto.');
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error al guardar el cálculo');
  return data;
}

export async function fetchColoniaHistory(coloniaId) {
  const r = await fetch(`${API}/api/public/colonia/${encodeURIComponent(coloniaId)}/history`);
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error(`historia colonia ${coloniaId} fetch failed`);
  }
  return r.json();
}

export async function fetchShareMeta(entityType, ids) {
  const qs = new URLSearchParams({ type: entityType, ids: ids.join(',') });
  const r = await fetch(`${API}/api/share/comparar/meta?${qs.toString()}`);
  if (!r.ok) throw new Error('share meta fetch failed');
  return r.json();
}

export function buildShareOgImageUrl(entityType, ids) {
  const qs = new URLSearchParams({ type: entityType, ids: ids.join(',') });
  return `${API}/api/share/comparar/og-image?${qs.toString()}`;
}

export async function captureTourRequest(propiedadId, propiedadNombre, email) {
  const r = await fetch(`${API}/api/public/virtual-tour/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      accepted_terms: true,
      propiedad_id: propiedadId,
      propiedad_nombre: propiedadNombre,
    }),
  });
  if (r.status === 429) throw new Error('Demasiadas solicitudes. Intenta en 1 minuto.');
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error al registrar solicitud de tour');
  return data;
}

// ─── Favorites in localStorage
const FAV_KEY = 'dmx.favorites';
export function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
}
export function isFavorite(id) { return getFavorites().includes(id); }
export function toggleFavorite(id) {
  const cur = getFavorites();
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  localStorage.setItem(FAV_KEY, JSON.stringify(next));
  // Avisa a la UI (nav contador + toast) que el set de favoritos cambió.
  try { window.dispatchEvent(new CustomEvent('dmx:favorites', { detail: { count: next.length, added: next.includes(id) } })); } catch { /* noop */ }
  return next.includes(id);
}

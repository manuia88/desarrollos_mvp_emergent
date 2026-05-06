// API helpers for marketplace
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

export async function saveSearch(email, filters, alertFrequency = 'weekly') {
  const r = await fetch(`${API}/api/public/saved-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, filters, alert_frequency: alertFrequency }),
  });
  if (r.status === 429) throw new Error('Demasiadas solicitudes. Intenta en 1 minuto.');
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error al guardar la búsqueda');
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
  return next.includes(id);
}

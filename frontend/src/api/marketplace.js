// API helpers for marketplace
const API = process.env.REACT_APP_BACKEND_URL;

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

// Favorites in localStorage
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

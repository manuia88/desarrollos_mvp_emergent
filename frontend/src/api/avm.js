// W5.1 Sub-Chunk C — API helper para AVM (frontend).
// Centraliza fetch /api/avm-public/* para reuso entre Valores, Widget y Landing.

const API = process.env.REACT_APP_BACKEND_URL;

export async function fetchAvmQuick({ coloniaSlug, m2, recamaras, banos, antiguedadAnos, explain = false }) {
  const params = new URLSearchParams({
    colonia_slug: coloniaSlug,
    m2: String(m2),
    recamaras: String(recamaras),
    banos: String(banos),
    antiguedad_anos: String(antiguedadAnos),
    explain: explain ? 'true' : 'false',
  });
  const r = await fetch(`${API}/api/avm-public/quick?${params}`);
  if (!r.ok) {
    if (r.status === 429) throw new Error('Demasiadas peticiones. Espera 1 minuto.');
    if (r.status === 404) throw new Error('Colonia no encontrada.');
    throw new Error(`Error ${r.status}`);
  }
  return r.json();
}

export async function fetchTopColonias(limit = 30) {
  const r = await fetch(`${API}/api/avm-public/colonias/top?limit=${limit}`);
  if (!r.ok) return { colonias: [] };
  return r.json();
}

export async function fetchAvmWidgetConfig(slug, theme = 'dark') {
  const r = await fetch(`${API}/api/avm-public/widget-config/${encodeURIComponent(slug)}?theme=${theme}`);
  if (!r.ok) throw new Error(`widget_config_${r.status}`);
  return r.json();
}

export async function fetchAvmLanding(slug) {
  const r = await fetch(`${API}/api/avm-public/landing/${encodeURIComponent(slug)}`);
  if (!r.ok) throw new Error(`landing_${r.status}`);
  return r.json();
}

// ─── Superadmin ───────────────────────────────────────────────────────────────
function authHeaders() {
  const t = localStorage.getItem('dmx_token') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const credsInit = { credentials: 'include', headers: authHeaders() };

export async function fetchAvmAccuracySummary() {
  const r = await fetch(`${API}/api/superadmin/avm-accuracy/summary`, { ...credsInit, headers: authHeaders() });
  if (!r.ok) throw new Error(`accuracy_summary_${r.status}`);
  return r.json();
}

export async function fetchAvmPromotions(limit = 100) {
  const r = await fetch(`${API}/api/superadmin/avm-accuracy/promotions?limit=${limit}`, { credentials: 'include', headers: authHeaders() });
  if (!r.ok) throw new Error(`accuracy_promotions_${r.status}`);
  return r.json();
}

export async function triggerAvmRetrain() {
  const r = await fetch(`${API}/api/superadmin/avm-accuracy/trigger-retrain`, {
    method: 'POST', credentials: 'include', headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`trigger_retrain_${r.status}`);
  return r.json();
}

export async function fetchAvmGoldenValidation() {
  const r = await fetch(`${API}/api/superadmin/avm-accuracy/golden-validation`, { credentials: 'include', headers: authHeaders() });
  if (!r.ok) throw new Error(`golden_${r.status}`);
  return r.json();
}

export async function invalidateAvmCache() {
  const r = await fetch(`${API}/api/superadmin/avm-accuracy/cache-invalidate`, {
    method: 'POST', credentials: 'include', headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`cache_invalidate_${r.status}`);
  return r.json();
}

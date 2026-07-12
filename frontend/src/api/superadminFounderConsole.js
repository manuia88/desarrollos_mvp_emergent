// W2.6 SA8 — Founder Console API client
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

const BASE = `${API}/api/superadmin/founder-console`;

export async function getDashboard() {
  return _j(await fetch(`${BASE}/dashboard`, { headers: h(), credentials: 'include' }));
}

// Oportunidad #3: demanda → "¿dónde construir?" (interés por zona + qué no encontraron)
export async function getDemandInsights(limit = 12) {
  return _j(await fetch(`${BASE}/demand-insights?limit=${limit}`, { headers: h(), credentials: 'include' }));
}

// Oportunidad #5: devs rechazados por sus FOTOS → pipeline de venta de Studio
export async function getStudioOpportunities() {
  return _j(await fetch(`${BASE}/studio-opportunities`, { headers: h(), credentials: 'include' }));
}

// Diseño generativo de producto: dada una colonia → la mezcla óptima que la demanda quiere
export async function getProductBrief(colonia, terrenoM2 = 1000) {
  return _j(await fetch(`${BASE}/product-brief?colonia=${encodeURIComponent(colonia)}&terreno_m2=${terrenoM2}`, { headers: h(), credentials: 'include' }));
}

// Gemelo de Demanda — el "SimCity de la demanda de MX": por zona, demanda+oferta+hueco+oportunidad
export async function getDemandTwin(limit = 60) {
  return _j(await fetch(`${BASE}/demand-twin?limit=${limit}`, { headers: h(), credentials: 'include' }));
}

export async function listAnomalies({ status, severity, source, limit, skip } = {}) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (severity) p.set('severity', severity);
  if (source) p.set('source', source);
  if (limit) p.set('limit', limit);
  if (skip) p.set('skip', skip);
  const qs = p.toString();
  return _j(await fetch(`${BASE}/anomalies${qs ? '?' + qs : ''}`,
    { headers: h(), credentials: 'include' }));
}

export async function resolveAnomaly(id, resolution_note = '') {
  return _j(await fetch(`${BASE}/anomalies/${encodeURIComponent(id)}/resolve`,
    { method: 'POST', headers: h(), credentials: 'include',
      body: JSON.stringify({ resolution_note }) }));
}

export async function dismissAnomaly(id, reason = '') {
  return _j(await fetch(`${BASE}/anomalies/${encodeURIComponent(id)}/dismiss`,
    { method: 'POST', headers: h(), credentials: 'include',
      body: JSON.stringify({ reason }) }));
}

export async function detectAnomaliesNow() {
  return _j(await fetch(`${BASE}/anomalies/detect-now`,
    { method: 'POST', headers: h(), credentials: 'include' }));
}

export async function searchCommands(q = '', limit = 50) {
  const p = new URLSearchParams({ limit: String(limit) });
  if (q) p.set('q', q);
  return _j(await fetch(`${BASE}/commands?${p.toString()}`,
    { headers: h(), credentials: 'include' }));
}

export async function executeCommand(command_id, payload = null) {
  return _j(await fetch(`${BASE}/commands/execute`,
    { method: 'POST', headers: h(), credentials: 'include',
      body: JSON.stringify({ command_id, payload }) }));
}

export async function listQuickActions() {
  return _j(await fetch(`${BASE}/quick-actions`,
    { headers: h(), credentials: 'include' }));
}

export async function createQuickAction(body) {
  return _j(await fetch(`${BASE}/quick-actions`,
    { method: 'POST', headers: h(), credentials: 'include',
      body: JSON.stringify(body) }));
}

export async function deleteQuickAction(id) {
  return _j(await fetch(`${BASE}/quick-actions/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: h(), credentials: 'include' }));
}

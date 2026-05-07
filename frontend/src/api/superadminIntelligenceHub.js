// W2.9 Phase Z.2 — Intelligence Hub API client
const API = process.env.REACT_APP_BACKEND_URL;

const h = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('dmx_token')}`,
});

async function _j(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || d.message || msg; } catch {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return res.json();
}

const BASE = `${API}/api/superadmin/intelligence-hub`;

export async function getOverview() {
  return _j(await fetch(`${BASE}/overview`, { headers: h(), credentials: 'include' }));
}

export async function getInsights({ zone_id, tier = 'colonia', period = 'current' }) {
  const p = new URLSearchParams({ zone_id, tier, period });
  return _j(await fetch(`${BASE}/insights?${p.toString()}`,
    { headers: h(), credentials: 'include' }));
}

export async function generateInsights({ zone_id, tier = 'colonia', period = 'current', force = false }) {
  return _j(await fetch(`${BASE}/insights/generate`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({ zone_id, tier, period, force }),
  }));
}

export async function getHeatmapMulti({ layers, tier = 'colonia', bbox } = {}) {
  const p = new URLSearchParams();
  if (layers) p.set('layers', Array.isArray(layers) ? layers.join(',') : layers);
  if (tier) p.set('tier', tier);
  if (bbox) p.set('bbox', bbox);
  return _j(await fetch(`${BASE}/heatmap-multi?${p.toString()}`,
    { headers: h(), credentials: 'include' }));
}

export async function getComparablesMatrix({ zone_id, radius_km = 2, limit = 10 }) {
  const p = new URLSearchParams({ zone_id, radius_km: String(radius_km), limit: String(limit) });
  return _j(await fetch(`${BASE}/comparables-matrix?${p.toString()}`,
    { headers: h(), credentials: 'include' }));
}

export function exportPdfUrl({ zone_id, tier = 'colonia', period = 'current' }) {
  const p = new URLSearchParams({ zone_id, tier, period });
  return `${BASE}/export/pdf?${p.toString()}`;
}

export async function downloadPdf({ zone_id, tier = 'colonia', period = 'current' }) {
  const res = await fetch(exportPdfUrl({ zone_id, tier, period }),
    { headers: { Authorization: `Bearer ${localStorage.getItem('dmx_token')}` },
      credentials: 'include' });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || msg; } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dmx-intelligence-${zone_id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true, size: blob.size };
}

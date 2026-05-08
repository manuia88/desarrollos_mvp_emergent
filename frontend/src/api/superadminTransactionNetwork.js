// W3.2 Transaction Network — API client (7 functions)
const API = process.env.REACT_APP_BACKEND_URL;
const BASE = `${API}/api/superadmin/transactions`;

const _h = () => ({
  Authorization: `Bearer ${localStorage.getItem('dmx_token')}`,
});

async function _j(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || d.message || msg; } catch {}
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export async function listTransactions({ zone_id, tier, type, from_ts, to_ts, limit = 50, skip = 0 } = {}) {
  const p = new URLSearchParams({ limit, skip });
  if (zone_id) p.set('zone_id', zone_id);
  if (tier) p.set('tier', tier);
  if (type) p.set('type', type);
  if (from_ts) p.set('from_ts', from_ts);
  if (to_ts) p.set('to_ts', to_ts);
  return _j(await fetch(`${BASE}?${p}`, { headers: _h(), credentials: 'include' }));
}

export async function getComparables({ lat, lng, zone_id, m2, type = 'depto', radius_km = 2, limit = 20 } = {}) {
  const p = new URLSearchParams({ type, radius_km, limit });
  if (lat != null) p.set('lat', lat);
  if (lng != null) p.set('lng', lng);
  if (zone_id) p.set('zone_id', zone_id);
  if (m2) p.set('m2', m2);
  return _j(await fetch(`${BASE}/comparables?${p}`, { headers: _h(), credentials: 'include' }));
}

export async function getPriceIndex(zone_id, { tier = 'colonia', type = 'depto', period = 'month' } = {}) {
  const p = new URLSearchParams({ tier, type, period });
  return _j(await fetch(`${BASE}/price-index/${encodeURIComponent(zone_id)}?${p}`, { headers: _h(), credentials: 'include' }));
}

export async function getPriceIndexHeatmap({ metric = 'median_price_per_m2', tier = 'colonia', type = 'depto', period = 'month' } = {}) {
  const p = new URLSearchParams({ metric, tier, type, period });
  return _j(await fetch(`${BASE}/price-index/heatmap?${p}`, { headers: _h(), credentials: 'include' }));
}

export async function detectAnomaly(body) {
  return _j(await fetch(`${BASE}/detect-anomaly`, {
    method: 'POST',
    headers: { ...(_h()), 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  }));
}

export async function manualIngestCSV(file, source = 'bulk_ingest') {
  const fd = new FormData();
  fd.append('file', file);
  const p = new URLSearchParams({ source });
  return _j(await fetch(`${BASE}/manual-ingest?${p}`, {
    method: 'POST',
    headers: _h(),
    credentials: 'include',
    body: fd,
  }));
}

export async function getStats() {
  return _j(await fetch(`${BASE}/stats`, { headers: _h(), credentials: 'include' }));
}

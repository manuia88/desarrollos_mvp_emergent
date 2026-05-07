// W2.5 SA6 — Metrics Cube API client
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

const BASE = `${API}/api/superadmin/metrics-cube`;

export async function getTiers() {
  return _j(await fetch(`${BASE}/tiers`, { headers: h(), credentials: 'include' }));
}

export async function listTier(tier, { parentId, search, sort, period, limit, skip } = {}) {
  const p = new URLSearchParams();
  if (parentId) p.set('parent_id', parentId);
  if (search) p.set('search', search);
  if (sort) p.set('sort', sort);
  if (period) p.set('period', period);
  if (limit) p.set('limit', limit);
  if (skip) p.set('skip', skip);
  const qs = p.toString();
  return _j(await fetch(`${BASE}/${encodeURIComponent(tier)}${qs ? '?' + qs : ''}`,
    { headers: h(), credentials: 'include' }));
}

export async function getTierDetail(tier, tierId, { period } = {}) {
  const qs = period ? `?period=${period}` : '';
  return _j(await fetch(`${BASE}/${encodeURIComponent(tier)}/${encodeURIComponent(tierId)}${qs}`,
    { headers: h(), credentials: 'include' }));
}

export async function getTierChildren(tier, tierId, { period } = {}) {
  const qs = period ? `?period=${period}` : '';
  return _j(await fetch(
    `${BASE}/${encodeURIComponent(tier)}/${encodeURIComponent(tierId)}/children${qs}`,
    { headers: h(), credentials: 'include' }));
}

export async function getHeatmap({ metric, tier, period, bbox } = {}) {
  const p = new URLSearchParams();
  if (metric) p.set('metric', metric);
  if (tier) p.set('tier', tier);
  if (period) p.set('period', period);
  if (bbox) p.set('bbox', bbox);
  return _j(await fetch(`${BASE}/heatmap?${p.toString()}`,
    { headers: h(), credentials: 'include' }));
}

export async function getComparables(tierId, { radiusKm = 2, limit = 20 } = {}) {
  const p = new URLSearchParams({
    tier_id: tierId, radius_km: String(radiusKm), limit: String(limit),
  });
  return _j(await fetch(`${BASE}/comparables?${p.toString()}`,
    { headers: h(), credentials: 'include' }));
}

export async function getUnitDetail(unitId) {
  return _j(await fetch(`${BASE}/unit/${encodeURIComponent(unitId)}`,
    { headers: h(), credentials: 'include' }));
}

export async function refreshAggregations() {
  return _j(await fetch(`${BASE}/refresh`, { method: 'POST', headers: h(), credentials: 'include' }));
}

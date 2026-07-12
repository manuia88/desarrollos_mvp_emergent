// W3.1A Phase 5 Foundation — API client
// 9 functions for DENUE, Construction Cost, and Zone Score endpoints
const API = process.env.REACT_APP_BACKEND_URL;
const BASE = `${API}/api/superadmin/phase5`;
const PUB = `${API}/api/public`;

const _h = () => ({
  'Content-Type': 'application/json',
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

// ─── DENUE ────────────────────────────────────────────────────────────────────

export async function getDenueDensity(zone_id, force = false) {
  const p = new URLSearchParams({ ...(force ? { force: 'true' } : {}) });
  const qs = p.toString() ? `?${p}` : '';
  return _j(await fetch(`${BASE}/denue/zone/${encodeURIComponent(zone_id)}/density${qs}`,
    { headers: _h(), credentials: 'include' }));
}

export async function lookupBusiness(empresa, limit = 20) {
  const p = new URLSearchParams({ empresa, limit: String(limit) });
  return _j(await fetch(`${BASE}/denue/business/lookup?${p}`,
    { headers: _h(), credentials: 'include' }));
}

export async function syncDenueZone(zone_id) {
  return _j(await fetch(`${BASE}/denue/sync/zone/${encodeURIComponent(zone_id)}`, {
    method: 'POST', headers: _h(), credentials: 'include',
  }));
}

// ─── Construction Cost ────────────────────────────────────────────────────────

export async function getConstructionCost(zone_id, type = 'vertical', tier = 'mid') {
  const p = new URLSearchParams({ type, tier });
  return _j(await fetch(`${BASE}/construction-cost/zone/${encodeURIComponent(zone_id)}?${p}`,
    { headers: _h(), credentials: 'include' }));
}

export async function forecastConstructionCost({ zone_id, m2, tier = 'mid', building_type = 'vertical' }) {
  return _j(await fetch(`${BASE}/construction-cost/forecast`, {
    method: 'POST', headers: _h(), credentials: 'include',
    body: JSON.stringify({ zone_id, m2, tier, building_type }),
  }));
}

// ─── Zone Scores ──────────────────────────────────────────────────────────────

export async function getZoneScore(zone_id, force = false) {
  const p = force ? '?force=true' : '';
  return _j(await fetch(`${BASE}/zone-score/${encodeURIComponent(zone_id)}${p}`,
    { headers: _h(), credentials: 'include' }));
}

export async function listZoneScores(tier = '', limit = 50) {
  const p = new URLSearchParams({ limit: String(limit), ...(tier ? { tier } : {}) });
  return _j(await fetch(`${BASE}/zone-score/all?${p}`,
    { headers: _h(), credentials: 'include' }));
}

export async function getZoneScoreHistory(zone_id, days = 90) {
  const p = new URLSearchParams({ days: String(days) });
  return _j(await fetch(`${BASE}/zone-score/${encodeURIComponent(zone_id)}/history?${p}`,
    { headers: _h(), credentials: 'include' }));
}

// ─── Public (no auth) ─────────────────────────────────────────────────────────

export async function getPublicZoneScore(zone_id) {
  return _j(await fetch(`${PUB}/zone-score/${encodeURIComponent(zone_id)}`,
    { credentials: 'include' }));
}

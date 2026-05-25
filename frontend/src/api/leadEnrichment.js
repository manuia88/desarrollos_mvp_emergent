/**
 * W7.AS.1 — Lead Enrichment Clay-style · API client (4 endpoints).
 */
const API = process.env.REACT_APP_BACKEND_URL;

async function _get(url) {
  const r = await fetch(`${API}${url}`, { credentials: 'include' });
  let body = {};
  try { body = await r.json(); } catch (_) { body = {}; }
  return { ok: r.ok, status: r.status, body };
}

async function _post(url, payload) {
  const r = await fetch(`${API}${url}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  let body = {};
  try { body = await r.json(); } catch (_) { body = {}; }
  return { ok: r.ok, status: r.status, body };
}

export const enrichLead = (lead_id, force_refresh = false) =>
  _post(`/api/leads/${encodeURIComponent(lead_id)}/enrich`, { force_refresh });

export const enrichLeadsBulk = (lead_ids, force_refresh = false) =>
  _post('/api/leads/enrich-bulk', { lead_ids, force_refresh });

export const getEnrichmentCache = (lead_id) =>
  _get(`/api/leads/${encodeURIComponent(lead_id)}/enrichment-cache`);

export const getEnrichmentStats = (days = 30, tenant_id = '') => {
  const q = new URLSearchParams();
  if (days) q.set('days', String(days));
  if (tenant_id) q.set('tenant_id', tenant_id);
  return _get(`/api/superadmin/lead-enrichment/stats?${q.toString()}`);
};

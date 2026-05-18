/**
 * W5.15 Parte 2 — Accuracy / Confianza API client.
 * 9 endpoints publicos + superadmin + PDF download.
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

// Publicos
export const getFsd = (property_id) =>
  _get(`/api/avm/fsd/${encodeURIComponent(property_id)}`);
export const getMetaDashboard = () => _get('/api/accuracy/meta-dashboard');
export const exportCsvUrl = (period = '30d') => `${API}/api/accuracy/export.csv?period=${period}`;
export const exportPdfUrl = (period = '30d') => `${API}/api/accuracy/export.pdf?period=${period}`;

// Superadmin
export const getPerZone = () => _get('/api/accuracy/per-zone');
export const getCalibrationCurve = (days = 90, bins = 10) =>
  _get(`/api/accuracy/calibration-curve?days=${days}&bins=${bins}`);
export const getDebugProperty = (property_id, days = 30) =>
  _get(`/api/superadmin/accuracy/debug?property_id=${encodeURIComponent(property_id)}&days=${days}`);
export const getZoneWeights = () => _get('/api/superadmin/accuracy/zone-weights');
export const triggerDriftCheck = (zone_slug) =>
  _post(`/api/superadmin/accuracy/trigger-drift-check?zone_slug=${encodeURIComponent(zone_slug)}`, {});

const accuracyApi = {
  getFsd, getMetaDashboard, exportCsvUrl, exportPdfUrl,
  getPerZone, getCalibrationCurve, getDebugProperty, getZoneWeights, triggerDriftCheck,
};
export default accuracyApi;

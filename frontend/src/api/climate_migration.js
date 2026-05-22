// W5.9 · API wrappers para Climate Migration · fail-silent en 404
const BASE = process.env.REACT_APP_BACKEND_URL;

const _safe = async (url, fallback) => {
  try {
    const r = await fetch(`${BASE}${url}`, { credentials: 'include' });
    if (!r.ok) return fallback;
    return await r.json();
  } catch {
    return fallback;
  }
};

/** GET /api/climate-migration/heatmap · null si 404 */
export const getMigrationHeatmap = () =>
  _safe('/api/climate-migration/heatmap', null);

/** GET /api/climate-migration/zone/{slug} · null si 404 */
export const getZoneMigrationDetail = (slug) => {
  if (!slug) return Promise.resolve(null);
  return _safe(`/api/climate-migration/zone/${encodeURIComponent(slug)}`, null);
};

/** GET /api/climate-migration/patterns · {patterns:[], total:0} si 404 */
export const getMigrationPatterns = (days = 90, limit = 20) => {
  const qs = new URLSearchParams({ days: String(days), limit: String(limit) }).toString();
  return _safe(`/api/climate-migration/patterns?${qs}`, { patterns: [], total: 0 });
};

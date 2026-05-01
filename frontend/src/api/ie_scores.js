// IE Scores API — public endpoints for zone scores + explain + coverage
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url) => {
  const r = await fetch(`${API}${url}`);
  if (!r.ok) throw Object.assign(new Error(r.statusText), { status: r.status });
  return r.json();
};

export const getZoneCoverage   = (zoneId) => j(`/api/zones/${zoneId}/scores/coverage`);
export const getZoneScores     = (zoneId) => j(`/api/zones/${zoneId}/scores`);
export const explainScore      = (zoneId, code) => j(`/api/zones/${zoneId}/scores/explain?code=${encodeURIComponent(code)}`);
export const getDevelopmentScores = (devId) => j(`/api/developments/${devId}/scores`);

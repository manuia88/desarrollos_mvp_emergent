// Briefing IE comparador — advisor CRM API client (Phase C / Chunk 3).
const API = process.env.REACT_APP_BACKEND_URL;

async function j(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return res.json();
}

export const generateBriefing = (payload) => j('/api/asesor/briefing-ie', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const getBriefing = (id) => j(`/api/asesor/briefing-ie/${id}`);

export const sendFeedback = (id, result, comments = null) => j(`/api/asesor/briefing-ie/${id}/feedback`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ result, comments }),
});

export const listBriefings = (onlyMine = true) =>
  j(`/api/asesor/briefings?only_mine=${onlyMine}&limit=100`);

export const briefingsSummary = () => j('/api/asesor/briefings/summary');

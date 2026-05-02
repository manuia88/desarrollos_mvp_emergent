/**
 * Phase 4 Batch 16 · Sub-Chunk A — AI Suggestions API helpers.
 */
const API = process.env.REACT_APP_BACKEND_URL;

function json(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSuggestions(entityType, entityId, { force = false } = {}) {
  const q = force ? '?force=1' : '';
  const res = await fetch(
    `${API}/api/ai/suggestions/${entityType}/${entityId}${q}`,
    { credentials: 'include' },
  );
  return json(res);
}

export async function dismissSuggestion(id, note = '') {
  const res = await fetch(`${API}/api/ai/suggestions/${id}/dismiss`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  return json(res);
}

export async function acceptSuggestion(id, note = '') {
  const res = await fetch(`${API}/api/ai/suggestions/${id}/accept`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  return json(res);
}

export default { fetchSuggestions, dismissSuggestion, acceptSuggestion };

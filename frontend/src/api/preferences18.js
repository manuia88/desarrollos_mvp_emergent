/**
 * Batch 18 Sub-A — Preferences API helpers (new /api/preferences/me endpoints)
 */
const API = process.env.REACT_APP_BACKEND_URL;

export async function getMyPreferences() {
  const res = await fetch(`${API}/api/preferences/me`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get preferences');
  return res.json();
}

export async function patchMyPreferences(updates) {
  const res = await fetch(`${API}/api/preferences/me`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to patch preferences');
  return res.json();
}

export async function pushRecentProject(project_id) {
  const res = await fetch(`${API}/api/preferences/me/recent-project`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id }),
  });
  if (!res.ok) throw new Error('Failed to push recent project');
  return res.json();
}

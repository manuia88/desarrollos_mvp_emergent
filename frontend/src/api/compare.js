// W5.x F4.2 · Comparator API helpers
const API = process.env.REACT_APP_BACKEND_URL;

export const postCompare = async (body) => {
  const r = await fetch(`${API}/api/compare`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw Object.assign(new Error(data.detail || r.statusText), { status: r.status, body: data });
  }
  return r.json();
};

export const searchMarketplace = async (q) => {
  try {
    const r = await fetch(`${API}/api/marketplace/developments?q=${encodeURIComponent(q || '')}&limit=8`, { credentials: 'include' });
    if (!r.ok) return [];
    const j = await r.json();
    return j.items || j.developments || j.results || [];
  } catch {
    return [];
  }
};

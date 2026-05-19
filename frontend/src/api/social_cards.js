// W5.16 — Social Cards API client (superadmin stats only).
// Las URLs de las imágenes públicas se construyen inline (no necesitan fetch).
const API = process.env.REACT_APP_BACKEND_URL;

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* noop */ }
    const err = new Error((body && (body.detail || body.error)) || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

export async function getSocialCardsStats() {
  const res = await fetch(`${API}/api/superadmin/social-cards/stats`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  return handle(res);
}

export function cardImageUrl(layout, entityType, slug) {
  return `${API}/api/social-cards/${layout}/${entityType}/${encodeURIComponent(slug)}.png`;
}

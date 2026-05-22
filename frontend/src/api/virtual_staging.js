// W5.17 · API wrappers para Virtual Staging IA · fail-silent en 404
const BASE = process.env.REACT_APP_BACKEND_URL;

/**
 * POST /api/virtual-staging
 * @returns response.json() · null si 404 · throw con body.detail para 4xx/5xx restantes
 */
export const postVirtualStaging = async (body) => {
  const r = await fetch(`${BASE}/api/virtual-staging`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body || {}),
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw Object.assign(new Error(data.detail || r.statusText), { status: r.status, body: data });
  }
  return r.json();
};

/**
 * GET /api/virtual-staging/cache/{image_hash}?room=&styles=
 * @returns response.json() | null si 404
 */
export const getStagingCache = async (imageHash, room, styles) => {
  if (!imageHash) return null;
  try {
    const qs = new URLSearchParams();
    if (room) qs.set('room', room);
    if (Array.isArray(styles) && styles.length > 0) qs.set('styles', styles.join(','));
    const r = await fetch(
      `${BASE}/api/virtual-staging/cache/${encodeURIComponent(imageHash)}${qs.toString() ? `?${qs}` : ''}`,
      { credentials: 'include' },
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

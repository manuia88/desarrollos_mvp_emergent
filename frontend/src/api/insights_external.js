// W5.21 — External Insights API client (consume W5.20 endpoints).
// Read-only · público T0 · NO auth required.
const API = process.env.REACT_APP_BACKEND_URL;

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

export async function fetchAllSourcesStatus() {
  const res = await fetch(`${API}/api/insights/global/all-sources`);
  return handle(res);
}

export async function fetchGlobalSource(sourceId) {
  const res = await fetch(`${API}/api/insights/global/${encodeURIComponent(sourceId)}`);
  return handle(res);
}

export async function fetchMethodologySources() {
  const res = await fetch(`${API}/api/insights/methodology/sources`);
  return handle(res);
}

export function socialCardUrl(layout, entityType, slug) {
  return `${API}/api/social-cards/${layout}/${entityType}/${encodeURIComponent(slug)}.png`;
}

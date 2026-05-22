// W5.x F4 Sub-E · Narrative Layer API helpers
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};

export const generateNarrative = (payload) =>
  j('/api/narrative/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });

export const getCachedNarrative = (scope, entityId, { audience = 'neutral', language = 'es-MX', disc } = {}) => {
  const qs = new URLSearchParams({ audience, language });
  if (disc) qs.set('disc', disc);
  return j(`/api/narrative/cached/${encodeURIComponent(scope)}/${encodeURIComponent(entityId)}?${qs.toString()}`);
};

export const sendNarrativeFeedback = (payload) =>
  j('/api/narrative/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });

// W5.ASR.3 Parte 1 · Smart Lists API client.
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};

export const getSmartListPresets = () =>
  j('/api/asesor/smart-lists/presets');

export const getSmartListCounts = () =>
  j('/api/asesor/smart-lists/counts');

export const getLeadsInPreset = (presetKey, { limit = 50, offset = 0 } = {}) =>
  j(`/api/asesor/smart-lists/${presetKey}/leads?limit=${limit}&offset=${offset}`);

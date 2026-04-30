// Studio API helpers
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};
const post = (url, body) => j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

export const getLibrary = () => j('/api/studio/library');
export const getDashboard = () => j('/api/studio/dashboard');
export const generateVideo = (b) => post('/api/studio/generate-video', b);
export const generateAds = (b) => post('/api/studio/generate-ads', b);
export const getVideo = (id) => j(`/api/studio/videos/${id}`);
export const getAdBatch = (id) => j(`/api/studio/ad-batches/${id}`);
export const generateHeroImage = (bid, angulo) => post(`/api/studio/ad-batches/${bid}/hero-image/${angulo}`);
export const getAsset = (assetId) => j(`/api/studio/assets/${assetId}`);

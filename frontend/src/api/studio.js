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
const putReal = (url, body) => j(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const del = (url) => j(url, { method: 'DELETE' });

export const getLibrary = () => j('/api/studio/library');
export const getDashboard = () => j('/api/studio/dashboard');
export const generateVideo = (b) => post('/api/studio/generate-video', b);
export const generateAds = (b) => post('/api/studio/generate-ads', b);
export const getVideo = (id) => j(`/api/studio/videos/${id}`);
export const getAdBatch = (id) => j(`/api/studio/ad-batches/${id}`);
export const generateHeroImage = (bid, angulo) => post(`/api/studio/ad-batches/${bid}/hero-image/${angulo}`);
export const getAsset = (assetId) => j(`/api/studio/assets/${assetId}`);

// ─── W5.22 Z.1 Sub-A · Brand Kit ────────────────────────────────────────────
export const getBrandKits = () => j('/api/studio/brand-kit');
export const upsertBrandKit = (b) => post('/api/studio/brand-kit', b);
export const getBrandKit = (id) => j(`/api/studio/brand-kit/${id}`);
export const deleteBrandKit = (id) => del(`/api/studio/brand-kit/${id}`);
export const activateBrandKit = (id) => post(`/api/studio/brand-kit/${id}/activate`);
export const requestLogoUpload = (b) => post('/api/studio/brand-kit/upload-logo', b);

// ─── W5.22 Z.1 Sub-B · Listing Importer ─────────────────────────────────────
export const importListing = (b) => post('/api/studio/listing-import', b);
export const listImports = (limit = 20, skip = 0) => j(`/api/studio/listing-imports?limit=${limit}&skip=${skip}`);
export const getImport = (id) => j(`/api/studio/listing-import/${id}`);
export const deleteImport = (id) => del(`/api/studio/listing-import/${id}`);

// ─── W5.22 Z.1 Sub-C · Asset Library + Mood Board ───────────────────────────
export const initiateAssetUpload = (b) => post('/api/studio/asset/initiate', b);
export const confirmAsset = (b) => post('/api/studio/asset/confirm', b);
export const listStudioAssets = ({ project_id = '', asset_type = '', tags = '', search = '', limit = 50, skip = 0 } = {}) => {
  const qs = new URLSearchParams();
  if (project_id) qs.set('project_id', project_id);
  if (asset_type) qs.set('asset_type', asset_type);
  if (tags) qs.set('tags', tags);
  if (search) qs.set('search', search);
  qs.set('limit', String(limit));
  qs.set('skip', String(skip));
  return j(`/api/studio/studio-assets?${qs.toString()}`);
};
export const deleteStudioAsset = (id) => del(`/api/studio/asset/${id}`);
export const createMoodBoard = (b) => post('/api/studio/mood-board', b);
export const listMoodBoards = (project_id = '') => j(`/api/studio/mood-boards${project_id ? `?project_id=${project_id}` : ''}`);
export const getMoodBoard = (id) => j(`/api/studio/mood-board/${id}`);
export const updateMoodBoard = (id, b) => putReal(`/api/studio/mood-board/${id}`, b);
export const deleteMoodBoard = (id) => del(`/api/studio/mood-board/${id}`);

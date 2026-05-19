// W5.22 Z.2 Sub-D — Studio Z.2 API wrappers (Copy · Carrusel · Auto-Content)
// Reusa fetch + credentials include · NO depende de axios.
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};
const post = (url, body) =>
  j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

// ─── Buyer-angle Copy (Sub-A) ───────────────────────────────────────────────
export const generateCopy = (b) => post('/api/studio/copy/generate', b);
export const getPersonas = () => j('/api/studio/copy/personas');
export const getCopyJob = (id) => j(`/api/studio/copy/job/${id}`);
export const listCopyJobs = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return j(`/api/studio/copy/jobs${qs ? `?${qs}` : ''}`);
};

// ─── Carrusel (Sub-B) ───────────────────────────────────────────────────────
export const generateCarrusel = (b) => post('/api/studio/carrusel/generate', b);
export const trackCarruselEvent = (carruselId, body) =>
  post(`/api/studio/carrusel/${carruselId}/track`, body);
export const getABStats = (groupId) => j(`/api/studio/carrusel/ab/${groupId}/stats`);
export const declareWinner = (groupId, body) =>
  post(`/api/studio/carrusel/ab/${groupId}/declare-winner`, body);
export const scoreHook = (b) => post('/api/studio/carrusel/hook-score', b);
export const listCarruseles = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return j(`/api/studio/carrusel/list${qs ? `?${qs}` : ''}`);
};
export const getCarrusel = (id) => j(`/api/studio/carrusel/${id}`);
export const exportCarruselPDF = async (carruselId) => {
  const r = await fetch(`${API}/api/studio/carrusel/${carruselId}/export-pdf`, {
    method: 'POST', credentials: 'include',
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.blob();
};

// ─── Auto-Content (Sub-C) ───────────────────────────────────────────────────
export const listAutoContent = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return j(`/api/studio/auto-content/queue${qs ? `?${qs}` : ''}`);
};
export const approveAutoContent = (queueId) =>
  post(`/api/studio/auto-content/${queueId}/approve`, {});
export const rejectAutoContent = (queueId) =>
  post(`/api/studio/auto-content/${queueId}/reject`, {});
export const getAutoContentStats = () => j('/api/studio/auto-content/stats');

// ─── Constants reused across pages ──────────────────────────────────────────
export const BUYER_ANGLES = ['inversor', 'familia', 'first_buyer', 'exec', 'extranjero', 'jubilado', 'empty_nester'];
export const DISC_PROFILES = ['D', 'I', 'S', 'C'];
export const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5', '21:9'];
export const RATIO_DIMS = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1':  [1080, 1080],
  '4:5':  [1080, 1350],
  '21:9': [2560, 1080],
};

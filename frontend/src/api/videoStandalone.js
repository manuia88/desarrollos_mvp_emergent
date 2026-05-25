// W5.22 Z.4 · Video Standalone API client (7 endpoints).
// fetch + credentials include · NO depende de axios · stub-tolerant en 404/503.
const API = process.env.REACT_APP_BACKEND_URL;

const _isUnavailable = (status) => status === 404 || status === 503;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail?.reason || body.detail || r.statusText), {
      status: r.status,
      body,
    });
  }
  return r.json();
};

const post = (url, body) =>
  j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

/** POST /api/video-standalone/generate */
export const generateStandaloneVideo = ({ script, image_url, provider, audience, duration_sec, hook_check } = {}) =>
  post('/api/video-standalone/generate', {
    script,
    image_url: image_url || null,
    provider: provider || null,
    audience: audience || null,
    duration_sec: duration_sec || 60,
    hook_check: !!hook_check,
  });

/** GET /api/video-standalone/history */
export const getStandaloneHistory = async ({ days = 30, provider, status, ratio, limit = 50 } = {}) => {
  const qs = new URLSearchParams();
  qs.set('days', days);
  qs.set('limit', limit);
  if (provider) qs.set('provider', provider);
  if (status) qs.set('status', status);
  if (ratio) qs.set('ratio', ratio);
  try {
    return await j(`/api/video-standalone/history?${qs.toString()}`);
  } catch (e) {
    if (_isUnavailable(e?.status)) return { items: [], count: 0, active: 0, is_stub: true };
    throw e;
  }
};

/** GET /api/video-standalone/{video_id} */
export const getStandaloneVideo = (videoId) =>
  j(`/api/video-standalone/${encodeURIComponent(videoId)}`);

/** POST /api/video-standalone/{video_id}/export?format=download */
export const exportStandaloneDownload = (videoId) =>
  post(`/api/video-standalone/${encodeURIComponent(videoId)}/export?format=download`, {});

/** POST /api/video-standalone/{video_id}/export?format=pdf → fuerza descarga del blob PDF */
export const exportStandalonePdf = async (videoId) => {
  const r = await fetch(`${API}/api/video-standalone/${encodeURIComponent(videoId)}/export?format=pdf`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  const blob = await r.blob();
  const obj = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = obj;
  a.download = `video-${videoId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(obj);
  return { ok: true };
};

/** POST /api/video-standalone/{video_id}/share-whatsapp?ratio= */
export const shareStandaloneWhatsApp = (videoId, ratio = '9:16') =>
  post(`/api/video-standalone/${encodeURIComponent(videoId)}/share-whatsapp?ratio=${encodeURIComponent(ratio)}`, {});

/** DELETE /api/video-standalone/{video_id} */
export const deleteStandaloneVideo = async (videoId) => {
  try {
    const r = await fetch(`${API}/api/video-standalone/${encodeURIComponent(videoId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
};

/** GET /api/superadmin/video-standalone/stats?days= */
export const getStandaloneSuperadminStats = (days = 30) =>
  j(`/api/superadmin/video-standalone/stats?days=${encodeURIComponent(days)}`);

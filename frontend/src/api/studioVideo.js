// W5.16-C · Studio Video API client · stub mode fallback en 404/503
const BASE = process.env.REACT_APP_BACKEND_URL;

const STUB_TASK = (overrides = {}) => ({
  task_id: `stub-${Date.now().toString(36)}`,
  status: 'completed',
  ratios: {
    '1:1': 'stub://reel-1x1.mp4',
    '9:16': 'stub://stories-9x16.mp4',
    '16:9': 'stub://youtube-16x9.mp4',
  },
  is_stub: true,
  ...overrides,
});

const _isUnavailable = (status) => status === 404 || status === 503;

/**
 * POST /api/studio-video/generate-video
 * @returns response.json() o stub si endpoint no disponible
 */
export const generateVideo = async ({ script, image_url, provider, duration_sec } = {}) => {
  try {
    const r = await fetch(`${BASE}/api/studio-video/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ script, image_url, provider, duration_sec }),
    });
    if (_isUnavailable(r.status)) return STUB_TASK();
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw Object.assign(new Error(data.detail || r.statusText), { status: r.status, body: data });
    }
    return r.json();
  } catch (e) {
    if (e?.status && !_isUnavailable(e.status)) throw e;
    return STUB_TASK();
  }
};

/**
 * POST /api/studio-video/generate-script
 */
export const generateScript = async ({ property_id, hint }) => {
  try {
    const r = await fetch(`${BASE}/api/studio-video/generate-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ property_id, hint }),
    });
    if (_isUnavailable(r.status)) {
      return {
        script: 'Descubre este desarrollo en CDMX · ubicacion premium, amenidades de lujo y vistas espectaculares. Agenda tu visita hoy.',
        is_stub: true,
      };
    }
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw Object.assign(new Error(data.detail || r.statusText), { status: r.status, body: data });
    }
    return r.json();
  } catch (e) {
    if (e?.status && !_isUnavailable(e.status)) throw e;
    return {
      script: 'Descubre este desarrollo en CDMX · ubicacion premium, amenidades de lujo y vistas espectaculares. Agenda tu visita hoy.',
      is_stub: true,
    };
  }
};

/**
 * GET /api/studio-video/tasks?limit=20
 */
export const listTasks = async (limit = 20) => {
  try {
    const r = await fetch(`${BASE}/api/studio-video/tasks?limit=${limit}`, { credentials: 'include' });
    if (_isUnavailable(r.status)) return { tasks: [], is_stub: true };
    if (!r.ok) return { tasks: [], _silent: true };
    return await r.json();
  } catch {
    return { tasks: [], is_stub: true };
  }
};

/**
 * GET /api/studio-video/tasks/{task_id}
 */
export const getTask = async (taskId) => {
  if (!taskId) return null;
  try {
    const r = await fetch(`${BASE}/api/studio-video/tasks/${encodeURIComponent(taskId)}`, { credentials: 'include' });
    if (_isUnavailable(r.status)) return null;
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

/**
 * DELETE /api/studio-video/tasks/{task_id}
 */
export const deleteTask = async (taskId) => {
  if (!taskId) return { success: false };
  try {
    const r = await fetch(`${BASE}/api/studio-video/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return { success: r.ok };
  } catch {
    return { success: false };
  }
};

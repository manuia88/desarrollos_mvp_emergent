// Phase 4 Batch 12 — Wizard API helpers
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status });
  }
  return r.json();
};
const post = (url, body) => j(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

export const getWizardSmartDefaults = () => j('/api/dev/wizard/smart-defaults');
export const saveWizardDraft = (draft_data, current_step) =>
  post('/api/dev/wizard/draft/save', { draft_data, current_step });
export const loadWizardDraft = () => j('/api/dev/wizard/draft/load');
export const createWizardProject = (payload) => post('/api/dev/wizard/projects', payload);

export const uploadWizardFiles = async (files) => {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const r = await fetch(`${API}/api/dev/wizard/ia-extract`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw Object.assign(new Error(b.detail || r.statusText), { status: r.status });
  }
  return r.json();
};

export const getIaExtract = (runId) => j(`/api/dev/wizard/ia-extract/${runId}`);
export const getDriveStatus = () => j('/api/dev/wizard/drive/status');
export const processDriveUrl = (drive_folder_url) =>
  post('/api/dev/wizard/drive/url', { drive_folder_url });

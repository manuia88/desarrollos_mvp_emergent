// W6.5 — Project Wizard duplication API wrappers
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};

export const duplicateProject = (source_id, new_name, override_fields) =>
  j('/api/projects/duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_id, new_name, override_fields: override_fields || null }),
  });

export const listProjectTemplates = (limit = 50) =>
  j(`/api/projects/templates?limit=${limit}`);

export const markProjectAsTemplate = (project_id, enabled = true) =>
  j(`/api/projects/${project_id}/mark-as-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });

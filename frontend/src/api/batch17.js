/**
 * Phase 4 Batch 17 · Sub-Chunk B — Server-persisted Undo integration.
 *
 * Thin client that talks to /api/undo/* and also surfaces toasts via useUndo().
 */
const API = process.env.REACT_APP_BACKEND_URL;

async function json(res) {
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function performUndo(undoId) {
  const res = await fetch(`${API}/api/undo/${undoId}`, {
    method: 'POST', credentials: 'include',
  });
  return json(res);
}

export async function getRecentUndos(limit = 10) {
  const res = await fetch(`${API}/api/undo/recent?limit=${limit}`, {
    credentials: 'include',
  });
  return json(res);
}

export async function listPresets(route) {
  const q = route ? `?route=${encodeURIComponent(route)}` : '';
  const res = await fetch(`${API}/api/filter-presets${q}`, { credentials: 'include' });
  return json(res);
}

export async function createPreset({ route, name, filters, is_default = false }) {
  const res = await fetch(`${API}/api/filter-presets`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route, name, filters, is_default }),
  });
  return json(res);
}

export async function deletePreset(presetId) {
  const res = await fetch(`${API}/api/filter-presets/${presetId}`, {
    method: 'DELETE', credentials: 'include',
  });
  return json(res);
}

export async function inlineEdit(entityType, entityId, field, value) {
  const res = await fetch(`${API}/api/inline/${entityType}/${entityId}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field, value }),
  });
  return json(res);
}

export async function reorderDocuments(devId, orderedIds) {
  const res = await fetch(`${API}/api/dev/projects/${devId}/documents/reorder`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
  return json(res);
}

export async function reorderPrototypes(projectId, orderedIds) {
  const res = await fetch(`${API}/api/dev/projects/${projectId}/prototypes/reorder`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
  return json(res);
}

export async function reorderTareas(orderedIds) {
  const res = await fetch(`${API}/api/asesor/tareas/reorder`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
  return json(res);
}

export async function reorderAssets(devId, orderedIds) {
  // Existing B7.6 endpoint (dev alias).
  const res = await fetch(`${API}/api/desarrollador/developments/${devId}/assets/reorder`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_ids: orderedIds }),
  });
  return json(res);
}

export default {
  performUndo, getRecentUndos,
  listPresets, createPreset, deletePreset,
  inlineEdit,
  reorderDocuments, reorderPrototypes, reorderTareas, reorderAssets,
};

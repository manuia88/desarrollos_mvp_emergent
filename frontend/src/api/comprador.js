/**
 * Phase 4 Batch 28 — API client del Portal Comprador.
 * Todas las requests usan `credentials: 'include'` para enviar cookies HttpOnly.
 */
const API = process.env.REACT_APP_BACKEND_URL;

async function _req(path, init = {}) {
  const r = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  if (r.status === 401) {
    const e = new Error('No autenticado');
    e.status = 401;
    throw e;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.detail || `Error ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return data;
}

// ─── Auth (magic link) ──────────────────────────────────────────────────────

export async function requestMagicLink(email, name) {
  return _req('/api/auth/comprador/magic-link/request', {
    method: 'POST',
    body: JSON.stringify({ email, name }),
  });
}

export async function verifyMagicLink(token) {
  return _req(`/api/auth/comprador/magic-link/verify?token=${encodeURIComponent(token)}`);
}

export async function logoutComprador() {
  return _req('/api/auth/logout', { method: 'POST' });
}

// ─── Dashboard / profile ────────────────────────────────────────────────────

export const fetchDashboard = () => _req('/api/comprador/dashboard');
// Radar unificado: zonas/desarrollos/unidades vigilados + su último cambio en una vista
export const fetchRadar = () => _req('/api/comprador/radar');
// "Propiedades para ti" · recomendación personalizada (reusa fit_engine sobre tu lead)
export const fetchRecommended = (limit = 6) => _req(`/api/comprador/recommended?limit=${limit}`);
// Estado de las visitas que pediste (cierra ciclo: el dev las recibe y acepta/descarta)
export const fetchVisitas = () => _req('/api/comprador/visitas');
export const fetchProfile = () => _req('/api/comprador/profile');
export const updateProfile = (patch) => _req('/api/comprador/profile', {
  method: 'PATCH', body: JSON.stringify(patch),
});

// ─── Saved searches ─────────────────────────────────────────────────────────

export const listSavedSearches = () => _req('/api/comprador/saved-searches');
export const deleteSavedSearch = (id) => _req(
  `/api/comprador/saved-searches/${encodeURIComponent(id)}`,
  { method: 'DELETE' },
);

// ─── Favorites ──────────────────────────────────────────────────────────────

export const listFavorites = (itemType) => _req(
  `/api/comprador/favorites${itemType ? `?item_type=${itemType}` : ''}`,
);
export const addFavorite = (itemType, itemId, tags = [], notes = '') => _req(
  '/api/comprador/favorites',
  {
    method: 'POST',
    body: JSON.stringify({ item_type: itemType, item_id: itemId, tags, notes }),
  },
);
export const deleteFavorite = (favId) => _req(
  `/api/comprador/favorites/${encodeURIComponent(favId)}`,
  { method: 'DELETE' },
);

// ─── History ────────────────────────────────────────────────────────────────

export const listHistory = (limit = 50) => _req(`/api/comprador/history?limit=${limit}`);
export const trackView = (itemType, itemId, source = 'marketplace') => _req(
  '/api/comprador/history',
  {
    method: 'POST',
    body: JSON.stringify({ item_type: itemType, item_id: itemId, source }),
  },
);
export const clearHistoryAll = () => _req('/api/comprador/history', { method: 'DELETE' });

// ─── Privacy ────────────────────────────────────────────────────────────────

export const fetchConsents = () => _req('/api/comprador/privacy/consents');
export const updateConsents = (consents) => _req('/api/comprador/privacy/consents', {
  method: 'PATCH', body: JSON.stringify({ consents }),
});
export const requestExport = () => _req('/api/comprador/privacy/export', { method: 'POST' });
export const deleteAccount = (confirmEmail, reason) => _req(
  '/api/comprador/privacy/delete-account',
  {
    method: 'POST',
    body: JSON.stringify({ confirm_email: confirmEmail, reason }),
  },
);
export const cancelDelete = () => _req('/api/comprador/privacy/cancel-delete', { method: 'POST' });

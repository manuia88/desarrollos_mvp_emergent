/**
 * Batch 19 Sub-B — branding API helpers
 */
const API = process.env.REACT_APP_BACKEND_URL;

export async function getMyBranding() {
  const res = await fetch(`${API}/api/orgs/me/branding`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get branding');
  return res.json();
}

export async function putMyBranding(branding) {
  const res = await fetch(`${API}/api/orgs/me/branding`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(branding),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.detail || 'Failed to update branding'), { status: res.status });
  }
  return res.json();
}

export async function uploadBrandingLogo(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/api/orgs/me/branding/logo`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.detail || 'Error al subir logo'), { status: res.status });
  }
  return res.json();
}

export async function deleteBrandingLogo() {
  const res = await fetch(`${API}/api/orgs/me/branding/logo`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete logo');
  return res.json();
}

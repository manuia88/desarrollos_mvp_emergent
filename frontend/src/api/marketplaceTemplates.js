// W6.4 · Marketplace Templates API client
// 11 endpoints (advisor + superadmin) · usa fetch nativo
const API = process.env.REACT_APP_BACKEND_URL || '';

async function _req(url, opts = {}) {
  const res = await fetch(`${API}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch (_e) { /* ignore */ }
    const err = new Error(body?.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

export async function listTemplates({ category, priceTier, sort = 'popular', limit = 50 } = {}) {
  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (category) params.set('category', category);
  if (priceTier) params.set('price_tier', priceTier);
  return _req(`/api/marketplace/templates?${params.toString()}`);
}

export async function searchTemplates(q, limit = 30) {
  const params = new URLSearchParams({ q: q || '', limit: String(limit) });
  return _req(`/api/marketplace/templates/search?${params.toString()}`);
}

export async function getTemplate(id) {
  return _req(`/api/marketplace/templates/${encodeURIComponent(id)}`);
}

export async function publishTemplate(payload) {
  return _req(`/api/marketplace/templates/publish`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cloneTemplate(id, paidAmountMxn) {
  return _req(`/api/marketplace/templates/${encodeURIComponent(id)}/clone`, {
    method: 'POST',
    body: JSON.stringify({ paid_amount_mxn: paidAmountMxn ?? null }),
  });
}

export async function rateTemplate(id, stars, comment) {
  return _req(`/api/marketplace/templates/${encodeURIComponent(id)}/rate`, {
    method: 'POST',
    body: JSON.stringify({ stars, comment }),
  });
}

export async function getMyRevenue() {
  return _req(`/api/marketplace/templates/revenue/my`);
}

export async function getAdminStats() {
  return _req(`/api/superadmin/marketplace/templates/admin-stats`);
}

export async function adminListTemplates({ status, limit = 100 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status && status !== 'all') params.set('status', status);
  return _req(`/api/superadmin/marketplace/templates/list?${params.toString()}`);
}

export async function approveTemplate(id) {
  return _req(`/api/superadmin/marketplace/templates/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
  });
}

export async function rejectTemplate(id, reason = '') {
  return _req(`/api/superadmin/marketplace/templates/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function deleteTemplate(id) {
  return _req(`/api/superadmin/marketplace/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// Lista los workflows propios para que el modal de publicar muestre dropdown
export async function listMyWorkflows() {
  return _req(`/api/workflows`);
}

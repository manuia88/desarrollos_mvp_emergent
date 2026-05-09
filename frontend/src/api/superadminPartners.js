// W3.8 — Superadmin Partner Management API
const API = process.env.REACT_APP_BACKEND_URL;

export async function listPartners({ status, type, days = 30 } = {}) {
  const params = new URLSearchParams({ days });
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  const r = await fetch(`${API}/api/superadmin/partners?${params}`, { credentials: 'include' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error listando partners');
  return data;
}

export async function getPartnerDetail(partner_id) {
  const r = await fetch(`${API}/api/superadmin/partners/${encodeURIComponent(partner_id)}`, {
    credentials: 'include',
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error cargando partner');
  return data;
}

export async function createPartner(body) {
  const r = await fetch(`${API}/api/superadmin/partners`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error creando partner');
  return data;
}

export async function updatePartner(partner_id, body) {
  const r = await fetch(`${API}/api/superadmin/partners/${encodeURIComponent(partner_id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error actualizando partner');
  return data;
}

export async function getCrossSellAnalytics(days = 30) {
  const r = await fetch(`${API}/api/superadmin/cross-sell/analytics?days=${days}`, {
    credentials: 'include',
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error en analytics');
  return data;
}

export async function createRevenueEvent(body) {
  const r = await fetch(`${API}/api/superadmin/cross-sell/revenue-events/manual`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error registrando ingreso');
  return data;
}

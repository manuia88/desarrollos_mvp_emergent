// W3.7 — Phase Z.5 Compliance API helpers (superadmin + public DSR)
const API = process.env.REACT_APP_BACKEND_URL;

// ─── PUBLIC DSR ───────────────────────────────────────────────────────────────

export async function submitDsr({ request_type, subject_email, subject_phone, subject_property_ids, justification }) {
  const r = await fetch(`${API}/api/privacy/dsr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_type, subject_email, subject_phone, subject_property_ids, justification }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error al enviar solicitud');
  return data;
}

export async function verifyDsrToken(dsr_id, token) {
  const r = await fetch(`${API}/api/privacy/dsr/${dsr_id}/verify?token=${encodeURIComponent(token)}`, {
    credentials: 'include',
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Token inválido');
  return data;
}

// ─── SUPERADMIN ───────────────────────────────────────────────────────────────

export async function listDsrRequests({ status, days = 30, limit = 100 } = {}) {
  const params = new URLSearchParams({ days, limit });
  if (status) params.set('status', status);
  const r = await fetch(`${API}/api/superadmin/compliance/dsr-requests?${params}`, {
    credentials: 'include',
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error listando DSR');
  return data;
}

export async function processDsr(dsr_id) {
  const r = await fetch(`${API}/api/superadmin/compliance/dsr-requests/${dsr_id}/process`, {
    method: 'POST',
    credentials: 'include',
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error procesando DSR');
  return data;
}

export async function getComplianceAuditTrail({ api_key_id, endpoint, days = 30, limit = 200 } = {}) {
  const params = new URLSearchParams({ days, limit });
  if (api_key_id) params.set('api_key_id', api_key_id);
  if (endpoint) params.set('endpoint', endpoint);
  const r = await fetch(`${API}/api/superadmin/compliance/audit-trail?${params}`, {
    credentials: 'include',
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error en audit trail');
  return data;
}

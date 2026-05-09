// W4.2D3.5 — Superadmin Landing Leads API helpers
const API = process.env.REACT_APP_BACKEND_URL;

function _qs(params) {
  const s = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, v);
  });
  const q = s.toString();
  return q ? `?${q}` : '';
}

export async function getLandingLeadsSummary() {
  const r = await fetch(`${API}/api/superadmin/landing-leads/summary`, {
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`landing leads summary failed: ${r.status}`);
  return r.json();
}

export async function getLandingLeadsByZone() {
  const r = await fetch(`${API}/api/superadmin/landing-leads/by-zone`, {
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`landing leads by-zone failed: ${r.status}`);
  return r.json();
}

export async function getLandingLeads(filters = {}) {
  const r = await fetch(`${API}/api/superadmin/landing-leads${_qs(filters)}`, {
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`landing leads list failed: ${r.status}`);
  return r.json();
}

export function downloadLandingLeadsCsv(filters = {}) {
  const url = `${API}/api/superadmin/landing-leads/export.csv${_qs(filters)}`;
  // Open in same window so cookie auth flows; browser triggers download via Content-Disposition.
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}

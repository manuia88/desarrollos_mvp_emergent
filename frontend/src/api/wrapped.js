/**
 * api/wrapped.js — Phase 4 Batch 30
 * Helpers para Wrapped + Smart Match.
 */
const API = process.env.REACT_APP_BACKEND_URL;

export async function fetchWrappedList() {
  const r = await fetch(`${API}/api/comprador/wrapped`, { credentials: 'include' });
  if (!r.ok) throw new Error('Error al cargar wrappeds');
  return r.json();
}

export async function fetchWrapped(yearMonth = 'latest') {
  const r = await fetch(`${API}/api/comprador/wrapped/${yearMonth}`, { credentials: 'include' });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al cargar el wrapped');
  }
  return r.json();
}

export async function requestAnnualOptin(year) {
  const r = await fetch(`${API}/api/comprador/wrapped/annual-optin`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al generar wrapped anual');
  }
  return r.json();
}

export async function shareWrapped(wrappedId) {
  const r = await fetch(`${API}/api/comprador/wrapped/${wrappedId}/share`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!r.ok) throw new Error('Error al generar share link');
  return r.json();
}

export async function fetchSmartMatch() {
  const r = await fetch(`${API}/api/comprador/smart-match`, { credentials: 'include' });
  if (!r.ok) throw new Error('Error al cargar smart match');
  return r.json();
}

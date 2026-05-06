/**
 * api/asesor_daily.js — Phase 4 Batch 33
 * Helpers para Asesor Daily Tools (calendar bidi, visit briefing, insights).
 */
const API = process.env.REACT_APP_BACKEND_URL;

// ─── Calendar bidirectional ────────────────────────────────────────────────

export async function calendarSubscribeWebhook() {
  const r = await fetch(`${API}/api/asesor/calendar/webhook/subscribe`, {
    method: 'POST', credentials: 'include',
  });
  if (!r.ok) throw new Error('Error al activar sync bidireccional');
  return r.json();
}

export async function calendarUnsubscribeWebhook() {
  const r = await fetch(`${API}/api/asesor/calendar/webhook/subscribe`, {
    method: 'DELETE', credentials: 'include',
  });
  if (!r.ok) throw new Error('Error al desactivar sync');
  return r.json();
}

export async function calendarSyncStatus() {
  const r = await fetch(`${API}/api/asesor/calendar/sync-status`, {
    credentials: 'include',
  });
  if (!r.ok) return null;
  return r.json();
}

export async function calendarSyncNow() {
  const r = await fetch(`${API}/api/asesor/calendar/sync-now`, {
    method: 'POST', credentials: 'include',
  });
  if (!r.ok) throw new Error('Error al forzar sync');
  return r.json();
}

// ─── Visit briefing ────────────────────────────────────────────────────────

export async function generateVisitBriefing(appointmentId, force = false) {
  const r = await fetch(`${API}/api/asesor/visit-briefing/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointment_id: appointmentId, force }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al generar briefing');
  }
  return r.json();
}

export async function getVisitBriefing(appointmentId) {
  const r = await fetch(
    `${API}/api/asesor/visit-briefing/${encodeURIComponent(appointmentId)}`,
    { credentials: 'include' },
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Error al cargar briefing');
  return r.json();
}

export async function markBriefingViewed(briefingId) {
  const r = await fetch(
    `${API}/api/asesor/visit-briefing/${encodeURIComponent(briefingId)}/viewed`,
    { method: 'POST', credentials: 'include' },
  );
  if (!r.ok) return { marked: false };
  return r.json();
}

// ─── Client insights ───────────────────────────────────────────────────────

export async function fetchClientInsights(leadId, force = false) {
  const r = await fetch(
    `${API}/api/asesor/lead/${encodeURIComponent(leadId)}/insights${force ? '?force=true' : ''}`,
    { credentials: 'include' },
  );
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al cargar insights');
  }
  return r.json();
}

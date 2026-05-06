/**
 * api/asesor_identity.js — Phase 4 Batch 32
 * Helpers para Asesor Identity (Endorsements + LinkedIn + DISC + Trust Score).
 */
const API = process.env.REACT_APP_BACKEND_URL;

// ─── Endorsements (público) ────────────────────────────────────────────────

export async function postEndorsement({
  asesorId, clientEmail, clientName, rating, text, projectId = null,
}) {
  const r = await fetch(`${API}/api/public/endorsements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asesor_id: asesorId,
      client_email: clientEmail,
      client_name: clientName,
      rating,
      text,
      project_id: projectId,
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const msg = typeof e.detail === 'string' ? e.detail : 'Error al enviar reseña';
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

export async function fetchPublicEndorsements(asesorId, limit = 50) {
  const r = await fetch(
    `${API}/api/public/asesor/${encodeURIComponent(asesorId)}/endorsements?limit=${limit}`,
  );
  if (!r.ok) throw new Error('Error al cargar reseñas');
  return r.json();
}

export async function fetchPublicProfile(asesorId) {
  const r = await fetch(`${API}/api/public/asesor/${encodeURIComponent(asesorId)}/profile`);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Asesor no encontrado');
  }
  return r.json();
}

// ─── LinkedIn (auth asesor) ────────────────────────────────────────────────

export async function importLinkedIn({ linkedinUrl, profileData }) {
  const r = await fetch(`${API}/api/asesor/linkedin/import`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      linkedin_url: linkedinUrl,
      profile_data: profileData,
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al importar LinkedIn');
  }
  return r.json();
}

export async function fetchMyLinkedIn() {
  const r = await fetch(`${API}/api/asesor/linkedin/me`, { credentials: 'include' });
  if (!r.ok) return { profile: null };
  return r.json();
}

export async function revokeLinkedIn() {
  const r = await fetch(`${API}/api/asesor/linkedin`, {
    method: 'DELETE', credentials: 'include',
  });
  if (!r.ok) throw new Error('Error al eliminar LinkedIn');
  return r.json();
}

// ─── DISC (auth asesor) ────────────────────────────────────────────────────

export async function submitDisc(answers) {
  const r = await fetch(`${API}/api/asesor/disc/submit`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al enviar DISC');
  }
  return r.json();
}

export async function fetchMyDisc() {
  const r = await fetch(`${API}/api/asesor/disc/me`, { credentials: 'include' });
  if (!r.ok) return { profile: null };
  return r.json();
}

export async function deleteMyDisc() {
  const r = await fetch(`${API}/api/asesor/disc/me`, {
    method: 'DELETE', credentials: 'include',
  });
  if (!r.ok) throw new Error('Error al borrar DISC');
  return r.json();
}

// ─── Trust Score (auth asesor) ─────────────────────────────────────────────

export async function fetchMyTrustScore({ force = false } = {}) {
  const r = await fetch(
    `${API}/api/asesor/trust-score/me${force ? '?force=true' : ''}`,
    { credentials: 'include' },
  );
  if (!r.ok) throw new Error('Error al cargar trust score');
  return r.json();
}

// ─── Endorsement management (auth asesor) ──────────────────────────────────

export async function fetchMyEndorsements({ onlyVerified = false, limit = 50 } = {}) {
  const params = new URLSearchParams();
  params.set('only_verified', onlyVerified ? 'true' : 'false');
  params.set('limit', String(limit));
  const r = await fetch(
    `${API}/api/asesor/endorsements/me?${params.toString()}`,
    { credentials: 'include' },
  );
  if (!r.ok) throw new Error('Error al cargar mis reseñas');
  return r.json();
}

export async function deleteMyEndorsement(endorsementId) {
  const r = await fetch(
    `${API}/api/asesor/endorsements/${encodeURIComponent(endorsementId)}`,
    { method: 'DELETE', credentials: 'include' },
  );
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al borrar reseña');
  }
  return r.json();
}

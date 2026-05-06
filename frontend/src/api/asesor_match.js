/**
 * api/asesor_match.js — Phase 4 Batch 34
 * Helpers para Smart Match + Daily Feed.
 */
const API = process.env.REACT_APP_BACKEND_URL;

// ─── Smart Match (admin) ───────────────────────────────────────────────────

export async function computeLeadMatch({ leadId, projectId, asesorPool, force = false }) {
  const r = await fetch(`${API}/api/lead-match/compute`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: leadId,
      project_id: projectId || null,
      asesor_pool: asesorPool || null,
      force,
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al computar match');
  }
  return r.json();
}

export async function fetchMatch(matchId) {
  const r = await fetch(
    `${API}/api/lead-match/${encodeURIComponent(matchId)}`,
    { credentials: 'include' },
  );
  if (!r.ok) throw new Error('Match no encontrado');
  return r.json();
}

// ─── Daily Feed ────────────────────────────────────────────────────────────

export async function fetchDailyFeed({ forceRefresh = false, topN = 5 } = {}) {
  const params = new URLSearchParams();
  if (forceRefresh) params.set('force_refresh', 'true');
  params.set('top_n', String(topN));
  const r = await fetch(
    `${API}/api/asesor/daily-feed?${params.toString()}`,
    { credentials: 'include' },
  );
  if (!r.ok) throw new Error('Error al cargar feed diario');
  return r.json();
}

export async function executeFeedAction(leadId, actionType) {
  const r = await fetch(
    `${API}/api/asesor/daily-feed/${encodeURIComponent(leadId)}/execute`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: actionType }),
    },
  );
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al ejecutar acción');
  }
  return r.json();
}

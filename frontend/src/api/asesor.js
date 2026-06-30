/**
 * api/asesor.js — Phase 3 Batch 31
 * Helpers para herramientas de Asesor: Briefing Tráfico/Clima + Argumentario AI RAG.
 */
const API = process.env.REACT_APP_BACKEND_URL;

// ─── Briefing Tráfico + Clima ─────────────────────────────────────────────

export async function fetchTrafficBriefing({
  originLat,
  originLng,
  destinationLat,
  destinationLng,
  originLabel = '',
  destinationLabel = '',
  projectId = null,
}) {
  const r = await fetch(`${API}/api/asesor/briefing/traffic`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin_lat: originLat,
      origin_lng: originLng,
      destination_lat: destinationLat,
      destination_lng: destinationLng,
      origin_label: originLabel,
      destination_label: destinationLabel,
      project_id: projectId,
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al generar briefing');
  }
  return r.json();
}

export async function fetchRecentBriefings(limit = 10) {
  const r = await fetch(
    `${API}/api/asesor/briefing/traffic/recent?limit=${limit}`,
    { credentials: 'include' },
  );
  if (!r.ok) throw new Error('Error al cargar briefings recientes');
  return r.json();
}

// ─── Argumentario AI RAG ───────────────────────────────────────────────────

export async function queryArgumentario({ question, category = null, topK = 5 }) {
  const r = await fetch(`${API}/api/asesor/argumentario/query`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      category,
      top_k: topK,
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al consultar argumentario');
  }
  return r.json();
}

export async function fetchArgumentarioRecent(limit = 20) {
  const r = await fetch(
    `${API}/api/asesor/argumentario/recent?limit=${limit}`,
    { credentials: 'include' },
  );
  if (!r.ok) throw new Error('Error al cargar consultas recientes');
  return r.json();
}

export async function fetchArgumentarioKB({ category = null, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  params.set('limit', String(limit));
  const r = await fetch(
    `${API}/api/asesor/argumentario/kb?${params.toString()}`,
    { credentials: 'include' },
  );
  if (!r.ok) throw new Error('Error al cargar base de conocimiento');
  return r.json();
}

// ─── Playbook del proyecto (B3.1) — qué configuró el dev: acceso, comisión, política, qué ofrecer ──
export async function fetchAsesorPlaybook(projectId) {
  const r = await fetch(`${API}/api/asesor/proyecto/${projectId}/playbook`, { credentials: 'include' });
  if (!r.ok) throw new Error('Error al cargar el playbook del proyecto');
  return r.json();
}

// ─── Buzón del cubo — oportunidades que el cubo (superadmin) detectó y rutó al asesor (cierra el flywheel) ──
export async function fetchCubeActions() {
  const r = await fetch(`${API}/api/asesor/cube-actions`, { credentials: 'include' });
  if (!r.ok) throw new Error('Error al cargar las oportunidades del cubo');
  return r.json();
}
export async function setCubeActionEstado(id, estado) {
  const r = await fetch(`${API}/api/asesor/cube-actions/${id}/estado`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }),
  });
  if (!r.ok) throw new Error('Error al actualizar la oportunidad');
  return r.json();
}

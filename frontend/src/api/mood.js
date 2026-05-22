// W5.x F10 · API helpers para Mood/Vibe quiz · fail-silent en 404
const BASE = process.env.REACT_APP_BACKEND_URL;

/**
 * POST /api/mood/quiz/submit
 * @returns response.json() | null si 404 | throw para otros errores
 */
export const submitMoodQuiz = async (body) => {
  const r = await fetch(`${BASE}/api/mood/quiz/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body || {}),
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw Object.assign(new Error(data.detail || r.statusText), { status: r.status, body: data });
  }
  return r.json();
};

/**
 * GET /api/mood/property/{property_id}/profile · fail-silent en 404
 */
export const getPropertyMoodProfile = async (propertyId) => {
  if (!propertyId) return null;
  try {
    const r = await fetch(
      `${BASE}/api/mood/property/${encodeURIComponent(propertyId)}/profile`,
      { credentials: 'include' },
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

/**
 * GET /api/mood/user/{visitor_session_id}/latest · fail-silent en 404
 * Permite recuperar el quiz anterior del visitor para mostrar "ya hiciste el quiz · ¿ver resultado?"
 */
export const getUserLatestMood = async (visitorSessionId) => {
  if (!visitorSessionId) return null;
  try {
    const r = await fetch(
      `${BASE}/api/mood/user/${encodeURIComponent(visitorSessionId)}/latest`,
      { credentials: 'include' },
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

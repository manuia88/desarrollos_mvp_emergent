// W5.x F8 · API helpers para Predictive Alerts (asesor)
// Backend en construccion paralela · fail-silent en 404 / errores de red
const BASE = process.env.REACT_APP_BACKEND_URL;

/** Helper interno · fail-silent · siempre regresa fallback en error */
const _safe = async (url, options = {}, fallback = null) => {
  try {
    const res = await fetch(`${BASE}${url}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
};

/**
 * GET /api/asesor/alertas
 * params: { status='active', limit=20 }
 * Fail-silent · retorna { alertas: [], total: 0, _silent: true } si backend 404
 */
export const listAlertas = ({ status = 'active', limit = 20 } = {}) => {
  const qs = new URLSearchParams({ status, limit: String(limit) }).toString();
  return _safe(
    `/api/asesor/alertas?${qs}`,
    { method: 'GET' },
    { alertas: [], total: 0, _silent: true },
  );
};

/**
 * POST /api/asesor/alertas/{alert_id}/snooze
 * body: { hours?: number } · default backend
 */
export const snoozeAlerta = (alertId, hours = 24) =>
  _safe(
    `/api/asesor/alertas/${encodeURIComponent(alertId)}/snooze`,
    { method: 'POST', body: JSON.stringify({ hours }) },
    { ok: false, _silent: true },
  );

/**
 * POST /api/asesor/alertas/{alert_id}/contactar
 * body: { channel?: 'whatsapp' | 'phone' | 'email' }
 */
export const contactarAlerta = (alertId, channel = 'whatsapp') =>
  _safe(
    `/api/asesor/alertas/${encodeURIComponent(alertId)}/contactar`,
    { method: 'POST', body: JSON.stringify({ channel }) },
    { ok: false, _silent: true },
  );

/**
 * POST /api/asesor/alertas/{alert_id}/descartar
 * body: { reason?: string }
 */
export const descartarAlerta = (alertId, reason = '') =>
  _safe(
    `/api/asesor/alertas/${encodeURIComponent(alertId)}/descartar`,
    { method: 'POST', body: JSON.stringify({ reason }) },
    { ok: false, _silent: true },
  );

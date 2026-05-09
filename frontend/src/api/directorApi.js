/**
 * W4.4 — Phase Y.1A · Director API helpers
 * Todos los endpoints de /api/director/*
 */

const API = process.env.REACT_APP_BACKEND_URL;

async function _req(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: {},
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
  return json;
}

/** Inicia una nueva sesión Director AI */
export async function startSession() {
  return _req('POST', '/api/director/sessions');
}

/** Envía un mensaje al Director AI y recibe respuesta */
export async function sendMessage(sessionId, content) {
  return _req('POST', `/api/director/sessions/${sessionId}/messages`, { content });
}

/** Obtiene metadata de la sesión (tokens, cost, tier, status) */
export async function getSession(sessionId) {
  return _req('GET', `/api/director/sessions/${sessionId}`);
}

/** Historial de mensajes paginado */
export async function getMessages(sessionId, page = 1, limit = 50) {
  return _req('GET', `/api/director/sessions/${sessionId}/messages?page=${page}&limit=${limit}`);
}

/** Cierra la sesión */
export async function endSession(sessionId) {
  return _req('DELETE', `/api/director/sessions/${sessionId}`);
}

/** Métricas de uso (superadmin) */
export async function getUsage(orgId, days = 30) {
  const qs = new URLSearchParams({ days });
  if (orgId) qs.set('org_id', orgId);
  return _req('GET', `/api/superadmin/director/usage?${qs}`);
}

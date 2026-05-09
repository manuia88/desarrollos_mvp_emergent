// W4.4E.5.1 — Caya API helpers (lead capture from bubble)
const API = process.env.REACT_APP_BACKEND_URL;

async function _fetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data?.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Captura un lead desde el bubble Caya. Reusa el endpoint asistente capture-lead
 * con `source` override = "caya_bubble".
 */
export async function captureLeadFromCaya(asistenteToken, payload) {
  if (!asistenteToken) throw new Error('asistente_token requerido');
  const body = {
    nombre: payload.nombre,
    whatsapp: payload.whatsapp,
    email: payload.email || null,
    mensaje: payload.mensaje || null,
    source: 'caya_bubble',
  };
  return _fetch(`${API}/api/asistente/sessions/${asistenteToken}/capture-lead`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

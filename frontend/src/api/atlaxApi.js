// W4.4E.5.2 — Atlax API helpers (formerly cayaApi). Lead capture from bubble.
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
 * Captura un lead desde el bubble Atlax. Reusa el endpoint asistente capture-lead
 * con `source` override = "atlax_bubble".
 */
export async function captureLeadFromAtlax(asistenteToken, payload) {
  if (!asistenteToken) throw new Error('asistente_token requerido');
  const body = {
    nombre: payload.nombre,
    whatsapp: payload.whatsapp,
    email: payload.email || null,
    mensaje: payload.mensaje || null,
    source: 'atlax_bubble',
    // V3-LEAD-01 · el lead lleva ficha (dev/unidad/lente) + visitor_id → el dev/asesor lo ve y hereda las señales
    // del comprador (antes: lead sin development_id → el dev nunca lo veía). Solo se incluyen si vienen.
    ...(payload.dev_id ? { dev_id: payload.dev_id } : {}),
    ...(payload.unit_number ? { unit_number: payload.unit_number } : {}),
    ...(payload.lens ? { lens: payload.lens } : {}),
    ...(payload.visitor_id ? { visitor_id: payload.visitor_id } : {}),
  };
  return _fetch(`${API}/api/asistente/sessions/${asistenteToken}/capture-lead`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

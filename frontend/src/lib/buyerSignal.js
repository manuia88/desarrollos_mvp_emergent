/**
 * Buyer Signals — cliente del espinazo de las 8 capas (Copiloto 2026-06-18).
 * Manda la conducta del comprador (like/view/dwell/save/share) al backend, atada al visitor_id (anónimo).
 * Fail-open + keepalive (no bloquea la navegación). Backend: POST /api/buyer/signal.
 */
const API = process.env.REACT_APP_BACKEND_URL;

// SEGURIDAD (pentest 2026-06-27): el visitor_id es la CAPABILITY que abre tus favoritos/quiz. Antes usaba
// Math.random()+Date.now() = ADIVINABLE → IDOR. Ahora alta entropía cripto (128 bits) → no adivinable.
function _strongId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fallthrough */ }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function visitorId() {
  try {
    let v = localStorage.getItem('dmx_visitor_id');
    if (!v) { v = 'v_' + _strongId(); localStorage.setItem('dmx_visitor_id', v); }
    return v;
  } catch { return 'v_anon'; }
}

export function sendBuyerSignal(type, opts = {}) {
  try {
    fetch(`${API}/api/buyer/signal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ visitor_id: visitorId(), type, ...opts }),
    }).catch(() => {});
  } catch { /* noop */ }
}

/** Lee el interés agregado de un desarrollo (likes/saves/views · k-anon ≥3) para prueba social en la ficha. */
export async function fetchInteres(devId) {
  try {
    const r = await fetch(`${API}/api/desarrollo/${devId}/interes`);
    return await r.json();
  } catch { return null; }
}

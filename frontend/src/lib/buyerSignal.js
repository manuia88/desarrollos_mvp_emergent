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

// Tipo de dispositivo — granularidad por device (mobile/desktop/tablet) en TODA señal.
function deviceType() {
  try {
    const ua = (navigator.userAgent || '').toLowerCase();
    if (/ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) return 'tablet';
    if (/mobi|iphone|ipod|android|blackberry|windows phone/.test(ua)) return 'mobile';
    return 'desktop';
  } catch { return 'unknown'; }
}

export function sendBuyerSignal(type, opts = {}) {
  try {
    fetch(`${API}/api/buyer/signal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ visitor_id: visitorId(), type, device: deviceType(), ...opts }),
    }).catch(() => {});
  } catch { /* noop */ }
}

// U1 cross-device: si el usuario está LOGUEADO, vincula este visitor_id a su cuenta → su gusto/lista lo siguen en
// cualquier dispositivo donde inicie sesión. Una vez por sesión, fail-silent (sin sesión = no-op en el backend).
export function claimVisitor() {
  try {
    if (sessionStorage.getItem('dmx_claimed')) return;   // ya vinculado en esta sesión
    fetch(`${API}/api/buyer/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', keepalive: true,
      body: JSON.stringify({ visitor_id: visitorId() }),
    })
      .then((r) => r.json())
      // Solo marca como hecho cuando REALMENTE vinculó (usuario logueado). Si se llamó anónimo (claimed:false), NO
      // marca → se re-dispara después del login. Fix #2 auditoría (antes marcaba siempre → nunca vinculaba al loguear).
      .then((d) => { if (d && d.claimed) sessionStorage.setItem('dmx_claimed', '1'); })
      .catch(() => {});
  } catch { /* noop */ }
}

/** Lee el interés agregado de un desarrollo (likes/saves/views · k-anon ≥3) para prueba social en la ficha. */
export async function fetchInteres(devId) {
  try {
    const r = await fetch(`${API}/api/desarrollo/${devId}/interes`);
    return await r.json();
  } catch { return null; }
}

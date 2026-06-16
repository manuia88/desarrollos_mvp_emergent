/**
 * sessionState — fuente única de verdad "¿hay sesión iniciada?" a nivel módulo.
 *
 * Motivo: varios hooks de preferencias (useDensity, usePresentationMode, useTour)
 * leen `GET /api/preferences/me` al montar. Cuando NO hay sesión, ese endpoint
 * responde 401 — manejado en JS (caen a defaults), pero el navegador igual lo
 * pinta como error en consola. La cura limpia es NO pedir preferencias sin sesión.
 *
 * `AuthProvider` (App.js) actualiza este flag tras /api/auth/me, login y logout.
 * Los hooks de preferencias consultan `hasSession()` antes de hacer fetch.
 *
 * No reemplaza al AuthContext (sigue siendo la verdad para React); es un espejo
 * sincrónico para código no-React (caches a nivel módulo) que corre fuera del
 * árbol de Auth (p.ej. PresentationModeProvider, que envuelve a AuthProvider).
 */

let _hasSession = false;
const _subscribers = new Set();

/** ¿Existe una sesión autenticada confirmada? */
export function hasSession() {
  return _hasSession;
}

/** Marca el estado de sesión (true tras login/me OK, false tras logout/401). */
export function setHasSession(value) {
  const next = !!value;
  if (next === _hasSession) return;
  _hasSession = next;
  _subscribers.forEach((fn) => {
    try { fn(next); } catch { /* aislar suscriptores */ }
  });
}

/** Suscribe a cambios de sesión. Devuelve función para desuscribir. */
export function onSessionChange(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

// atlaxPrefs — preferencias del comprador en Atlax (guardar / descartar + motivo / engagement por foto).
// CIERRA EL CICLO DE APRENDIZAJE: cada veredicto va a buyer_signals (el espinazo) → taste_scores rankea, superadmin
// agrega el porqué del NO, y la lista guardada se entrega al asesor (create_buyer_lead la espeja). Además guarda los
// sets en localStorage para el "no-repetir" instantáneo (la búsqueda excluye lo descartado sin ida al backend).
// Motivos del rechazo = la señal MÁS valiosa (el porqué del NO que nadie más captura).
import { sendBuyerSignal } from './buyerSignal';

export const REJECT_REASONS = [
  { key: 'fotos', label: 'Las fotos / el render' },
  { key: 'precio', label: 'El precio' },
  { key: 'zona', label: 'La zona' },
  { key: 'tamano', label: 'El tamaño' },
  { key: 'amenidades', label: 'Las amenidades' },
  { key: 'entrega', label: 'La entrega' },
];

const SAVED = 'dmx_atlax_saved';
const DISM = 'dmx_atlax_dismissed';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (_) { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* noop */ } };
const colSlug = (d) => String((d && (d.colonia_id || d.colonia)) || '').toLowerCase() || undefined;

export function isSaved(id) { return !!read(SAVED)[id]; }
export function isDismissed(id) { return !!read(DISM)[id]; }
export function getSavedIds() { return Object.keys(read(SAVED)); }
export function getDismissedIds() { return Object.keys(read(DISM)); }

// 👍 guardar / quitar — espejo a buyer_signals (save) → favoritos + handoff al asesor.
export function toggleSave(dev) {
  if (!dev || !dev.id) return false;
  const m = read(SAVED); const on = !m[dev.id];
  if (on) m[dev.id] = { id: dev.id, name: dev.name, ts: Date.now() }; else delete m[dev.id];
  write(SAVED, m);
  try { sendBuyerSignal(on ? 'save' : 'unsave', { entity_id: dev.id, colonia: colSlug(dev) }); } catch (_) { /* noop */ }
  return on;
}

// 👎 descartar + MOTIVO — el porqué del NO (la data privilegiada). No-repetir local + señal al espinazo.
export function dismiss(dev, reason, ctx) {
  if (!dev || !dev.id) return;
  const m = read(DISM); m[dev.id] = { reason, ts: Date.now() }; write(DISM, m);
  try {
    sendBuyerSignal('dismiss', {
      entity_id: dev.id, colonia: colSlug(dev), value: reason,
      meta: { reason, query: (ctx && ctx.query || '').slice(0, 80) || undefined, rank: ctx && ctx.rank, section: ctx && ctx.section },
    });
  } catch (_) { /* noop */ }
}
export function undismiss(id) { const m = read(DISM); delete m[id]; write(DISM, m); }

// engagement por FOTO — dwell (tiempo) + zoom. Así inferimos si la IMAGEN vende o mata (sin IA-juez).
export function logPhotoDwell(dev, photoIdx, ms) {
  if (!dev || !dev.id || !ms || ms < 400) return;  // <0.4s = ruido
  try { sendBuyerSignal('photo_dwell', { entity_id: dev.id, dwell_ms: Math.min(600000, Math.round(ms)), value: String(photoIdx) }); } catch (_) { /* noop */ }
}
export function logPhotoZoom(dev, photoIdx) {
  if (!dev || !dev.id) return;
  try { sendBuyerSignal('photo_zoom', { entity_id: dev.id, value: String(photoIdx) }); } catch (_) { /* noop */ }
}

/**
 * api/feedbackSignals.js — Señales de feedback estructuradas (Batch 7 feature).
 * Backend: backend/feedback_signals.py + routes/feedback_signals.py.
 * La IA convierte la conversación en etiquetas; dev/mercado ven etiquetas, nunca la conversación.
 */
const API = process.env.REACT_APP_BACKEND_URL;

// Taxonomía cerrada (espeja backend/feedback_signals.py) — labels en es-MX para la UI.
export const FEEDBACK_TAXONOMY = {
  outcome: {
    interesado: 'Interesado', no_interesado: 'No interesado', indeciso: 'Indeciso',
    follow_up: 'Requiere seguimiento', avanzo: 'Avanzó de etapa',
    cerrado_ganado: 'Cerrado — ganado', cerrado_perdido: 'Cerrado — perdido', no_show: 'No se presentó',
  },
  objeciones: {
    precio: ['general', 'm2', 'enganche', 'mensualidad', 'no_califico_credito'],
    producto: ['recamaras', 'm2', 'distribucion', 'acabados', 'piso_nivel', 'vista', 'orientacion'],
    amenidad: ['alberca', 'gym', 'roof', 'pet_friendly', 'coworking', 'seguridad', 'otra'],
    ubicacion: ['zona', 'lejos_trabajo', 'inseguridad', 'movilidad'],
    entrega: ['preventa_larga', 'queria_inmediata'],
    financiamiento: ['no_califico', 'tasa', 'banco', 'esquema_rigido'],
    timing_cliente: ['explorando', 'decision_familiar', 'no_urgente', 'se_echo_para_atras'],
    confianza: ['reputacion_dev', 'legal_escritura'],
    competencia: ['prefirio_otra_opcion'],
  },
  atractores: ['precio', 'ubicacion', 'amenidades', 'diseno', 'entrega', 'marca', 'tamano', 'financiamiento'],
  perfil: {
    tipo_comprador: ['primera_vivienda', 'inversion', 'segunda_casa', 'upgrade', 'downsize'],
    uso: ['habitar', 'rentar_largo', 'rentar_corto', 'especular'],
    urgencia: ['0_3m', '3_6m', '6_12m', 'mas_12m'],
    forma_pago: ['contado', 'credito_bancario', 'infonavit_fovissste', 'cofinanciamiento'],
    composicion: ['soltero', 'pareja', 'familia_hijos', 'adulto_mayor'],
  },
  competencia_motivo: ['mas_barato', 'mejor_ubicacion', 'entrega_mas_rapida', 'mejor_producto', 'otra'],
};

/** Registra señales estructuradas para un lead (owner-scoped en backend). `auto`=true → la IA las extrae. */
export async function recordFeedbackSignals(leadId, signals = {}, auto = false) {
  const r = await fetch(`${API}/api/leads/${encodeURIComponent(leadId)}/feedback-signals`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signals, auto }),
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw new Error(detail.detail || 'No se pudieron guardar las señales');
  }
  return r.json();
}

/** Índice de feedback de mercado para el dev (sus desarrollos) / superadmin (todo). k-anonimato por colonia. */
export async function getDevFeedbackIndex() {
  const r = await fetch(`${API}/api/dev/feedback-index`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar el índice de feedback');
  return r.json();
}

// ScoreRing — anillo de probabilidad de cierre (0–100%) en estética del mockup.
// QUÉ ES: el "anillo de score" de la sección "Qué tan listo está" del perfil-hub:
//         conic-gradient violeta→rosa (hero) con centro blanco y el % en tabular.
// CUÁNDO: tab Resumen del perfil-hub (probabilidad de cierre de getCloseProbability).
// El estilo vive en .asr-ring (asesor-aurora.css). Si no hay valor → muestra "—".
// Props: value (0–100|null) · label (texto bajo el anillo).
import React from 'react';

export default function ScoreRing({ value, label = 'probabilidad de cierre' }) {
  const has = value !== undefined && value !== null && !Number.isNaN(Number(value));
  const v = has ? Math.max(0, Math.min(100, Math.round(Number(value)))) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flexShrink: 0 }} data-testid="asr-score-ring">
      <div className="asr-ring" style={{ '--p': v }}>
        <span>{has ? v : '—'}{has && <small>%</small>}</span>
      </div>
      {label && (
        <em style={{ fontStyle: 'normal', fontSize: 12, color: 'var(--cream-3)', marginTop: 11 }}>{label}</em>
      )}
    </div>
  );
}

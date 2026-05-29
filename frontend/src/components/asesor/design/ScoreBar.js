// ScoreBar — barra de "qué tan listo está el lead" (0–100) con relleno aurora.
// QUÉ ES: surface del lead score (buyer_score) en estilo DMX: riel + relleno con
//         gradiente de marca + número + tooltip que lo explica en es-MX.
// CUÁNDO: cada card de Leads y el bloque "% cierre" / score de la Ficha360.
// Color del relleno = var(--grad) (marca, vía clase .asr-scorebar__fill). Si no
// hay score, muestra un guion discreto (no caja vacía).
// Props: score (0–100|null) · label (texto del tooltip) · showNumber.
import React, { useState } from 'react';

export default function ScoreBar({ score, label, showNumber = true, width = 96 }) {
  const [hover, setHover] = useState(false);
  const has = score !== undefined && score !== null && !Number.isNaN(Number(score));
  const v = has ? Math.max(0, Math.min(100, Math.round(Number(score)))) : 0;
  const tip = label || `Qué tan listo está para avanzar: ${has ? v : '—'} de 100. Sube con cada interacción.`;

  if (!has) {
    return (
      <span data-testid="asr-scorebar-empty" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: 'var(--cream-3)' }}>
        Sin score aún
      </span>
    );
  }

  return (
    <span
      data-testid="asr-scorebar"
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="asr-scorebar__track" style={{ width, display: 'inline-block' }}>
        <span className="asr-scorebar__fill" style={{ width: `${v}%` }} />
      </span>
      {showNumber && (
        <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 13, color: 'var(--cream)', minWidth: 22, textAlign: 'right' }}>
          {v}
        </span>
      )}
      {hover && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
            width: 220, padding: '8px 11px', borderRadius: 10, zIndex: 50,
            background: 'rgba(10, 13, 22, 0.97)',
            border: '1px solid rgba(var(--theme-rgb), 0.4)',
            color: 'var(--cream-2)', fontFamily: 'DM Sans, sans-serif',
            fontSize: 11, lineHeight: 1.5,
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
          }}
        >
          {tip}
        </span>
      )}
    </span>
  );
}

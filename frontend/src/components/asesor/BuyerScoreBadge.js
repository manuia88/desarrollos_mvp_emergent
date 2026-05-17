// BuyerScoreBadge — muestra el score de comprador con color-coding por tier.
// Props:
//   score: number | undefined
//   tier: 'hot' | 'warm' | 'cold' | undefined
//   delta: number | undefined  (puntos absolutos de cambio)
//   size: 'sm' | 'md' (default 'md')
import React, { useState } from 'react';

const TIER_PALETTE = {
  hot:  { bg: 'rgba(34,197,94,0.14)',  border: 'rgba(34,197,94,0.30)',  text: '#86efac', label: 'ACTIVO'  },
  warm: { bg: 'rgba(240,235,224,0.10)', border: 'rgba(240,235,224,0.22)', text: '#f0ebe0', label: 'TIBIO'   },
  cold: { bg: 'rgba(236,72,153,0.10)',  border: 'rgba(236,72,153,0.22)',  text: '#f9a8d4', label: 'FRIO'    },
};

export default function BuyerScoreBadge({ score, tier, delta, size = 'md' }) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (score === undefined || score === null) {
    return (
      <span
        data-testid="buyer-score-badge-empty"
        style={{
          padding: size === 'sm' ? '2px 6px' : '3px 9px',
          borderRadius: 9999,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: 'DM Sans',
          fontSize: size === 'sm' ? 9 : 10,
          color: 'var(--cream-3)',
          letterSpacing: '0.05em',
        }}
      >
        —
      </span>
    );
  }

  const resolvedTier = tier || (score >= 75 ? 'hot' : score >= 40 ? 'warm' : 'cold');
  const palette = TIER_PALETTE[resolvedTier] || TIER_PALETTE.cold;

  const deltaStr = delta !== undefined && delta !== null && delta !== 0
    ? (delta > 0 ? `+${Math.round(delta)}` : `${Math.round(delta)}`)
    : null;

  return (
    <span
      data-testid={`buyer-score-badge-${resolvedTier}`}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        style={{
          padding: size === 'sm' ? '2px 6px' : '3px 9px',
          borderRadius: 9999,
          background: palette.bg,
          border: `1px solid ${palette.border}`,
          fontFamily: 'DM Sans',
          fontWeight: 700,
          fontSize: size === 'sm' ? 9 : 10.5,
          color: palette.text,
          letterSpacing: '0.05em',
          cursor: 'default',
          userSelect: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {Math.round(score)}
        {deltaStr && (
          <span style={{ fontSize: size === 'sm' ? 8 : 9, opacity: 0.8, fontWeight: 500 }}>
            {deltaStr}
          </span>
        )}
      </span>

      {showTooltip && (
        <span
          data-testid="buyer-score-tooltip"
          style={{
            position: 'absolute',
            bottom: '130%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0e1015',
            border: '1px solid rgba(240,235,224,0.14)',
            borderRadius: 8,
            padding: '6px 10px',
            fontFamily: 'DM Sans',
            fontSize: 11,
            color: 'var(--cream-2)',
            whiteSpace: 'nowrap',
            zIndex: 999,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          Score {Math.round(score)} · {palette.label}
          {deltaStr && ` · ${deltaStr > 0 ? 'subio' : 'bajo'} ${Math.abs(delta)} pts`}
        </span>
      )}
    </span>
  );
}

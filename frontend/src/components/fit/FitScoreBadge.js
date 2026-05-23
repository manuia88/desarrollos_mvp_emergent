// W5.x F11 · FitScoreBadge · circulo con anillo segun score + chip "?" si tentativa
// W5.x F11 close · prop opcional `breakdown` activa FitBreakdownTooltip on hover (backward compat).
import React, { useState } from 'react';
import FitBreakdownTooltip from './FitBreakdownTooltip';

const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const SIZE_MAP = {
  sm: { box: 32, font: 11, ringHi: 3, ring: 2 },
  md: { box: 44, font: 13, ringHi: 3, ring: 2 },
  lg: { box: 60, font: 16, ringHi: 4, ring: 3 },
};

function ringFor(score) {
  if (score >= 80) return { kind: 'grad', width: 3 };
  if (score >= 60) return { kind: 'solid', color: INDIGO, width: 2 };
  if (score >= 40) return { kind: 'solid', color: 'rgba(240,235,224,0.4)', width: 2 };
  return { kind: 'solid', color: 'rgba(240,235,224,0.2)', width: 1 };
}

export default function FitScoreBadge({
  score = 0,
  confidence = 'media',
  size = 'md',
  onClick,
  breakdown = null,
  explanation_short = '',
  reasons_top_3 = [],
  tooltipPosition = 'bottom',
}) {
  const safe = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const cfg = SIZE_MAP[size] || SIZE_MAP.md;
  const ring = ringFor(safe);
  const interactive = typeof onClick === 'function';
  const hasTooltip = !!(breakdown && typeof breakdown === 'object' && Object.keys(breakdown).length > 0);
  const [hovered, setHovered] = useState(false);

  const ringBg = ring.kind === 'grad' ? GRAD : ring.color;
  const ringSize = ring.kind === 'grad' ? (cfg.ringHi || 3) : (ring.width || 2);

  // Tooltip positioning offsets per side · keep absolute relative to a wrapper
  const tooltipStyle = (() => {
    const base = { position: 'absolute', zIndex: 50, pointerEvents: 'none' };
    if (tooltipPosition === 'top') return { ...base, bottom: cfg.box + 8, left: '50%', transform: 'translateX(-50%)' };
    if (tooltipPosition === 'right') return { ...base, left: cfg.box + 8, top: '50%', transform: 'translateY(-50%)' };
    if (tooltipPosition === 'left') return { ...base, right: cfg.box + 8, top: '50%', transform: 'translateY(-50%)' };
    return { ...base, top: cfg.box + 8, left: '50%', transform: 'translateX(-50%)' };
  })();

  const Wrapper = hasTooltip ? 'span' : React.Fragment;
  const wrapperProps = hasTooltip
    ? {
        style: { position: 'relative', display: 'inline-block' },
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
        'data-testid': `fit-badge-wrapper-${size}`,
      }
    : {};

  return (
    <Wrapper {...wrapperProps}>
    <button
      type="button"
      data-testid={`fit-badge-${size}`}
      data-score={safe}
      data-confidence={confidence}
      onClick={interactive ? onClick : undefined}
      aria-label={`Fit ${safe}%`}
      style={{
        position: 'relative',
        width: cfg.box,
        height: cfg.box,
        padding: ringSize,
        borderRadius: 9999,
        background: ringBg,
        border: 'none',
        cursor: interactive ? 'pointer' : 'default',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `transform 280ms ${EASE}`,
      }}
      onMouseEnter={(e) => { if (interactive) e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)'; }}
      onMouseLeave={(e) => { if (interactive) e.currentTarget.style.transform = 'translateY(0) scale(1)'; }}
    >
      <span
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 9999,
          background: '#06080F',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 700,
          fontSize: cfg.font,
          color: CREAM,
          letterSpacing: '-0.01em',
        }}
      >{safe}%</span>

      {confidence === 'tentativa' && (
        <span
          data-testid="fit-badge-tentativa-chip"
          aria-label="Confianza tentativa"
          style={{
            position: 'absolute',
            top: -4, right: -4,
            width: 16, height: 16, borderRadius: 9999,
            background: '#F59E0B',
            color: '#06080F',
            fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 11,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #06080F',
          }}
        >?</span>
      )}
    </button>
    {hasTooltip && hovered && (
      <span style={tooltipStyle} data-testid="fit-badge-tooltip-wrap">
        <FitBreakdownTooltip
          score={safe}
          confidence={confidence}
          breakdown={breakdown}
          explanation_short={explanation_short}
          reasons_top_3={reasons_top_3}
          position={tooltipPosition}
        />
      </span>
    )}
    </Wrapper>
  );
}

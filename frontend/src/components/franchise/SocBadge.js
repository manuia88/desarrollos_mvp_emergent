/**
 * W6.MOV.1 · SocBadge.js
 * Pill badge SOC certification · 4 tiers (bronze, silver, gold, platinum) · 3 sizes.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

const TIER_STYLES = {
  bronze: {
    bg: 'rgba(180, 122, 81, 0.18)',
    border: '1px solid rgba(180, 122, 81, 0.42)',
    color: '#E8C9A3',
  },
  silver: {
    bg: 'rgba(99, 102, 241, 0.18)',
    border: '1px solid rgba(99, 102, 241, 0.42)',
    color: '#C7D2FE',
  },
  gold: {
    bg: 'linear-gradient(90deg, rgba(251,191,36,0.22), rgba(236,72,153,0.22))',
    border: '1px solid rgba(251,191,36,0.46)',
    color: '#FEF3C7',
  },
  platinum: {
    bg: 'linear-gradient(90deg, rgba(167,139,250,0.28), rgba(99,102,241,0.28), rgba(236,72,153,0.28))',
    border: '1px solid rgba(167,139,250,0.55)',
    color: '#F0EBE0',
    shimmer: true,
  },
};

const SIZE_STYLES = {
  sm: { padding: '3px 9px',  fontSize: 10, height: 22 },
  md: { padding: '5px 12px', fontSize: 12, height: 28 },
  lg: { padding: '8px 18px', fontSize: 14, height: 38 },
};

export default function SocBadge({
  level,
  score,
  size = 'md',
  showScore = false,
  onClick,
  testId,
}) {
  const { t } = useTranslation('common');
  if (!level) return null;
  const tierStyle = TIER_STYLES[level] || TIER_STYLES.bronze;
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.md;
  const labelKey = `socFranchise.level.${level}`;
  const fallback = level.toUpperCase();

  const clickable = typeof onClick === 'function';

  return (
    <span
      role={clickable ? 'button' : 'img'}
      tabIndex={clickable ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(e);
        }
      }}
      aria-label={`${t('socFranchise.label', 'SOC')} · ${t(labelKey, fallback)}${showScore && score != null ? ` · ${score}` : ''}`}
      data-testid={testId || `soc-badge-${level}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: tierStyle.bg,
        border: tierStyle.border,
        color: tierStyle.color,
        borderRadius: 9999,
        fontFamily: 'DM Sans, sans-serif',
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        cursor: clickable ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        ...sizeStyle,
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: tierStyle.color, opacity: 0.85,
      }} />
      <span>{t(labelKey, fallback)}</span>
      {showScore && score != null && (
        <span style={{ opacity: 0.75, fontWeight: 600 }}>· {Number(score).toFixed(0)}</span>
      )}
      {tierStyle.shimmer && (
        <span aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.18) 45%, transparent 65%)',
          animation: 'socShimmer 2.6s linear infinite',
          pointerEvents: 'none',
        }} />
      )}
      <style>{`
        @keyframes socShimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </span>
  );
}

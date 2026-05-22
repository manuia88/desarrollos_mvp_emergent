// W5.x F11 · FitBreakdownTooltip · panel con 6 barras + reasons_top_3
import React from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const MUTED = 'rgba(240,235,224,0.62)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const DIMENSIONS = [
  { key: 'presupuesto', i18n: 'fit.dim_presupuesto' },
  { key: 'audience', i18n: 'fit.dim_audience' },
  { key: 'busquedas', i18n: 'fit.dim_busquedas' },
  { key: 'comportamiento', i18n: 'fit.dim_comportamiento' },
  { key: 'ubicacion', i18n: 'fit.dim_ubicacion' },
  { key: 'especificas', i18n: 'fit.dim_especificas' },
];

function barFill(value) {
  if (value > 70) return GRAD;
  if (value > 40) return INDIGO;
  return 'rgba(240,235,224,0.32)';
}

function confidenceStyle(confidence) {
  switch (confidence) {
    case 'alta':
      return { bg: 'rgba(99,102,241,0.14)', color: '#C7D2FE', border: '1px solid rgba(99,102,241,0.40)' };
    case 'media':
      return { bg: 'rgba(240,235,224,0.06)', color: CREAM, border: '1px solid rgba(240,235,224,0.20)' };
    case 'baja':
      return { bg: 'rgba(240,235,224,0.04)', color: MUTED, border: '1px solid rgba(240,235,224,0.10)' };
    case 'tentativa':
      return { bg: 'rgba(245,158,11,0.12)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.40)' };
    default:
      return { bg: 'rgba(240,235,224,0.06)', color: CREAM, border: '1px solid rgba(240,235,224,0.20)' };
  }
}

export default function FitBreakdownTooltip({
  score = 0,
  confidence = 'media',
  breakdown = {},
  explanation_short = '',
  reasons_top_3 = [],
  position = 'bottom',
}) {
  const { t } = useTranslation('common');
  const safe = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const cChip = confidenceStyle(confidence);
  const cLabel = t(`fit.confidence_${confidence}`, confidence);

  return (
    <div
      data-testid="fit-breakdown-tooltip"
      data-position={position}
      role="dialog"
      aria-label={t('fit.score_label', 'Fit Score')}
      style={{
        maxWidth: 320,
        background: 'rgba(13,16,23,0.98)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: BORDER,
        borderRadius: 18,
        padding: 18,
        boxShadow: '0 18px 48px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.10)',
        fontFamily: 'DM Sans, sans-serif',
        color: CREAM,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <span style={{
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: INDIGO, fontWeight: 700,
        }}>{t('fit.score_label', 'Fit Score')}</span>
        <span style={{
          fontFamily: 'Outfit, sans-serif', fontWeight: 800,
          fontSize: 28, color: CREAM, letterSpacing: '-0.02em',
        }}>{safe}%</span>
      </div>

      {/* Confidence chip */}
      <div style={{ marginBottom: 12 }}>
        <span
          data-testid={`fit-confidence-${confidence}`}
          style={{
            display: 'inline-block',
            padding: '3px 10px', borderRadius: 9999,
            fontSize: 10.5, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            background: cChip.bg, color: cChip.color, border: cChip.border,
          }}
        >{cLabel}</span>
      </div>

      {/* Explanation */}
      {explanation_short && (
        <p data-testid="fit-explanation" style={{
          margin: '0 0 14px', fontSize: 13, lineHeight: 1.5,
          color: 'rgba(240,235,224,0.85)',
        }}>{explanation_short}</p>
      )}

      {/* Breakdown bars */}
      <div data-testid="fit-breakdown-bars" style={{ display: 'grid', gap: 9, marginBottom: 14 }}>
        {DIMENSIONS.map((d) => {
          const v = Math.max(0, Math.min(100, Math.round(Number(breakdown?.[d.key] ?? 0))));
          return (
            <div key={d.key} data-testid={`fit-dim-${d.key}`} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 32px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: MUTED, letterSpacing: '0.02em' }}>{t(d.i18n)}</span>
              <span style={{
                position: 'relative', height: 6, borderRadius: 9999,
                background: 'rgba(240,235,224,0.06)', overflow: 'hidden',
              }}>
                <span style={{
                  position: 'absolute', inset: 0,
                  width: `${v}%`, background: barFill(v),
                  borderRadius: 9999,
                  transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                }} />
              </span>
              <span style={{ fontSize: 11, color: CREAM, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
            </div>
          );
        })}
      </div>

      {/* Reasons top 3 */}
      {reasons_top_3 && reasons_top_3.length > 0 && (
        <ul data-testid="fit-reasons" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {reasons_top_3.slice(0, 3).map((r, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.45, color: 'rgba(240,235,224,0.82)' }}>
              <span aria-hidden="true" style={{
                marginTop: 6, width: 5, height: 5, borderRadius: 9999, background: INDIGO, flexShrink: 0,
              }} />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

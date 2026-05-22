// W5.9 · MigrationPatternCard · pattern individual con narrative + behavioral
import React from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const gradientText = {
  background: GRAD,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

function confidenceChipStyle(conf) {
  switch (String(conf || '').toLowerCase()) {
    case 'alta':
      return { bg: GRAD, color: '#FFF', border: '1px solid transparent' };
    case 'media':
      return { bg: 'rgba(99,102,241,0.14)', color: '#C7D2FE', border: `1px solid ${INDIGO}55` };
    case 'baja':
    default:
      return { bg: 'rgba(240,235,224,0.04)', color: MUTED, border: '1px solid rgba(240,235,224,0.16)' };
  }
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  } catch {
    return String(iso);
  }
}

export default function MigrationPatternCard({ pattern }) {
  const { t } = useTranslation('common');
  if (!pattern) return null;

  const conf = String(pattern.confidence || 'media').toLowerCase();
  const cChip = confidenceChipStyle(conf);
  const magnitude = Math.max(0, Math.min(100, Math.round(Number(pattern.magnitude) || 0)));

  return (
    <article
      data-testid={`migration-pattern-card-${pattern.pattern_id}`}
      style={{
        background: CARD_BG, border: BORDER, borderRadius: 24, padding: 22,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        fontFamily: 'DM Sans, sans-serif', color: CREAM,
        transition: `transform 320ms ${EASE}, border-color 320ms ${EASE}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Header chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        <span
          data-testid={`migration-pattern-confidence-${conf}`}
          style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: 9999,
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
            background: cChip.bg, color: cChip.color, border: cChip.border,
          }}
        >{t(`climateMigration.pattern_confidence_${conf}`, conf)}</span>
        {pattern.climate_driver && (
          <span
            data-testid="migration-pattern-driver"
            style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: 9999,
              fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em',
              background: 'rgba(240,235,224,0.06)', color: CREAM,
              border: '1px solid rgba(240,235,224,0.10)',
            }}
          >{pattern.climate_driver}</span>
        )}
      </div>

      {/* Origin → Destination big visual */}
      <div
        data-testid="migration-pattern-flow"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: 10, alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <span style={{
          fontFamily: 'Outfit, sans-serif', fontWeight: 800,
          fontSize: 20, color: CREAM, letterSpacing: '-0.01em', lineHeight: 1.15,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{pattern.origin_zone || '—'}</span>
        <span aria-hidden="true" style={{ ...gradientText, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22 }}>→</span>
        <span style={{
          fontFamily: 'Outfit, sans-serif', fontWeight: 800,
          fontSize: 20, color: CREAM, letterSpacing: '-0.01em', lineHeight: 1.15,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textAlign: 'right',
        }}>{pattern.destination_zone || '—'}</span>
      </div>

      {/* Magnitude */}
      <div data-testid="migration-pattern-magnitude" style={{ marginBottom: 14 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontSize: 11, color: MUTED_2, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6,
        }}>
          <span>{t('climateMigration.pattern_magnitude_label', 'Magnitud')}</span>
          <span style={{ color: CREAM, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{magnitude}/100</span>
        </div>
        <span style={{ display: 'block', height: 6, borderRadius: 9999, background: 'rgba(240,235,224,0.06)', overflow: 'hidden' }}>
          <span style={{
            display: 'block', height: '100%',
            width: `${magnitude}%`, background: GRAD, borderRadius: 9999,
            transition: `width 480ms ${EASE}`,
          }} />
        </span>
      </div>

      {/* Narrative */}
      {pattern.narrative_short && (
        <p data-testid="migration-pattern-narrative" style={{
          margin: '0 0 14px',
          color: 'rgba(240,235,224,0.85)',
          fontSize: 13, lineHeight: 1.5, fontStyle: 'italic',
        }}>{pattern.narrative_short}</p>
      )}

      {/* Footer */}
      <footer style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 10, fontSize: 11, color: MUTED_2,
      }}>
        {pattern.behavioral_evidence ? (
          <span data-testid="migration-pattern-evidence" style={{
            padding: '3px 10px', borderRadius: 9999,
            background: 'rgba(99,102,241,0.08)', color: '#C7D2FE',
            border: `1px solid ${INDIGO}33`,
            fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em',
          }}>{String(pattern.behavioral_evidence).slice(0, 60)}</span>
        ) : <span aria-hidden="true" />}
        <span>{fmtDate(pattern.detected_at)}</span>
      </footer>
    </article>
  );
}

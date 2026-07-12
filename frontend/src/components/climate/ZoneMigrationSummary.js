// W5.9 · ZoneMigrationSummary · detalle de zona individual
import React from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#1E2230';
const INDIGO = '#6366F1';
const MUTED = '#5A5F6E';
const MUTED_2 = '#9AA0AE';
const CARD_BG = '#FFFFFF';
const BORDER = '1px solid #ECECEC';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const gradientText = {
  background: GRAD,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

function netChipStyle(net) {
  const n = Number(net) || 0;
  if (n >= 30) return { bg: 'rgba(34,197,94,0.14)', color: '#86EFAC', border: '1px solid rgba(34,197,94,0.40)' };
  if (n <= -30) return { bg: 'rgba(239,68,68,0.12)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.40)' };
  return { bg: 'rgba(99,102,241,0.12)', color: '#C7D2FE', border: '1px solid rgba(99,102,241,0.40)' };
}

export default function ZoneMigrationSummary({ zone }) {
  const { t } = useTranslation('common');
  if (!zone) return null;

  const net = Math.round(Number(zone.net_score) || 0);
  const nChip = netChipStyle(net);
  const drivers = Array.isArray(zone.climate_drivers) ? zone.climate_drivers : [];
  const evidence = zone.behavioral_evidence || {};
  const demo = zone.demographic_signal || {};

  return (
    <section
      data-testid={`zone-migration-summary-${zone.zone_slug}`}
      style={{
        background: CARD_BG, border: BORDER, borderRadius: 24, padding: 26,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        fontFamily: 'DM Sans, sans-serif', color: CREAM,
      }}
    >
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <div>
          <span style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: INDIGO, fontWeight: 700 }}>
            {t('climateMigration.zone_summary_title', 'Resumen de migracion')}
          </span>
          <h2 style={{
            margin: '6px 0 0',
            fontFamily: 'Outfit, sans-serif', fontWeight: 800,
            fontSize: 24, color: CREAM, letterSpacing: '-0.02em',
          }}>{zone.zone_name || zone.zone_slug}</h2>
        </div>
        <span
          data-testid="zone-migration-net-chip"
          style={{
            padding: '5px 14px', borderRadius: 9999,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: nChip.bg, color: nChip.color, border: nChip.border,
            fontVariantNumeric: 'tabular-nums',
          }}
        >{`Neto ${net > 0 ? '+' : ''}${net}`}</span>
      </header>

      {/* 2 columns: outflow + inflow */}
      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 18 }}>
        <div data-testid="zone-migration-outflow-col">
          <div style={{ fontSize: 11, color: MUTED_2, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>
            {t('climateMigration.zone_outflow_label', 'Outflow')}
          </div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 32, color: '#FCA5A5', letterSpacing: '-0.02em' }}>
            {Math.round(zone.outflow_score || 0)}
          </div>
          {drivers.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6 }}>
              {drivers.slice(0, 4).map((d, i) => {
                const label = typeof d === 'string' ? d : (d?.driver || '');
                const sev = typeof d === 'object' ? d?.severity : null;
                return (
                  <li key={`${label}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: MUTED }}>
                    <span aria-hidden="true" style={{ marginTop: 6, width: 5, height: 5, borderRadius: 9999, background: '#EF4444', flexShrink: 0 }} />
                    <span>
                      {label}
                      {sev && <span style={{ color: MUTED_2, marginLeft: 6 }}>· {sev}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div data-testid="zone-migration-inflow-col">
          <div style={{ fontSize: 11, color: MUTED_2, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>
            {t('climateMigration.zone_inflow_label', 'Inflow')}
          </div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 32, color: '#86EFAC', letterSpacing: '-0.02em' }}>
            {Math.round(zone.inflow_score || 0)}
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 12, color: MUTED }}>
            {evidence.visits_trend_pct !== undefined && (
              <div>
                <span style={{ color: MUTED_2 }}>Visitas (trend): </span>
                <span style={{ color: CREAM, fontWeight: 600 }}>{Math.round(evidence.visits_trend_pct)}%</span>
              </div>
            )}
            {evidence.leads_trend_pct !== undefined && (
              <div>
                <span style={{ color: MUTED_2 }}>Leads (trend): </span>
                <span style={{ color: CREAM, fontWeight: 600 }}>{Math.round(evidence.leads_trend_pct)}%</span>
              </div>
            )}
            {evidence.last_30d_visits !== undefined && (
              <div>
                <span style={{ color: MUTED_2 }}>Ultimos 30d: </span>
                <span style={{ color: CREAM, fontWeight: 600 }}>{evidence.last_30d_visits}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Demographic INEGI */}
      {(demo.inegi_outflow_pct !== undefined || demo.period) && (
        <div style={{ marginBottom: 16 }}>
          <span
            data-testid="zone-migration-inegi-chip"
            style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: 9999,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              background: 'rgba(99,102,241,0.10)', color: '#C7D2FE',
              border: `1px solid ${INDIGO}55`,
            }}
          >
            {t('climateMigration.zone_demographic_label', 'INEGI')}
            {demo.inegi_outflow_pct !== undefined ? ` ${Math.round(demo.inegi_outflow_pct)}% outflow` : ''}
            {demo.period ? ` · ${demo.period}` : ''}
          </span>
        </div>
      )}

      {/* Narrative box */}
      {zone.narrative && (
        <div
          data-testid="zone-migration-narrative"
          style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(99,102,241,0.06)',
            borderLeft: `3px solid ${INDIGO}`,
            color: '#434A5C',
            fontSize: 13, lineHeight: 1.6,
            marginBottom: zone.recommendation ? 14 : 0,
          }}
        >{zone.narrative}</div>
      )}

      {/* Recommendation gradient */}
      {zone.recommendation && (
        <p data-testid="zone-migration-recommendation" style={{ ...gradientText, margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.01em' }}>
          {zone.recommendation}
        </p>
      )}
    </section>
  );
}

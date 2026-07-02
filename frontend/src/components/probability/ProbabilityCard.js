// W5 cleanup · ProbabilityCard · Kalshi-style + insufficient_data + breakdown
// Tema CLARO (Apple-tier). Lee EXACTO el shape del backend probability_engine.py:
//   sources_breakdown: [{ source, contribution_pct, value_used }]
// (antes leía s.weight_pct/s.label/s.value → siempre 0% y "Fuente 1/2"). Motor NO se toca.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchProbabilityCardData } from '../../api/probability';

// ── Paleta CLARA (misma que Mapa.js / InversionV4Calculator) ──────────────────
const INK = '#1E2230';       // texto principal
const MUTED = '#5A5F6E';     // secundario
const FAINT = '#9AA0AE';     // tenue
const CARD_BG = '#FFFFFF';
const BORDER = '1px solid #ECECEC';
const TRACK = '#F1F2F6';     // fondo de barras / carriles
const THEME = 'var(--theme)';
const GRAD = 'var(--grad)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const gradientText = {
  background: GRAD,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

const DEFAULT_TITLE_KEY = {
  sells_complete: 'probabilityCard.title_sells_complete',
  drpi_up: 'probabilityCard.title_drpi_up',
  closes_below_listed: 'probabilityCard.title_closes_below_listed',
};

function confidenceChipStyle(lvl) {
  switch (String(lvl || '').toUpperCase()) {
    case 'ALTA':
      return { bg: GRAD, color: '#FFF', border: '1px solid transparent' };
    case 'MEDIA':
      return { bg: 'rgba(var(--theme-rgb),0.10)', color: THEME, border: '1px solid rgba(var(--theme-rgb),0.30)' };
    case 'BAJA':
    default:
      return { bg: '#F1F2F6', color: MUTED, border: '1px solid #E4E5EB' };
  }
}

// value_used llega como "estimado_14_800_000mxn" / "sigma_1_200_000mxn" / "delta_+3.2pct_12m" /
// "absorcion_62.0pct" / "leads_8_en_12m". Lo humanizamos para que se lea bonito (sin inventar dato).
function humanizeValue(raw) {
  if (raw === undefined || raw === null) return '';
  let s = String(raw);
  s = s.replace(/_/g, ' ');
  s = s.replace(/\bmxn\b/gi, 'MXN').replace(/\bpct\b/gi, '%');
  return s.trim();
}

export default function ProbabilityCard({ type, id, months, listed, title, hideIfEmpty = false }) {
  const { t } = useTranslation('common');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(false);
    setData(null);
    (async () => {
      const res = await fetchProbabilityCardData({ type, id, months, listed });
      if (!mounted) return;
      if (!res) {
        setError(true);
      } else {
        setData(res);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [type, id, months, listed]);

  const resolvedTitle = title || t(DEFAULT_TITLE_KEY[type] || 'probabilityCard.title_sells_complete');

  const shell = {
    background: CARD_BG, border: BORDER, borderRadius: 16, padding: 26,
    boxShadow: '0 1px 2px rgba(16,18,28,0.04), 0 8px 24px rgba(16,18,28,0.05)',
    fontFamily: 'DM Sans, sans-serif', color: INK,
  };

  // Loading state (skeleton claro)
  if (loading) {
    return (
      <section data-testid={`probability-card-${type || 'unknown'}`} data-state="loading" style={shell}>
        <div style={{ height: 12, width: '40%', background: TRACK, borderRadius: 9999, marginBottom: 16 }} />
        <div style={{ height: 56, width: '46%', background: TRACK, borderRadius: 12, margin: '0 auto 18px' }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ height: 10, background: TRACK, borderRadius: 9999, marginBottom: 10 }} />
        ))}
      </section>
    );
  }

  // Error / no data → fallback honesto
  if (error || !data) {
    if (hideIfEmpty) return null;
    return (
      <section data-testid={`probability-card-${type || 'unknown'}`} data-state="error" style={shell}>
        <div style={{ letterSpacing: '0.22em', fontSize: 11, color: THEME, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
          {t('probabilityCard.eyebrow', 'Probabilidad · datos reales')}
        </div>
        <h2 style={{ margin: '0 0 12px', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, color: INK, letterSpacing: '-0.02em' }}>
          {resolvedTitle}
        </h2>
        <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>{t('probabilityCard.error', 'No fue posible cargar la prediccion.')}</p>
      </section>
    );
  }

  const insufficient = !!data.insufficient_data;
  if (insufficient && hideIfEmpty) return null;
  const pct = Math.max(0, Math.min(100, Math.round(Number(data.probability_pct) || 0)));
  const confidence = String(data.confidence_lvl || data.confidence || 'MEDIA').toUpperCase();
  const sources = Array.isArray(data.sources_breakdown) ? data.sources_breakdown : [];
  const explanation = data.explanation_es || data.explanation || '';
  const cChip = confidenceChipStyle(confidence);

  return (
    <section
      data-testid={`probability-card-${type || 'unknown'}`}
      data-state={insufficient ? 'insufficient' : 'ready'}
      style={shell}
    >
      {/* Header */}
      <header style={{ marginBottom: insufficient ? 12 : 16 }}>
        <div style={{ letterSpacing: '0.22em', fontSize: 11, color: THEME, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
          {t('probabilityCard.eyebrow', 'Probabilidad · datos reales')}
        </div>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 24, color: INK, letterSpacing: '-0.02em' }}>
          {resolvedTitle}
        </h2>
      </header>

      {insufficient ? (
        <div data-testid="probability-insufficient" style={{
          display: 'grid', gap: 10, padding: '14px 16px',
          borderRadius: 14,
          background: '#FEF7EC',
          border: '1px solid #F5D9A8',
        }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
            background: '#FBE4BE', color: '#9A6A10',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
            width: 'fit-content',
          }}>{t('probabilityCard.insufficient_chip', 'Datos acumulandose')}</span>
          <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 16, color: INK }}>
            {t('probabilityCard.insufficient_data_title', 'Prediccion aun no disponible')}
          </h3>
          <p style={{ margin: 0, color: MUTED, fontSize: 13, lineHeight: 1.55 }}>
            {t('probabilityCard.insufficient_data_body', 'Necesitamos mas senales para una prediccion confiable. Vuelve en unos dias.')}
          </p>
        </div>
      ) : (
        <>
          {/* Big number */}
          <div style={{ textAlign: 'center', margin: '14px 0 6px' }}>
            <div
              data-testid="probability-pct"
              style={{
                ...gradientText,
                fontFamily: 'Outfit, sans-serif', fontWeight: 800,
                fontSize: 56, lineHeight: 1, letterSpacing: '-0.03em',
              }}
            >{pct}%</div>
          </div>

          {/* Confidence chip */}
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <span
              data-testid={`probability-confidence-${confidence}`}
              style={{
                display: 'inline-block',
                padding: '4px 12px', borderRadius: 9999,
                fontSize: 10.5, fontWeight: 700,
                letterSpacing: '0.10em', textTransform: 'uppercase',
                background: cChip.bg, color: cChip.color, border: cChip.border,
              }}
            >{t(`probabilityCard.confidence_${confidence.toLowerCase()}`, `Confianza ${confidence}`)}</span>
          </div>

          {/* Sources breakdown — FIX: backend manda {source, contribution_pct, value_used} */}
          {sources.length > 0 && (
            <div data-testid="probability-sources" style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: FAINT, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>
                {t('probabilityCard.sources_label', 'Fuentes que pesan')}
              </div>
              {sources.slice(0, 5).map((s, i) => {
                const weight = Math.max(0, Math.min(100, Number(s.contribution_pct) || 0));
                const label = s.source || `Fuente ${i + 1}`;
                const valueStr = humanizeValue(s.value_used);
                return (
                  <div key={`${label}-${i}`} data-testid={`probability-source-${i}`} style={{ display: 'grid', gridTemplateColumns: '8px 1fr', gap: 10, alignItems: 'start' }}>
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 9999, background: THEME, marginTop: 6, marginLeft: 2 }} />
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <span style={{ fontSize: 13, color: INK, fontWeight: 700 }}>
                          {label}
                          {valueStr && (
                            <span style={{ color: MUTED, marginLeft: 8, fontWeight: 500 }}>· {valueStr}</span>
                          )}
                        </span>
                        <span style={{ fontSize: 12, color: FAINT, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{Math.round(weight)}%</span>
                      </div>
                      <span style={{ height: 5, borderRadius: 9999, background: TRACK, overflow: 'hidden', display: 'block' }}>
                        <span style={{
                          display: 'block', height: '100%',
                          width: `${weight}%`,
                          background: weight > 50 ? GRAD : THEME,
                          borderRadius: 9999,
                          transition: `width 480ms ${EASE}`,
                        }} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Explanation */}
          {explanation && (
            <p data-testid="probability-explanation" style={{
              margin: 0, color: MUTED,
              fontSize: 13, lineHeight: 1.6,
              padding: '12px 14px',
              borderLeft: '3px solid var(--theme)',
              background: 'rgba(var(--theme-rgb),0.05)',
              borderRadius: 8,
            }}>{explanation}</p>
          )}
        </>
      )}

      {/* Hint footer · siempre */}
      {!insufficient && (
        <div style={{ marginTop: 14, fontSize: 11, color: FAINT, letterSpacing: '0.04em' }}>
          {t('probabilityCard.footer_disclaimer', 'Prediccion basada en datos verificados · no constituye recomendacion de inversion.')}
        </div>
      )}
    </section>
  );
}

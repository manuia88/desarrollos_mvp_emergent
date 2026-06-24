// W5 cleanup · ProbabilityCard · Kalshi-style + insufficient_data + breakdown
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchProbabilityCardData } from '../../api/probability';

// Tema CLARO (la ficha vive en LightScope) — antes eran valores oscuros que rompían el rediseño.
const CREAM = '#1E2230';
const INDIGO = '#6366F1';
const MUTED = '#4A4F5E';
const MUTED_2 = '#8A8F9E';
const CARD_BG = '#FFFFFF';
const BORDER = '1px solid #ECECEC';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
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
      return { bg: 'rgba(99,102,241,0.14)', color: '#C7D2FE', border: `1px solid ${INDIGO}55` };
    case 'BAJA':
    default:
      return { bg: 'rgba(240,235,224,0.04)', color: MUTED, border: '1px solid rgba(240,235,224,0.16)' };
  }
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

  // Loading state
  if (loading) {
    return (
      <section
        data-testid={`probability-card-${type || 'unknown'}`}
        data-state="loading"
        style={{
          background: CARD_BG, border: BORDER, borderRadius: 24, padding: 26,
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          fontFamily: 'DM Sans, sans-serif', color: CREAM,
        }}
      >
        <div style={{ height: 12, width: '40%', background: 'rgba(240,235,224,0.08)', borderRadius: 9999, marginBottom: 16 }} />
        <div style={{ height: 56, width: '50%', background: 'rgba(240,235,224,0.06)', borderRadius: 12, margin: '0 auto 18px' }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ height: 10, background: 'rgba(240,235,224,0.05)', borderRadius: 9999, marginBottom: 10 }} />
        ))}
      </section>
    );
  }

  // Error / no data → mostrar fallback honest
  if (error || !data) {
    if (hideIfEmpty) return null;   // ficha: no mostrar caja muerta cuando no hay predicción
    return (
      <section
        data-testid={`probability-card-${type || 'unknown'}`}
        data-state="error"
        style={{
          background: CARD_BG, border: BORDER, borderRadius: 24, padding: 26,
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          fontFamily: 'DM Sans, sans-serif', color: CREAM,
        }}
      >
        <div style={{ letterSpacing: '0.22em', fontSize: 11, color: INDIGO, textTransform: 'uppercase', marginBottom: 8 }}>
          {t('probabilityCard.eyebrow', 'Probabilidad · datos reales')}
        </div>
        <h2 style={{ margin: '0 0 12px', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, color: CREAM, letterSpacing: '-0.02em' }}>
          {resolvedTitle}
        </h2>
        <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>{t('probabilityCard.error', 'No fue posible cargar la prediccion.')}</p>
      </section>
    );
  }

  const insufficient = !!data.insufficient_data;
  if (insufficient && hideIfEmpty) return null;   // ficha: ocultar cuando aún no hay señales suficientes
  const pct = Math.max(0, Math.min(100, Math.round(Number(data.probability_pct) || 0)));
  const confidence = String(data.confidence_lvl || data.confidence || 'MEDIA').toUpperCase();
  const sources = Array.isArray(data.sources_breakdown) ? data.sources_breakdown : [];
  const explanation = data.explanation_es || data.explanation || '';
  const cChip = confidenceChipStyle(confidence);

  return (
    <section
      data-testid={`probability-card-${type || 'unknown'}`}
      data-state={insufficient ? 'insufficient' : 'ready'}
      style={{
        background: CARD_BG, border: BORDER, borderRadius: 24, padding: 26,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        fontFamily: 'DM Sans, sans-serif', color: CREAM,
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: insufficient ? 12 : 16 }}>
        <div style={{ letterSpacing: '0.22em', fontSize: 11, color: INDIGO, textTransform: 'uppercase', marginBottom: 8 }}>
          {t('probabilityCard.eyebrow', 'Probabilidad · datos reales')}
        </div>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 24, color: CREAM, letterSpacing: '-0.02em' }}>
          {resolvedTitle}
        </h2>
      </header>

      {insufficient ? (
        <div data-testid="probability-insufficient" style={{
          display: 'grid', gap: 10, padding: '14px 16px',
          borderRadius: 14,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.35)',
        }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
            background: 'rgba(245,158,11,0.18)', color: '#FBBF24',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
            width: 'fit-content',
          }}>{t('probabilityCard.insufficient_chip', 'Datos acumulandose')}</span>
          <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 16, color: CREAM }}>
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

          {/* Sources breakdown */}
          {sources.length > 0 && (
            <div data-testid="probability-sources" style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: MUTED_2, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                {t('probabilityCard.sources_label', 'Fuentes que pesan')}
              </div>
              {sources.slice(0, 5).map((s, i) => {
                const weight = Math.max(0, Math.min(100, Number(s.weight_pct) || 0));
                return (
                  <div key={`${s.label || 'src'}-${i}`} data-testid={`probability-source-${i}`} style={{ display: 'grid', gridTemplateColumns: '8px 1fr', gap: 10, alignItems: 'center' }}>
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 9999, background: INDIGO, marginLeft: 2 }} />
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <span style={{ fontSize: 13, color: CREAM, fontWeight: 600 }}>
                          {s.label || `Fuente ${i + 1}`}
                          {s.value !== undefined && s.value !== null && (
                            <span style={{ color: MUTED, marginLeft: 8, fontWeight: 500 }}>· {String(s.value)}</span>
                          )}
                        </span>
                        <span style={{ fontSize: 12, color: MUTED_2, fontVariantNumeric: 'tabular-nums' }}>{Math.round(weight)}%</span>
                      </div>
                      <span style={{ height: 4, borderRadius: 9999, background: 'rgba(240,235,224,0.06)', overflow: 'hidden', display: 'block' }}>
                        <span style={{
                          display: 'block', height: '100%',
                          width: `${weight}%`,
                          background: weight > 50 ? GRAD : INDIGO,
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
              fontSize: 13, lineHeight: 1.6, fontStyle: 'italic',
              padding: '12px 14px',
              borderLeft: `3px solid ${INDIGO}`,
              background: 'rgba(99,102,241,0.06)',
              borderRadius: 8,
            }}>{explanation}</p>
          )}
        </>
      )}

      {/* Hint footer · siempre */}
      {!insufficient && (
        <div style={{ marginTop: 14, fontSize: 11, color: MUTED_2, letterSpacing: '0.04em' }}>
          {t('probabilityCard.footer_disclaimer', 'Prediccion basada en datos verificados · no constituye recomendacion de inversion.')}
        </div>
      )}
    </section>
  );
}

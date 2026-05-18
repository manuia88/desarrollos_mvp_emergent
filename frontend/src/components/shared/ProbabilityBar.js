/**
 * W5.19 — ProbabilityBar · barra horizontal estilo Kalshi.
 *
 * Props:
 *   type: "sells_complete" | "drpi_up" | "closes_below_listed"
 *   entity_id: string
 *   params: { months?, listed? }
 *   title: string (opcional, fallback a i18n)
 *
 * Reglas:
 *   - Hidden si insufficient_data=true → muestra mensaje compacto "data acumulándose"
 *   - Barra horizontal fill % color-coded
 *   - Tooltip hover/click: sources icons + confidence_lvl + explanation_es
 *   - Footer "Actualizado hace X min"
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getProbability } from '../../api/probability';

const COLOR_GREEN = '#10B981';
const COLOR_YELLOW = '#F59E0B';
const COLOR_RED = '#EF4444';

function _color(pct) {
  if (pct >= 70) return COLOR_GREEN;
  if (pct >= 40) return COLOR_YELLOW;
  return COLOR_RED;
}

function _bgAlpha(pct) {
  if (pct >= 70) return 'rgba(16,185,129,0.1)';
  if (pct >= 40) return 'rgba(245,158,11,0.1)';
  return 'rgba(239,68,68,0.1)';
}

function _elapsed(iso) {
  if (!iso) return null;
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  return `${Math.floor(diff / 3600)}h`;
}

const SOURCE_ICONS = {
  AVM: 'A',
  Forecast: 'F',
  WhatIf: 'W',
  FSD: 'S',
  Comparables: 'C',
};

const CONFIDENCE_COLORS = {
  ALTA: '#10B981',
  MEDIA: '#F59E0B',
  BAJA: '#6B7280',
};

function BarTooltip({ data }) {
  const { t } = useTranslation();
  const confColor = CONFIDENCE_COLORS[data.confidence_lvl] || '#6B7280';

  return (
    <div
      data-testid="probability-bar-tooltip"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 10px)',
        left: 0,
        right: 0,
        zIndex: 50,
        padding: '14px 16px',
        borderRadius: 14,
        background: 'rgba(6,8,15,0.97)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        color: '#F0EBE0',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      {/* Confidence badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          padding: '3px 10px', borderRadius: 9999,
          background: `${confColor}22`,
          border: `1px solid ${confColor}55`,
          color: confColor,
          fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
        }}>
          {t(`probability.confidence.${data.confidence_lvl}`, { defaultValue: data.confidence_lvl })}
        </span>
        <span style={{ color: 'rgba(240,235,224,0.5)', fontSize: 11 }}>
          {t('probability.tooltip.sources_label', { defaultValue: 'Fuentes' })}
        </span>
      </div>

      {/* Sources icons */}
      {Array.isArray(data.sources_breakdown) && data.sources_breakdown.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {data.sources_breakdown.map((s, i) => (
            <div
              key={i}
              title={s.value_used}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 9999,
                background: 'rgba(99,102,241,0.16)',
                border: '1px solid rgba(99,102,241,0.32)',
                fontSize: 10, fontWeight: 700,
                color: '#a5b4fc', letterSpacing: '0.05em',
              }}
            >
              <span style={{
                width: 15, height: 15, borderRadius: 4,
                background: 'rgba(99,102,241,0.45)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 8, color: '#fff',
              }}>
                {SOURCE_ICONS[s.source] || s.source[0]}
              </span>
              {t(`probability.sources.${s.source}`, { defaultValue: s.source })} {s.contribution_pct}%
            </div>
          ))}
        </div>
      )}

      {/* Explanation */}
      {data.explanation_es && (
        <p style={{
          margin: '0 0 8px',
          color: 'rgba(240,235,224,0.72)',
          fontSize: 11,
          lineHeight: 1.5,
        }}>
          {data.explanation_es}
        </p>
      )}

      {/* Footer */}
      {data.computed_at && (
        <p style={{ margin: 0, color: 'rgba(240,235,224,0.38)', fontSize: 10 }}>
          {t('probability.tooltip.footer_updated', {
            defaultValue: 'Actualizado hace {{time}}',
            time: _elapsed(data.computed_at),
          })}
        </p>
      )}
    </div>
  );
}

export function ProbabilityBar({ type, entity_id, params = {}, title }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useEffect(() => {
    if (!type || !entity_id) return;
    setLoading(true);
    setError(false);
    let cancelled = false;
    getProbability(type, entity_id, params)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, entity_id, params.months, params.listed]);

  const toggleTooltip = useCallback(() => {
    setTooltipOpen(o => !o);
  }, []);

  // Calcular título a mostrar
  const titleKeys = {
    sells_complete: 'probability.title.sells_12m',
    drpi_up: 'probability.title.drpi_3m',
    closes_below_listed: 'probability.title.closes_below',
  };
  const displayTitle = title || t(titleKeys[type] || titleKeys.drpi_up, {
    defaultValue: type === 'sells_complete'
      ? 'Probabilidad venta completa 12m'
      : type === 'drpi_up'
      ? 'Probabilidad subida DRPI 3m'
      : 'Probabilidad cierre bajo listado',
  });

  if (loading) return null;
  if (error) return null;
  if (!data) return null;

  // Insufficient data → mensaje compacto (no empty state)
  if (data.insufficient_data) {
    return (
      <div
        data-testid={`probability-bar-${type}-insufficient`}
        style={{
          padding: '10px 14px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 12,
          color: 'rgba(240,235,224,0.45)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)', flexShrink: 0,
        }} />
        {t('probability.fallback.data_acumulando', {
          defaultValue: 'Prediccion no disponible · data acumulandose',
        })}
      </div>
    );
  }

  const pct = data.probability_pct;
  const barColor = _color(pct);
  const bgColor = _bgAlpha(pct);

  return (
    <div
      data-testid={`probability-bar-${type}`}
      style={{
        padding: '14px 16px',
        borderRadius: 16,
        background: 'rgba(13,16,23,0.85)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Titulo */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <span style={{
          fontFamily: 'DM Sans, sans-serif',
          fontWeight: 700, fontSize: 12,
          color: 'rgba(240,235,224,0.65)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {displayTitle}
        </span>
        <span
          data-testid={`probability-bar-pct-${type}`}
          style={{
            fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22,
            color: barColor, letterSpacing: '-0.02em',
          }}
        >
          {pct}%
        </span>
      </div>

      {/* Barra Kalshi */}
      <div
        style={{
          position: 'relative', height: 8, borderRadius: 9999,
          background: 'rgba(255,255,255,0.07)',
          overflow: 'hidden', cursor: 'pointer',
        }}
        onClick={toggleTooltip}
        role="button"
        aria-label={`Ver detalles de probabilidad ${pct}%`}
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleTooltip(); }}
      >
        {/* Fill */}
        <div style={{
          height: '100%',
          width: `${Math.min(100, Math.max(0, pct))}%`,
          borderRadius: 9999,
          background: `linear-gradient(90deg, ${barColor}cc, ${barColor})`,
          transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
        }} />
        {/* Marker en la posición */}
        <div style={{
          position: 'absolute',
          top: -3, bottom: -3,
          left: `calc(${Math.min(100, Math.max(0, pct))}% - 3px)`,
          width: 6,
          borderRadius: 9999,
          background: barColor,
          boxShadow: `0 0 8px ${barColor}`,
          transition: 'left 600ms cubic-bezier(0.22,1,0.36,1)',
        }} />
      </div>

      {/* Labels escala */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: 4,
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 9, color: 'rgba(240,235,224,0.3)',
      }}>
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>

      {/* Tooltip */}
      {tooltipOpen && data && (
        <BarTooltip data={data} />
      )}

      {/* Footer */}
      {!tooltipOpen && data.computed_at && (
        <p style={{
          margin: '8px 0 0',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 10,
          color: 'rgba(240,235,224,0.32)',
        }}>
          {t('probability.tooltip.footer_updated', {
            defaultValue: 'Actualizado hace {{time}}',
            time: _elapsed(data.computed_at),
          })}
        </p>
      )}
    </div>
  );
}

export default ProbabilityBar;

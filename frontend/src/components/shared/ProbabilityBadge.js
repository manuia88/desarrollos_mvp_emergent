/**
 * W5.19 — ProbabilityBadge · componente compacto pill.
 *
 * Props:
 *   type: "sells_complete" | "drpi_up" | "closes_below_listed"
 *   entity_id: string
 *   params: { months?, listed? }
 *   format: "compact" | "medium"  (default "compact")
 *
 * Reglas:
 *   - Hidden si insufficient_data=true (return null)
 *   - Click → toggle tooltip con sources icons
 *   - Colores semánticos: verde ≥70, amarillo 40-70, rojo <40
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
  if (pct >= 70) return 'rgba(16,185,129,0.14)';
  if (pct >= 40) return 'rgba(245,158,11,0.14)';
  return 'rgba(239,68,68,0.14)';
}

function SourcesTooltip({ sources, explanation, onClose }) {
  const SOURCE_ICONS = {
    AVM: 'A',
    Forecast: 'F',
    WhatIf: 'W',
    FSD: 'S',
    Comparables: 'C',
  };

  return (
    <div
      role="tooltip"
      data-testid="probability-badge-tooltip"
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        minWidth: 220,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(var(--bg-rgb),0.97)',
        border: '1px solid rgba(var(--cream-rgb),0.12)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
        color: 'var(--cream)',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: 'normal',
      }}
    >
      {/* Sources icons */}
      {Array.isArray(sources) && sources.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {sources.map((s, i) => (
            <div
              key={i}
              title={`${s.source}: ${s.contribution_pct}% · ${s.value_used}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 9999,
                background: 'rgba(99,102,241,0.18)',
                border: '1px solid rgba(99,102,241,0.35)',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              }}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 4,
                background: 'rgba(99,102,241,0.5)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 9, color: '#fff',
              }}>
                {SOURCE_ICONS[s.source] || s.source[0]}
              </span>
              {s.source} {s.contribution_pct}%
            </div>
          ))}
        </div>
      )}
      {/* Explanation */}
      {explanation && (
        <p style={{ margin: 0, color: 'rgba(var(--cream-rgb),0.75)', fontSize: 11 }}>
          {explanation}
        </p>
      )}
    </div>
  );
}

export function ProbabilityBadge({ type, entity_id, params = {}, format = 'compact' }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!type || !entity_id) return;
    let cancelled = false;
    getProbability(type, entity_id, params)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, entity_id, params.months, params.listed]);

  const toggle = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(o => !o);
  }, []);

  if (error || !data) return null;
  if (data.insufficient_data) return null;

  const pct = data.probability_pct;
  const color = _color(pct);
  const bgAlpha = _bgAlpha(pct);
  // Etiqueta legible (antes mostraba la key i18n cruda "probability.badge.*": t() devuelve la key cuando
  // falta la traducción → truthy → nunca caía al fallback). defaultValue lo resuelve de raíz.
  const typeLabels = {
    sells_complete: `${pct}% se vende`,
    drpi_up: `${pct}% plusvalía`,
    closes_below_listed: `${pct}% bajo lista`,
  };
  const displayLabel = t(`probability.badge.${type}`, { pct, defaultValue: typeLabels[type] || `${pct}%` });

  return (
    <div
      data-testid={`probability-badge-${type}`}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      <button
        onClick={toggle}
        aria-label={`Probabilidad ${type}: ${pct}%`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: format === 'medium' ? '5px 12px' : '3px 9px',
          borderRadius: 9999,
          background: bgAlpha,
          border: `1px solid ${color}44`,
          color: color,
          fontFamily: 'DM Sans, sans-serif',
          fontWeight: 700,
          fontSize: format === 'medium' ? 12 : 11,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          transition: 'background 200ms, transform 200ms',
          outline: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = bgAlpha.replace('0.14', '0.25'); }}
        onMouseLeave={e => { e.currentTarget.style.background = bgAlpha; }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: color, flexShrink: 0,
        }} />
        {displayLabel}
      </button>

      {open && (
        <SourcesTooltip
          sources={data.sources_breakdown}
          explanation={data.explanation_es}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export default ProbabilityBadge;

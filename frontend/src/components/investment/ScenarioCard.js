// W4.14 — ScenarioCard · tarjeta de escenario de inversión
import React, { useState } from 'react';
import ScoreBadge from './ScoreBadge';

const SCENARIO_COLORS = {
  conservador: { accent: '#6B7280', bg: 'rgba(107,114,128,0.08)', label: 'Conservador' },
  base:        { accent: 'var(--theme)', bg: 'rgba(var(--theme-rgb),0.1)',  label: 'Base' },
  optimista:   { accent: '#10B981', bg: 'rgba(16,185,129,0.1)',  label: 'Optimista' },
};

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export default function ScenarioCard({ tier, scenario, expanded: exProp, onExpand }) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = exProp !== undefined ? exProp : localExpanded;
  const colors = SCENARIO_COLORS[tier] || SCENARIO_COLORS.base;

  const kpis = [
    { label: 'ROI total', value: fmtPct(scenario?.roi_pct) },
    { label: 'TIR anual', value: fmtPct(scenario?.tir_anual_pct) },
    { label: 'Break-even', value: scenario?.break_even_meses ? `${scenario.break_even_meses} meses` : '—' },
    { label: 'Precio final', value: fmt(scenario?.precio_final) },
  ];

  return (
    <div
      data-testid={`scenario-card-${tier}`}
      style={{
        border: `1.5px solid ${expanded ? colors.accent : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14,
        background: expanded ? colors.bg : 'rgba(13,16,23,0.85)',
        padding: '18px 20px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        flex: '1 1 220px',
        minWidth: 0,
      }}
      onClick={() => {
        setLocalExpanded(e => !e);
        onExpand && onExpand(tier);
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
          color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {colors.label}
        </span>
        {scenario?.dmx_score != null && (
          <ScoreBadge
            size="small"
            score={scenario.dmx_score}
            tier={scenario.dmx_tier}
            label={scenario.dmx_label}
            factors={scenario.dmx_factors}
          />
        )}
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: colors.accent,
        }} />
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px' }}>
        {kpis.map(k => (
          <div key={k.label}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {k.label}
            </div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Aprec rate */}
      <div style={{ marginTop: 12, fontSize: 11, fontFamily: 'DM Sans', color: 'var(--cream-3)' }}>
        Apreciación anual: <strong style={{ color: colors.accent }}>{fmtPct(scenario?.aprec_anual_pct)}</strong>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 6px', fontSize: 12 }}>
            {[
              ['Enganche', fmt(scenario?.enganche)],
              ['Pago mensual hipoteca', fmt(scenario?.pago_mensual_hipoteca)],
              ['Renta mensual neta', fmt(scenario?.renta_mensual_neta)],
              ['Plusvalía absoluta', fmt(scenario?.plusvalia_abs)],
              ['Gastos de cierre', fmt(scenario?.gastos_cierre)],
              ['Inversión inicial', fmt(scenario?.inversion_inicial)],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ color: 'var(--cream-3)', fontSize: 10, marginBottom: 2 }}>{label}</div>
                <div style={{ color: 'var(--cream)', fontWeight: 600, fontSize: 13 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

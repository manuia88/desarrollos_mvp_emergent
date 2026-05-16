/**
 * W5.1 Sub-Chunk D — Explainability stacked bar chart.
 *
 * Recibe `explain` con `contributions: [{feature,label,pct,sign,...}]` y
 * renderiza una barra apilada horizontal + leyenda con porcentajes.
 *
 * Diseño: navy/cream + accent indigo/rose. rounded-full. Sin shadow-2xl.
 */
import React from 'react';

const PALETTE = ['#6366F1', '#EC4899', '#22D3EE', '#FBBF24', '#A78BFA', '#34D399', '#F87171', '#60A5FA'];

export default function ExplainabilityCard({ explain }) {
  if (!explain || !explain.available || !Array.isArray(explain.contributions) || explain.contributions.length === 0) {
    return null;
  }

  const items = explain.contributions.filter(c => (c.pct || 0) > 0.5);
  const totalPct = items.reduce((acc, c) => acc + (c.pct || 0), 0) || 1;
  const modelTag = explain.pricing_model === 'hedonic_regression' ? 'Modelo hedónico' : 'Modelo heurístico';

  return (
    <div
      data-testid="avm-explain-card"
      style={{
        padding: 20,
        borderRadius: 18,
        background: 'rgba(13,16,23,0.92)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.1)',
        marginTop: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Desglose de valor
          </div>
          <div style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, color: '#F0EBE0' }}>
            ¿Por qué este precio?
          </div>
        </div>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 9999,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.3)',
            color: '#a5b4fc',
            fontSize: 10,
            fontFamily: 'DM Sans',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {modelTag}
        </span>
      </div>

      {/* Stacked bar */}
      <div
        role="img"
        aria-label="Distribución porcentual de la contribución de cada variable al precio estimado"
        style={{
          display: 'flex',
          width: '100%',
          height: 18,
          borderRadius: 9999,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
          marginBottom: 14,
        }}
      >
        {items.map((c, i) => {
          const pct = (c.pct / totalPct) * 100;
          return (
            <div
              key={c.feature}
              title={`${c.label}: ${c.pct}%`}
              data-testid={`avm-explain-bar-${c.feature}`}
              style={{
                width: `${pct}%`,
                height: '100%',
                background: PALETTE[i % PALETTE.length],
                opacity: c.sign === 'negative' ? 0.55 : 1,
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10 }}>
        {items.map((c, i) => (
          <div
            key={c.feature}
            data-testid={`avm-explain-legend-${c.feature}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'DM Sans', fontSize: 12 }}
          >
            <span
              style={{
                width: 10, height: 10, borderRadius: 9999,
                background: PALETTE[i % PALETTE.length],
                opacity: c.sign === 'negative' ? 0.55 : 1,
                flexShrink: 0,
              }}
            />
            <span style={{ color: 'rgba(240,235,224,0.85)', flex: 1 }}>{c.label}</span>
            <span style={{ color: c.sign === 'negative' ? '#fca5a5' : '#a5b4fc', fontWeight: 700 }}>
              {c.sign === 'negative' ? '−' : ''}{c.pct}%
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, fontSize: 10.5, color: 'rgba(240,235,224,0.4)', fontStyle: 'italic' }}>
        Contribuciones relativas estimadas. No constituye avalúo profesional.
      </div>
    </div>
  );
}

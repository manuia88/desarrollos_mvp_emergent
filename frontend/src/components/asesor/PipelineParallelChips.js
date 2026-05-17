// W5.ASR.2 Parte 2 — Chips de estados paralelos para pipeline V2 (nurture + perdido)
// Renderiza badges ortogonales a la etapa lineal del lead.
import React from 'react';

const STYLE = {
  base: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 7px', borderRadius: 9999,
    fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  nurture: {
    background: 'rgba(99,102,241,0.10)',
    border: '1px solid rgba(99,102,241,0.32)',
    color: '#a5b4fc',
  },
  perdido: {
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.32)',
    color: '#fca5a5',
  },
};

const LABELS = {
  nurture: 'Nurture',
  perdido: 'Perdido',
};

export default function PipelineParallelChips({ parallelStates, leadId, compact = false }) {
  const states = Array.isArray(parallelStates) ? parallelStates : [];
  if (states.length === 0) return null;
  return (
    <div
      data-testid={leadId ? `pipeline-parallel-chips-${leadId}` : 'pipeline-parallel-chips'}
      style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {states.map(state => {
        const palette = STYLE[state] || STYLE.nurture;
        return (
          <span
            key={state}
            data-testid={`pipeline-chip-${state}${leadId ? `-${leadId}` : ''}`}
            title={`Estado paralelo: ${LABELS[state] || state}`}
            style={{
              ...STYLE.base, ...palette,
              padding: compact ? '1px 6px' : STYLE.base.padding,
              fontSize: compact ? 9 : STYLE.base.fontSize,
            }}>
            {LABELS[state] || state}
          </span>
        );
      })}
    </div>
  );
}

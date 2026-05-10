/**
 * W4.18.2B Sub-B — DemandGapToggle
 * Pill toggle para activar overlay heatmap demand-supply gap (auth T1+).
 */
import React from 'react';

export default function DemandGapToggle({ active, onToggle, disabled }) {
  return (
    <button
      data-testid="demand-gap-pill"
      onClick={onToggle}
      disabled={disabled}
      title={disabled ? 'Inicia sesión para ver Demand Gap' : 'Toggle Demand Gap heatmap'}
      style={{
        padding: '8px 14px', borderRadius: 9999, border: 'none',
        background: active ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'rgba(255,255,255,0.05)',
        borderColor: active ? 'transparent' : 'rgba(255,255,255,0.12)',
        borderStyle: 'solid', borderWidth: 1,
        color: active ? '#fff' : (disabled ? 'rgba(240,235,224,0.3)' : 'rgba(240,235,224,0.7)'),
        fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.02em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        justifyContent: 'flex-start', textAlign: 'left',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: active ? '#fff' : '#22c55e', flexShrink: 0,
      }} />
      <span style={{ flex: 1 }}>Demand Gap</span>
      {disabled && <span style={{ fontSize: 9, opacity: 0.7 }}>· auth</span>}
    </button>
  );
}

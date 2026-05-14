/**
 * W4.18.2A — LayerToggle
 * 5 pills rounded-full con live counts por capa.
 */
import React from 'react';

const LAYERS = [
  { key: 'devs',       label: 'Preventa',    color: 'var(--theme)', desc: 'proyectos' },
  { key: 'brokers',    label: 'Usada',       color: 'var(--theme-3)', desc: 'listings' },
  { key: 'catastro',   label: 'Catastro',    color: '#f59e0b', desc: 'zonas' },
  { key: 'zone_score', label: 'Zone Score',  color: '#22c55e', desc: 'zonas' },
  { key: 'risk',       label: 'Riesgo',      color: '#ef4444', desc: 'areas' },
];

export default function LayerToggle({ active, counts = {}, onToggle }) {
  return (
    <div data-testid="layer-toggle" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
        Capas
      </div>
      {LAYERS.map(layer => {
        const on = active.has(layer.key);
        const count = counts[layer.key];
        return (
          <button
            key={layer.key}
            data-testid={`layer-toggle-${layer.key}`}
            onClick={() => onToggle(layer.key)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 14px', borderRadius: '9999px',
              background: on ? `${layer.color}18` : 'rgba(255,255,255,0.04)',
              border: `1.5px solid ${on ? layer.color + '55' : 'rgba(255,255,255,0.1)'}`,
              cursor: 'pointer', transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: on ? layer.color : 'rgba(255,255,255,0.2)',
                transition: 'background 0.2s',
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: on ? 700 : 500,
                color: on ? '#F0EBE0' : 'rgba(240,235,224,0.5)',
              }}>
                {layer.label}
              </span>
            </div>
            {count != null && (
              <span style={{
                fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
                color: on ? layer.color : 'rgba(240,235,224,0.3)',
              }}>
                {count} {layer.desc}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

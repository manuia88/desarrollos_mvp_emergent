// W5.ASR.4 Parte 1 · CMAComparablesTable — tabla 10 rows con badge similarity.
import React from 'react';
import { Card } from '../advisor/primitives';

const fmtMXN = (n) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString('es-MX')}`;

const fmtPM2 = (n) => `$${Math.round(n).toLocaleString('es-MX')}`;

function simBadge(score) {
  // similarity_score ∈ (0, 1]. Bandas: ≥0.65 alta · 0.45-0.65 media · <0.45 baja
  if (score == null) return { bg: 'rgba(255,255,255,0.04)', bd: 'var(--border)', fg: 'var(--cream-3)', label: '—' };
  if (score >= 0.65) return { bg: 'rgba(34,197,94,0.12)', bd: 'rgba(34,197,94,0.32)', fg: '#86efac', label: 'Alta' };
  if (score >= 0.45) return { bg: 'rgba(245,158,11,0.12)', bd: 'rgba(245,158,11,0.32)', fg: '#fcd34d', label: 'Media' };
  return { bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.30)', fg: '#fca5a5', label: 'Baja' };
}

export default function CMAComparablesTable({ comparables = [], onRowHover, hoveredId }) {
  return (
    <Card data-testid="cma-comparables-table" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
          <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Proyecto', 'm²', 'Rec/Bañ', 'Precio', '$/m²', 'Distancia', 'Similaridad'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparables.length === 0 && (
              <tr>
                <td colSpan={7} style={{
                  padding: 28, textAlign: 'center',
                  color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12,
                }}>
                  Sin comparables encontrados para los inputs.
                </td>
              </tr>
            )}
            {comparables.map((c, idx) => {
              const rowId = `${c.dev_id}-${c.prototype_name || idx}`;
              const isHovered = hoveredId === rowId;
              const sim = simBadge(c.similarity_score);
              return (
                <tr
                  key={rowId}
                  data-testid={`cma-comp-row-${idx}`}
                  onMouseEnter={() => onRowHover?.(rowId)}
                  onMouseLeave={() => onRowHover?.(null)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: isHovered ? 'rgba(99,102,241,0.05)' : 'transparent',
                    transition: 'background 0.12s',
                  }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: 'var(--cream)' }}>{c.name}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)' }}>
                      {c.colonia_slug} {c.prototype_name ? `· ${c.prototype_name}` : ''}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace' }}>
                    {c.m2}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace' }}>
                    {c.recamaras}/{c.banos}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', color: 'var(--cream)', fontWeight: 600 }}>
                    {fmtMXN(c.price)}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', color: 'var(--cream-2)' }}>
                    {fmtPM2(c.price_per_m2)}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', color: 'var(--cream-3)' }}>
                    {c.distance_km == null ? '—' : `${c.distance_km} km`}
                  </td>
                  <td style={tdStyle}>
                    <span
                      data-testid={`cma-comp-sim-${idx}`}
                      style={{
                        padding: '3px 9px', borderRadius: 9999,
                        background: sim.bg, border: `1px solid ${sim.bd}`,
                        color: sim.fg, fontFamily: 'DM Mono, monospace',
                        fontSize: 10.5, fontWeight: 700,
                      }}>
                      {sim.label} · {c.similarity_score}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const thStyle = {
  textAlign: 'left',
  padding: '10px 14px',
  fontFamily: 'DM Sans',
  fontSize: 10.5,
  fontWeight: 500,
  color: 'var(--cream-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};
const tdStyle = {
  padding: '12px 14px',
  color: 'var(--cream-2)',
  verticalAlign: 'middle',
};

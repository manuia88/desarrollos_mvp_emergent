// W2.9 Phase Z.2 — N×N comparables similarity matrix (heatmap of cells)
import React, { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Z } from '../../styles/zIndex';

function cellColor(score) {
  if (score == null) return 'rgba(255,255,255,0.04)';
  // 0=red, 1=green, gradient via lerp
  const r = Math.round(239 + (74 - 239) * score);
  const g = Math.round(68 + (222 - 68) * score);
  const b = Math.round(68 + (128 - 68) * score);
  return `rgba(${r},${g},${b},${0.18 + score * 0.55})`;
}

function CompareDrawer({ a, b, onClose }) {
  if (!a || !b) return null;
  const ka = a.kpis || {};
  const kb = b.kpis || {};
  const rows = [
    ['Precio promedio (MXN)', ka.avg_price_mxn, kb.avg_price_mxn],
    ['Precio por m²', ka.avg_price_per_m2, kb.avg_price_per_m2],
    ['Unidades totales', ka.units_total, kb.units_total],
    ['Conversión', ka.conversion_rate, kb.conversion_rate],
  ];
  return (
    <div data-testid="intel-compare-drawer" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: Z.DRAWER, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 580, background: 'var(--navy)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
        padding: 22, backdropFilter: 'blur(18px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17,
              color: 'var(--cream)', margin: 0 }}>Comparativa</h3>
            <p style={{ fontFamily: 'DM Sans', fontSize: 12,
              color: 'rgba(240,235,224,0.55)', margin: '3px 0 0' }}>
              {a.name} ↔ {b.name}
            </p>
          </div>
          <button data-testid="intel-compare-close" onClick={onClose} style={{
            background: 'transparent', border: 'none',
            color: 'rgba(240,235,224,0.6)', cursor: 'pointer',
          }}><X size={16} /></button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse',
          fontFamily: 'DM Sans', fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: 'rgba(240,235,224,0.55)' }}>
              <th style={{ textAlign: 'left', padding: 6, fontWeight: 600 }}>KPI</th>
              <th style={{ textAlign: 'right', padding: 6, fontWeight: 600 }}>{a.name}</th>
              <th style={{ textAlign: 'right', padding: 6, fontWeight: 600 }}>{b.name}</th>
              <th style={{ textAlign: 'right', padding: 6, fontWeight: 600 }}>Δ%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, va, vb]) => {
              let delta = null;
              if (typeof va === 'number' && typeof vb === 'number' && va > 0) {
                delta = Math.round(((vb - va) / va) * 100);
              }
              return (
                <tr key={label} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: 8, color: 'var(--cream)' }}>{label}</td>
                  <td style={{ padding: 8, textAlign: 'right',
                    fontFamily: 'DM Mono, monospace', color: 'rgba(240,235,224,0.85)' }}>
                    {va ?? '—'}
                  </td>
                  <td style={{ padding: 8, textAlign: 'right',
                    fontFamily: 'DM Mono, monospace', color: 'rgba(240,235,224,0.85)' }}>
                    {vb ?? '—'}
                  </td>
                  <td style={{ padding: 8, textAlign: 'right',
                    fontFamily: 'DM Mono, monospace',
                    color: delta == null ? 'rgba(240,235,224,0.4)'
                          : delta >= 0 ? '#4ADE80' : '#F87171' }}>
                    {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ComparablesMatrix({ data, loading }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const zones = (data && data.zones) || [];
  const matrix = (data && data.matrix) || [];

  return (
    <div data-testid="intel-comparables-matrix" style={{
      borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)',
      background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(12px)',
      overflow: 'hidden', marginTop: 18,
    }}>
      <button data-testid="intel-comparables-toggle" onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', padding: '12px 16px', background: 'transparent',
          border: 'none', color: 'var(--cream)',
          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
        }}>
        <span>Matriz de comparables · {zones.length} zonas</span>
        <ChevronDown size={14} style={{
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 180ms', opacity: 0.55,
        }} />
      </button>

      {open && (
        <div style={{ padding: 14, overflowX: 'auto' }}>
          {loading && (
            <div data-testid="intel-comparables-loading" style={{
              padding: 18, fontFamily: 'DM Sans', fontSize: 12.5,
              color: 'rgba(240, 235, 224, 0.70)',
            }}>Cargando matriz…</div>
          )}
          {!loading && zones.length === 0 && (
            <div data-testid="intel-comparables-empty" style={{
              padding: 18, fontFamily: 'DM Sans', fontSize: 12.5,
              color: 'rgba(240, 235, 224, 0.70)',
            }}>Selecciona una zona para ver comparables.</div>
          )}
          {!loading && zones.length > 0 && (
            <table style={{ borderCollapse: 'collapse',
              fontFamily: 'DM Mono, monospace', fontSize: 10.5 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }} />
                  {zones.map((z) => (
                    <th key={z.zone_id} style={{
                      padding: '6px 10px',
                      color: 'rgba(240,235,224,0.55)',
                      transform: 'rotate(-25deg)',
                      transformOrigin: 'left bottom',
                      whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 600,
                    }}>{z.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.map((rowZ, i) => (
                  <tr key={rowZ.zone_id}>
                    <td style={{
                      padding: '6px 10px', color: 'var(--cream)',
                      fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5,
                      whiteSpace: 'nowrap',
                    }}>{rowZ.name}</td>
                    {zones.map((colZ, j) => {
                      const v = matrix[i] && matrix[i][j];
                      return (
                        <td key={colZ.zone_id}
                          data-testid={`intel-matrix-cell-${i}-${j}`}
                          onClick={() => {
                            if (i === j) return;
                            setSelected({ a: rowZ, b: colZ });
                          }}
                          title={v != null ? `${rowZ.name} ↔ ${colZ.name}: ${(v * 100).toFixed(1)}% similitud` : 'No comparable'}
                          style={{
                            padding: '8px 12px', textAlign: 'center',
                            background: cellColor(v),
                            color: i === j ? 'rgba(240,235,224,0.25)' : '#fff',
                            cursor: i === j ? 'default' : 'pointer',
                            border: '1px solid rgba(0,0,0,0.20)',
                            fontWeight: 600,
                          }}>
                          {v == null ? '—' : (v * 100).toFixed(0)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && zones.length > 0 && (
            <div style={{ marginTop: 10, fontFamily: 'DM Sans', fontSize: 11,
              color: 'rgba(240, 235, 224, 0.70)' }}>
              Score 0 (rojo) = nulo · 100 (verde) = idéntico · click celda para comparar
            </div>
          )}
        </div>
      )}

      {selected && (
        <CompareDrawer a={selected.a} b={selected.b}
          onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

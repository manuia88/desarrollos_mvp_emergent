// W2.7 Phase Z.0 — Validation Metrics Table (R²/RMSE/MAPE per modelo)
import React, { useState } from 'react';
import { Info } from 'lucide-react';

const MODEL_LABEL = {
  cube_avg_price: 'Precio promedio por colonia',
  metrics_cube_kpis: 'Consistencia diaria del cubo',
  drpi_hedonic: 'DRPI Hedónico',
  risk_score: 'Score de riesgo zonal',
  construction_cost: 'Costo de construcción',
};

const HELP = {
  r_squared: 'Coeficiente de determinación. 1.0 = predicción perfecta. >0.7 razonable.',
  rmse: 'Raíz del error cuadrático medio (en unidades del target). Más bajo = mejor.',
  mape: 'Error porcentual absoluto medio. <10% excelente, 10-20% bueno, >50% débil.',
};

function fmtRel(iso) {
  if (!iso) return 'sin validar';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return 'hace un momento';
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

function r2Color(r2) {
  if (r2 == null) return 'rgba(240,235,224,0.30)';
  if (r2 < 0.5) return '#F87171';
  if (r2 < 0.7) return '#FACC15';
  return '#4ADE80';
}

function HeaderCell({ label, hint }) {
  const [show, setShow] = useState(false);
  return (
    <th style={{
      padding: '10px 12px', textAlign: 'right',
      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5,
      color: 'rgba(240,235,224,0.55)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      position: 'relative', whiteSpace: 'nowrap', cursor: 'help',
    }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        <Info size={9} style={{ opacity: 0.55 }} />
      </span>
      {show && hint && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          padding: '8px 11px', borderRadius: 8,
          background: 'rgba(13,17,28,0.97)',
          border: '1px solid rgba(var(--theme-rgb),0.40)',
          color: 'rgba(240,235,224,0.85)',
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 500,
          textTransform: 'none', letterSpacing: 'normal',
          width: 240, textAlign: 'left', zIndex: 10,
          backdropFilter: 'blur(20px)',
        }}>{hint}</div>
      )}
    </th>
  );
}

export default function ValidationMetricsTable({ items, avgR2 }) {
  if (!items || items.length === 0) {
    return (
      <div data-testid="validation-empty" style={{
        padding: 30, textAlign: 'center', borderRadius: 14,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.07)',
        fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240, 235, 224, 0.70)',
      }}>Sin validaciones todavía.</div>
    );
  }
  const sorted = [...items].sort((a, b) =>
    (b.r_squared || -1) - (a.r_squared || -1));

  return (
    <div data-testid="validation-metrics-table">
      {avgR2 != null && (
        <div style={{
          marginBottom: 10, padding: '10px 14px', borderRadius: 12,
          background: 'rgba(var(--theme-rgb),0.06)',
          border: '1px solid rgba(var(--theme-rgb),0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
            color: 'rgba(240,235,224,0.65)',
            textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>R² promedio</span>
          <span style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
            color: r2Color(avgR2),
          }}>{avgR2.toFixed(3)}</span>
        </div>
      )}
      <div style={{
        borderRadius: 14, overflow: 'hidden',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={{
                  padding: '10px 12px', textAlign: 'left',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5,
                  color: 'rgba(240,235,224,0.55)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                }}>Modelo</th>
                <HeaderCell label="R²" hint={HELP.r_squared} />
                <HeaderCell label="RMSE" hint={HELP.rmse} />
                <HeaderCell label="MAPE" hint={HELP.mape} />
                <th style={{
                  padding: '10px 12px', textAlign: 'right',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5,
                  color: 'rgba(240,235,224,0.55)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  whiteSpace: 'nowrap',
                }}>n</th>
                <th style={{
                  padding: '10px 12px', textAlign: 'right',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5,
                  color: 'rgba(240,235,224,0.55)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  whiteSpace: 'nowrap',
                }}>Validado</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(m => (
                <tr key={m.model_name} data-testid={`validation-row-${m.model_name}`}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{
                    padding: '10px 12px', fontFamily: 'DM Sans', fontSize: 12.5,
                    color: 'var(--cream)', fontWeight: 600,
                  }}>
                    <div>{MODEL_LABEL[m.model_name] || m.model_name}</div>
                    <div style={{
                      fontFamily: 'DM Mono, monospace', fontSize: 10,
                      color: 'rgba(240, 235, 224, 0.68)', fontWeight: 400,
                    }}>{m.model_name}</div>
                  </td>
                  <td style={{
                    padding: '10px 12px', textAlign: 'right',
                    fontFamily: 'DM Mono, monospace', fontSize: 13.5,
                    color: r2Color(m.r_squared), fontWeight: 700,
                  }}>{m.r_squared != null ? m.r_squared.toFixed(3) : '—'}</td>
                  <td style={{
                    padding: '10px 12px', textAlign: 'right',
                    fontFamily: 'DM Mono, monospace', fontSize: 12,
                    color: 'rgba(240,235,224,0.75)',
                  }}>{m.rmse != null ? m.rmse.toFixed(2) : '—'}</td>
                  <td style={{
                    padding: '10px 12px', textAlign: 'right',
                    fontFamily: 'DM Mono, monospace', fontSize: 12,
                    color: 'rgba(240,235,224,0.75)',
                  }}>{m.mape != null ? `${m.mape.toFixed(1)}%` : '—'}</td>
                  <td style={{
                    padding: '10px 12px', textAlign: 'right',
                    fontFamily: 'DM Mono, monospace', fontSize: 12,
                    color: 'rgba(240,235,224,0.55)',
                  }}>{m.sample_size || 0}</td>
                  <td style={{
                    padding: '10px 12px', textAlign: 'right',
                    fontFamily: 'DM Mono, monospace', fontSize: 11,
                    color: 'rgba(240,235,224,0.55)',
                    whiteSpace: 'nowrap',
                  }}>{fmtRel(m.run_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

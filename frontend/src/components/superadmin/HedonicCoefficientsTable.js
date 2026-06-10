// W3.3 ZZ.3 — HedonicCoefficientsTable
// Drawer table showing OLS coefficients with CI95% per variable
import React from 'react';

function fmt(v, dec = 4) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(dec);
}

const FRIENDLY = {
  intercept: 'Intercepto',
  m2: 'Superficie (m²)',
  recamaras: 'Recámaras',
  baños: 'Baños',
  year_built: 'Año construcción',
  floor: 'Piso',
  proximity_metro_m: 'Proximidad metro (m)',
  denue_density: 'Densidad Comercial',
  construction_cost_index: 'Índice costo construcción',
};

export default function HedonicCoefficientsTable({ model }) {
  if (!model) return null;
  if (!model.available) {
    return (
      <div data-testid="hedonic-unavailable" style={{
        padding: 16, borderRadius: 12,
        background: 'rgba(245,158,11,0.10)',
        border: '1px solid rgba(245,158,11,0.32)',
        color: '#fcd34d', fontFamily: 'DM Sans', fontSize: 13,
      }}>
        Modelo no disponible: {model.reason || 'sin datos'} · muestra={model.sample_size ?? 0}
      </div>
    );
  }
  const coefs = model.coefficients || {};
  const rows = Object.entries(coefs);

  return (
    <div data-testid="hedonic-coefficients-table">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
        <Pill label="R²"   value={fmt(model.r_squared, 3)} />
        <Pill label="R² ajustado" value={fmt(model.adj_r_squared, 3)} />
        <Pill label="F-stat" value={fmt(model.f_statistic, 2)} />
        <Pill label="RMSE" value={fmt(model.rmse, 3)} />
        <Pill label="Muestra" value={String(model.sample_size ?? 0)} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <Th>Variable</Th>
              <Th>β coef</Th>
              <Th>Std. err</Th>
              <Th>p-value</Th>
              <Th>IC 95%</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, c]) => (
              <tr key={name} data-testid={`hedonic-row-${name}`}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <Td><span style={{ color: 'var(--cream)' }}>{FRIENDLY[name] || name}</span></Td>
                <Td>{fmt(c.coef, 4)}</Td>
                <Td>{fmt(c.std_err, 4)}</Td>
                <Td>
                  <span style={{
                    color: (c.p_value ?? 1) < 0.05 ? '#86efac' : 'var(--cream-3)',
                  }}>{fmt(c.p_value, 4)}</span>
                </Td>
                <Td>[{fmt(c.ci_low, 3)} · {fmt(c.ci_high, 3)}]</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pill({ label, value }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 9999,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.10)',
      fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)',
    }}>
      <span style={{ color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 6 }}>{label}</span>
      <span style={{ color: 'var(--cream)', fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function Th({ children }) {
  return (
    <th style={{
      textAlign: 'left', padding: '10px 8px',
      fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
      color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>{children}</th>
  );
}
function Td({ children }) {
  return (
    <td style={{
      padding: '8px 8px',
      fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)',
    }}>{children}</td>
  );
}

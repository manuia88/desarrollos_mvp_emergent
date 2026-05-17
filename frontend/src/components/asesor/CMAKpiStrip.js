// W5.ASR.4 Parte 1 · CMAKpiStrip — 5 KPI cards (responsive row → mobile stack).
import React from 'react';
import { Card } from '../advisor/primitives';

const fmtMXN = (n) => '$' + Math.round(n).toLocaleString('es-MX');
const fmtMXNCompact = (n) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : fmtMXN(n);

const CONFIDENCE_COLOR = {
  alta: '#86efac',
  media: '#fcd34d',
  baja: '#fca5a5',
};

const TREND_PALETTE = {
  positive: { bg: 'rgba(34,197,94,0.10)', bd: 'rgba(34,197,94,0.32)', fg: '#86efac', label: 'Al alza' },
  negative: { bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.32)', fg: '#fca5a5', label: 'A la baja' },
  flat:     { bg: 'rgba(255,255,255,0.04)', bd: 'var(--border)', fg: 'var(--cream-2)', label: 'Estable' },
};

export default function CMAKpiStrip({ cma }) {
  if (!cma) return null;

  const value = cma.estimated_value || 0;
  const low = cma.estimated_range_low || 0;
  const high = cma.estimated_range_high || 0;
  const conf = cma.confidence || 'media';
  const fc12 = cma.forecast_12m_pct;
  const fc24 = cma.forecast_24m_pct;
  const trend = cma.drpi_trend?.label || 'flat';
  const trendPalette = TREND_PALETTE[trend] || TREND_PALETTE.flat;

  return (
    <div
      data-testid="cma-kpi-strip"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 18,
      }}>
      {/* Valor estimado */}
      <Card data-testid="cma-kpi-value" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={kpiLabelStyle}>Valor estimado</div>
        <div style={kpiValueStyle}>{fmtMXNCompact(value)}</div>
        <div style={kpiSubStyle}>{fmtMXN(value)} MXN</div>
      </Card>

      {/* Rango */}
      <Card data-testid="cma-kpi-range" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={kpiLabelStyle}>Rango de valor</div>
        <div style={{ ...kpiValueStyle, fontSize: 18 }}>
          {fmtMXNCompact(low)} – {fmtMXNCompact(high)}
        </div>
        <div style={kpiSubStyle}>
          {cma.estimated_price_per_m2
            ? `${fmtMXN(cma.estimated_price_per_m2)} / m²`
            : '—'}
        </div>
      </Card>

      {/* Confianza */}
      <Card data-testid="cma-kpi-confidence" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={kpiLabelStyle}>Confianza</div>
        <div style={{ ...kpiValueStyle, color: CONFIDENCE_COLOR[conf] || 'var(--cream)', textTransform: 'capitalize' }}>
          {conf}
        </div>
        <div style={kpiSubStyle}>{cma.pricing_model || 'heuristic'}</div>
      </Card>

      {/* Forecast 12m */}
      <Card data-testid="cma-kpi-forecast" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={kpiLabelStyle}>Proyección 12 meses</div>
        <div style={{
          ...kpiValueStyle,
          color: fc12 == null ? 'var(--cream)' : fc12 >= 0 ? '#86efac' : '#fca5a5',
        }}>
          {fc12 == null ? '—' : `${fc12 >= 0 ? '+' : ''}${fc12.toFixed(1)}%`}
        </div>
        <div style={kpiSubStyle}>
          {fc24 == null ? '24m: —' : `24m: ${fc24 >= 0 ? '+' : ''}${fc24.toFixed(1)}%`}
        </div>
      </Card>

      {/* DRPI trend */}
      <Card data-testid="cma-kpi-drpi" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={kpiLabelStyle}>Tendencia DRPI</div>
        <span
          data-testid={`cma-kpi-drpi-badge-${trend}`}
          style={{
            display: 'inline-flex', alignSelf: 'flex-start',
            padding: '4px 10px', borderRadius: 9999,
            background: trendPalette.bg, border: `1px solid ${trendPalette.bd}`,
            color: trendPalette.fg,
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
          }}>
          {trendPalette.label}
        </span>
        <div style={kpiSubStyle}>
          {cma.drpi_trend?.samples
            ? `${cma.drpi_trend.samples} meses · slope ${cma.drpi_trend.slope}`
            : 'sin histórico'}
        </div>
      </Card>
    </div>
  );
}

const kpiLabelStyle = {
  fontFamily: 'DM Sans',
  fontSize: 11,
  color: 'var(--cream-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};
const kpiValueStyle = {
  fontFamily: 'Outfit',
  fontWeight: 800,
  fontSize: 22,
  letterSpacing: '-0.02em',
  color: 'var(--cream)',
};
const kpiSubStyle = {
  fontFamily: 'DM Sans',
  fontSize: 11,
  color: 'var(--cream-3)',
};

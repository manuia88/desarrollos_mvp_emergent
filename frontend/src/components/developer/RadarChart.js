/**
 * RadarChart — minimal SVG radar (zero deps) for sub_scores 0-100.
 * Phase 4 Batch 7 (Site Selection sub-scores breakdown).
 */
import React from 'react';

const SUB_LABELS = {
  market_demand: 'Demanda',
  price_match: 'Precio',
  competition: 'Competencia',
  infrastructure: 'Infra.',
  absorption_potential: 'Absorción',
  risk_factors: 'Riesgo',
};

export default function RadarChart({ data = {}, size = 220, color = '#EC4899' }) {
  const keys = Object.keys(SUB_LABELS).filter(k => data[k] !== undefined);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 28;
  const total = keys.length;

  const pointFor = (i, val) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    const rr = (Math.max(0, Math.min(100, val)) / 100) * r;
    return [cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr];
  };
  const labelFor = (i) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    return [cx + Math.cos(angle) * (r + 14), cy + Math.sin(angle) * (r + 14)];
  };

  const polygon = keys.map((k, i) => pointFor(i, data[k] || 0)).map(p => p.join(',')).join(' ');
  const grids = [25, 50, 75, 100].map((pct) => {
    const pts = keys.map((_k, i) => {
      const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
      const rr = (pct / 100) * r;
      return [cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr].join(',');
    }).join(' ');
    return { pct, pts };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} data-testid="radar-chart">
      {/* Grid */}
      {grids.map((g) => (
        <polygon key={g.pct} points={g.pts} fill="none" stroke="rgba(240,235,224,0.12)" strokeWidth="1" />
      ))}
      {/* Axes */}
      {keys.map((_k, i) => {
        const [x, y] = pointFor(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(240,235,224,0.10)" strokeWidth="1" />;
      })}
      {/* Polygon (data) */}
      <polygon points={polygon} fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.6" />
      {/* Vertices */}
      {keys.map((k, i) => {
        const [x, y] = pointFor(i, data[k] || 0);
        return <circle key={k} cx={x} cy={y} r="3" fill={color} />;
      })}
      {/* Labels */}
      {keys.map((k, i) => {
        const [x, y] = labelFor(i);
        return (
          <text key={`label-${k}`} x={x} y={y} fontFamily="DM Sans" fontSize="10" fill="rgba(240,235,224,0.72)"
                textAnchor="middle" dominantBaseline="middle">{SUB_LABELS[k]}</text>
        );
      })}
      {/* Centre score (feasibility implied) */}
    </svg>
  );
}

// Phase 4 Batch 2 — Lightweight inline-SVG chart primitives.
// Zero dependencies. Tuned for navy/cream design system.
import React from 'react';

const CSS_VAR = (name, fallback) => `var(${name}, ${fallback})`;
const CREAM = CSS_VAR('--cream', '#F0EBE0');
const CREAM_2 = CSS_VAR('--cream-2', '#D5CFC2');
const CREAM_3 = CSS_VAR('--cream-3', '#8F897A');
const BORDER = CSS_VAR('--border', 'rgba(240,235,224,0.08)');

// ────────────────────────────────────────────────────────────────────────────
// Sparkline: accepts an array of numbers + optional area fill
// ────────────────────────────────────────────────────────────────────────────
export function Sparkline({ values = [], width = 160, height = 44, color = '#EC4899', fill = true, strokeWidth = 1.6 }) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((v, i) => [i * step, height - ((v - min) / range) * (height - 4) - 2]);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {fill && <path d={areaPath} fill={color} opacity={0.14} />}
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {points.slice(-1).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.4} fill={color} />
      ))}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// LineChart: multi-series line chart with Y-axis labels
// series = [{ name, color, values: [{x, y}] }]
// ────────────────────────────────────────────────────────────────────────────
export function LineChart({
  series = [], width = 560, height = 220, xLabels = [],
  yAxisLabel = '', showDots = true, yFormatter = (v) => v,
}) {
  if (!series.length || !series[0].values.length) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: CREAM_3, fontFamily: 'DM Sans', fontSize: 12 }}>
        Sin datos para graficar.
      </div>
    );
  }
  const padL = 42, padR = 12, padT = 12, padB = 28;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const allY = series.flatMap(s => s.values.map(v => v.y));
  const minY = Math.min(...allY, 0);
  const maxY = Math.max(...allY, 1);
  const rangeY = maxY - minY || 1;
  const n = series[0].values.length;
  const step = w / Math.max(1, n - 1);

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => minY + (rangeY * i) / yTicks);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', maxWidth: '100%' }}>
      {/* Y grid */}
      {ticks.map((t, i) => {
        const y = padT + h - ((t - minY) / rangeY) * h;
        return (
          <g key={i}>
            <line x1={padL} x2={padL + w} y1={y} y2={y} stroke={BORDER} strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={10} fill={CREAM_3} fontFamily="DM Mono, monospace">
              {yFormatter(Math.round(t))}
            </text>
          </g>
        );
      })}
      {/* Axis labels */}
      {xLabels.map((lb, i) => (
        <text
          key={i} x={padL + i * step} y={height - 8}
          textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
          fontSize={10} fill={CREAM_3} fontFamily="DM Mono, monospace"
        >
          {lb}
        </text>
      ))}
      {/* Series paths */}
      {series.map((s, sidx) => {
        const pts = s.values.map((v, i) => [padL + i * step, padT + h - ((v.y - minY) / rangeY) * h]);
        const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
        return (
          <g key={sidx}>
            <path d={path} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            {showDots && pts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={2.4} fill={s.color} />
            ))}
          </g>
        );
      })}
      {yAxisLabel && (
        <text x={6} y={padT + 4} fontSize={10} fill={CREAM_3} fontFamily="DM Sans">{yAxisLabel}</text>
      )}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// BarHStack: horizontal stacked bars (for win/loss reasons)
// items = [{label, value, color}]
// ────────────────────────────────────────────────────────────────────────────
export function BarList({ items = [], maxWidth = 300, format = (v) => v }) {
  const max = Math.max(1, ...items.map(it => it.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth }}>
      {items.map((it, i) => {
        const pct = (it.value / max) * 100;
        return (
          <div key={i} data-testid={`bar-${it.label}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: CREAM_2 }}>{it.label}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: CREAM_3 }}>{format(it.value)}</span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: it.color || '#EC4899',
                borderRadius: 999, transition: 'width 0.4s cubic-bezier(.5,0,.2,1)',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// HeatmapCalendar: GitHub contributions style
// cells = [{date, count, level (0-4)}]
// ────────────────────────────────────────────────────────────────────────────
export function HeatmapCalendar({ cells = [], cellSize = 11, gap = 2 }) {
  if (!cells.length) return null;
  // Group by weeks (7 rows)
  const weeks = [];
  let week = [];
  const firstDay = new Date(cells[0].date + 'T12:00:00Z').getUTCDay();
  // fill leading empties
  for (let i = 0; i < firstDay; i++) week.push(null);
  for (const c of cells) {
    week.push(c);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }

  const colors = ['rgba(255,255,255,0.04)', 'rgba(236,72,153,0.18)', 'rgba(236,72,153,0.38)', 'rgba(236,72,153,0.62)', 'rgba(236,72,153,0.95)'];
  const width = weeks.length * (cellSize + gap);
  const height = 7 * (cellSize + gap);
  return (
    <div style={{ overflowX: 'auto', padding: '4px 0' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {weeks.map((w, wi) => w.map((d, di) => {
          if (!d) return null;
          return (
            <rect
              key={`${wi}-${di}`}
              x={wi * (cellSize + gap)} y={di * (cellSize + gap)}
              width={cellSize} height={cellSize}
              rx={2} fill={colors[d.level]}
              data-testid={`heat-${d.date}`}
            >
              <title>{`${d.date} · ${d.count} venta${d.count === 1 ? '' : 's'}`}</title>
            </rect>
          );
        }))}
      </svg>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// FunnelChart: trapezoidal funnel SVG
// steps = [{label, count, dropoff_pct}]
// ────────────────────────────────────────────────────────────────────────────
export function FunnelChart({ steps = [], width = 420, height = 260 }) {
  if (!steps.length) return null;
  const maxCount = steps[0].count || 1;
  const stepH = height / steps.length;
  const padX = 24;
  const COLORS = ['#EC4899', '#F472B6', '#FBCFE8', '#6366F1', '#A78BFA'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, alignItems: 'stretch' }} className="funnel-grid">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        {steps.map((s, i) => {
          const wTop = ((s.count / maxCount) * (width - padX * 2));
          const nextCount = steps[i + 1]?.count ?? s.count * 0.6;
          const wBot = ((nextCount / maxCount) * (width - padX * 2));
          const xTopL = (width - wTop) / 2, xTopR = xTopL + wTop;
          const xBotL = (width - wBot) / 2, xBotR = xBotL + wBot;
          const yTop = i * stepH, yBot = (i + 1) * stepH - 2;
          const d = `M ${xTopL} ${yTop} L ${xTopR} ${yTop} L ${xBotR} ${yBot} L ${xBotL} ${yBot} Z`;
          return (
            <g key={i}>
              <path d={d} fill={COLORS[i % COLORS.length]} opacity={0.85} />
              <text x={width / 2} y={yTop + stepH / 2 + 4} textAnchor="middle"
                    fontFamily="Outfit" fontWeight={700} fontSize={13} fill="#06080F">
                {s.count.toLocaleString()}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '4px 0' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ fontFamily: 'DM Sans', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12.5, color: CREAM }}>{s.label}</span>
            <span style={{ fontSize: 10.5, color: CREAM_3, fontFamily: 'DM Mono, monospace' }}>
              {i > 0 ? `${s.conversion_from_prev}% del paso previo · drop ${s.dropoff_pct}%` : 'Entrada del funnel'}
            </span>
          </div>
        ))}
      </div>
      <style>{`
        @media (max-width: 720px) { .funnel-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CohortMatrix: month-captacion × month-cierre with gradient cells
// ────────────────────────────────────────────────────────────────────────────
export function CohortMatrix({ months = [], cohort = [] }) {
  if (!cohort.length) return null;
  const allCounts = cohort.flatMap(row => Object.values(row.closes || {}));
  const maxCount = Math.max(1, ...allCounts);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontFamily: 'DM Mono, monospace', fontSize: 10.5 }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 8px', color: CREAM_3, fontWeight: 500, textAlign: 'left' }}>Captación \ Cierre</th>
            {months.map(m => <th key={m} style={{ padding: '6px 4px', color: CREAM_3, fontWeight: 500 }}>{m.slice(5)}</th>)}
          </tr>
        </thead>
        <tbody>
          {cohort.map((row, ri) => (
            <tr key={ri}>
              <td style={{ padding: '4px 8px', color: CREAM_2, whiteSpace: 'nowrap' }}>{row.captacion_month.slice(5)}</td>
              {months.map(m => {
                const v = row.closes?.[m];
                const intensity = v != null ? v / maxCount : 0;
                const bg = v == null
                  ? 'transparent'
                  : `rgba(236,72,153,${0.08 + intensity * 0.65})`;
                return (
                  <td key={m} style={{
                    padding: '4px 0', width: 34, height: 24, textAlign: 'center',
                    background: bg,
                    borderRadius: 4,
                    color: v == null ? CREAM_3 : intensity > 0.4 ? '#fff' : CREAM_2,
                    fontWeight: 600,
                  }} data-testid={`cohort-${row.captacion_month}-${m}`}>
                    {v == null ? '·' : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

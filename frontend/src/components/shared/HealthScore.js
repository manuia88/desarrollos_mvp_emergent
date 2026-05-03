/**
 * Phase 4 B0 Sub-chunk B — HealthScore
 * Circular SVG progress ring with breakdown popover.
 * Props:
 *   score       — 0-100
 *   size        — 'sm' | 'md' | 'lg' (default md = 64px outer)
 *   breakdown   — [{label, weight, score, status}]
 *   variant     — 'project' | 'asesor' | 'client'
 *   className   — string
 */
import React, { useState, useRef, useEffect } from 'react';

const SIZE_MAP = {
  sm: { outer: 48,  r: 18, stroke: 3.5, numSize: 12 },
  md: { outer: 64,  r: 24, stroke: 4,   numSize: 16 },
  lg: { outer: 88,  r: 33, stroke: 5.5, numSize: 22 },
};

const STATUS_COLORS = {
  green:   '#4ade80',
  amber:   '#fbbf24',
  red:     '#f87171',
  neutral: 'rgba(240,235,224,0.3)',
};

function scoreColor(score) {
  if (score >= 80) return '#4ade80';
  if (score >= 50) return '#fbbf24';
  return '#f87171';
}

const VARIANT_LABELS = {
  project: { prefix: 'Proyecto' },
  asesor:  { prefix: 'Asesor' },
  client:  { prefix: 'Cliente' },
};

export function HealthScore({
  score = 0,
  size = 'md',
  breakdown = [],
  variant = 'project',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cfg = SIZE_MAP[size] || SIZE_MAP.md;
  const { outer, r, stroke, numSize } = cfg;
  const cx = outer / 2;
  const cy = outer / 2;
  const circ = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, score)) / 100) * circ;
  const gap = circ - filled;
  const color = scoreColor(score);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-flex flex-col items-center ${className}`} data-testid="health-score">
      {/* Ring + center */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Ver desglose de salud"
        className="relative hover:scale-105 transition-transform duration-200"
        data-testid="health-score-ring"
        aria-expanded={open}
      >
        <svg width={outer} height={outer} className="-rotate-90" aria-hidden="true">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(240,235,224,0.08)" strokeWidth={stroke} />
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${gap}`}
            style={{ transition: 'stroke-dasharray 0.7s ease, stroke 0.4s ease' }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center leading-none"
        >
          <span className="font-bold tabular-nums" style={{ fontSize: numSize, color, lineHeight: 1.1 }}>
            {Math.round(score)}
          </span>
          <span style={{ fontSize: numSize * 0.55, color: 'rgba(240,235,224,0.35)', lineHeight: 1 }}>/100</span>
        </div>
      </button>

      {/* Breakdown popover */}
      {open && (
        <div
          className="absolute top-full mt-2 z-50 w-[220px] rounded-xl bg-[rgba(13,16,23,0.92)] border border-[rgba(255,255,255,0.16)] backdrop-blur-[24px] p-3"
          data-testid="health-score-breakdown"
        >
          <p className="text-[rgba(240,235,224,0.4)] text-[10px] uppercase tracking-widest mb-2.5">
            {VARIANT_LABELS[variant]?.prefix || 'Desglose'}
          </p>
          {breakdown.length === 0 && (
            <p className="text-[rgba(240,235,224,0.35)] text-xs">Sin desglose disponible.</p>
          )}
          {breakdown.map((c, i) => (
            <div key={i} className="mb-2" data-testid={`health-component-${i}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[rgba(240,235,224,0.7)] text-xs">{c.label}</span>
                <div className="flex items-center gap-1.5">
                  {c.weight && (
                    <span className="text-[9px] text-[rgba(240,235,224,0.3)]">{Math.round(c.weight * 100)}%</span>
                  )}
                  <span
                    className="text-xs font-semibold"
                    style={{ color: STATUS_COLORS[c.status] || scoreColor(c.score) }}
                  >
                    {Math.round(c.score)}
                  </span>
                </div>
              </div>
              <div className="h-1 bg-[rgba(240,235,224,0.07)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, c.score))}%`,
                    backgroundColor: STATUS_COLORS[c.status] || scoreColor(c.score),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default HealthScore;

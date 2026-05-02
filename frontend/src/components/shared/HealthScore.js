/**
 * Phase 4 Batch 0 — HealthScore
 * Circular progress SVG with breakdown popover.
 * Props:
 *   score: 0-100
 *   components: [{ label, weight, value, max }]
 *   entity_type: 'project' | 'lead' | 'development'
 *   size: 'sm' | 'md' | 'lg'
 *   on_click_component: fn(component)
 */
import React, { useState } from 'react';

const SIZES = {
  sm: { r: 20, stroke: 4, fontSize: 11, outerSize: 52 },
  md: { r: 30, stroke: 5, fontSize: 16, outerSize: 76 },
  lg: { r: 44, stroke: 7, fontSize: 22, outerSize: 108 },
};

function scoreColor(score) {
  if (score >= 85) return '#4ade80'; // green
  if (score >= 60) return '#fbbf24'; // amber
  return '#f87171';                  // red
}

export function HealthScore({
  score = 0,
  components = [],
  entity_type = 'project',
  size = 'md',
  on_click_component,
  className = '',
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const cfg = SIZES[size] || SIZES.md;
  const { r, stroke, fontSize, outerSize } = cfg;
  const cx = outerSize / 2;
  const cy = outerSize / 2;
  const circumference = 2 * Math.PI * r;
  const filled = ((score || 0) / 100) * circumference;
  const gap = circumference - filled;
  const color = scoreColor(score || 0);

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`} data-testid="health-score">
      {/* SVG ring */}
      <button
        onClick={() => setShowBreakdown(o => !o)}
        title="Ver desglose"
        className="relative hover:opacity-80 transition-opacity"
        data-testid="health-score-ring"
      >
        <svg width={outerSize} height={outerSize} className="-rotate-90">
          {/* Track */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="rgba(240,235,224,0.08)"
            strokeWidth={stroke}
          />
          {/* Progress */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${gap}`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        {/* Center value */}
        <span
          className="absolute inset-0 flex items-center justify-center font-bold rotate-0"
          style={{ fontSize, color }}
        >
          {Math.round(score || 0)}
        </span>
      </button>

      {/* Breakdown popover */}
      {showBreakdown && components.length > 0 && (
        <div
          className="absolute top-full mt-2 z-50 min-w-[200px] rounded-xl bg-[#131722] border border-[rgba(240,235,224,0.12)] shadow-2xl p-3 space-y-2"
          data-testid="health-score-breakdown"
        >
          <p className="text-[rgba(240,235,224,0.4)] text-[10px] uppercase tracking-wide mb-2">Desglose</p>
          {components.map((c, i) => (
            <button
              key={i}
              onClick={() => on_click_component?.(c)}
              className={`w-full text-left space-y-1 p-1.5 rounded-lg transition-colors
                ${on_click_component ? 'hover:bg-[rgba(240,235,224,0.06)] cursor-pointer' : 'cursor-default'}`}
              data-testid={`health-component-${i}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[rgba(240,235,224,0.7)] text-xs">{c.label}</span>
                <span className="text-xs font-medium" style={{ color: scoreColor((c.value / (c.max || 100)) * 100) }}>
                  {c.value}/{c.max || 100}
                </span>
              </div>
              <div className="h-1.5 bg-[rgba(240,235,224,0.08)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (c.value / (c.max || 100)) * 100)}%`,
                    backgroundColor: scoreColor((c.value / (c.max || 100)) * 100),
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default HealthScore;

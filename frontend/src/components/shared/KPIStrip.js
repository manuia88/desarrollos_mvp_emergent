/**
 * Phase 4 Batch 0 — KPIStrip
 * Responsive row of KPI cards. Optional period filter.
 * Props: items=[{ label, value, trend?, subtext?, icon? }], period_filter?
 */
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

function TrendChip({ value, suffix = '%' }) {
  if (value === undefined || value === null) return null;
  const isUp = value > 0;
  const isDown = value < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full
        ${isUp ? 'bg-emerald-500/15 text-emerald-400'
          : isDown ? 'bg-red-500/15 text-red-400'
          : 'bg-[rgba(240,235,224,0.08)] text-[rgba(240,235,224,0.4)]'}`}
    >
      <Icon size={9} />
      {Math.abs(value)}{suffix}
    </span>
  );
}

export function KPIStrip({ items = [], period_filter, onPeriodChange, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`} data-testid="kpi-strip">
      {period_filter && (
        <div className="flex items-center gap-1">
          {['7d', '30d', '90d', 'YTD'].map(p => (
            <button
              key={p}
              onClick={() => onPeriodChange?.(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all
                ${period_filter === p
                  ? 'bg-[var(--cream)] text-[var(--navy)]'
                  : 'text-[rgba(240,235,224,0.45)] hover:text-[var(--cream)] hover:bg-[rgba(240,235,224,0.06)]'}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-xl bg-[#0f1320] border border-[rgba(240,235,224,0.08)] p-3 space-y-1"
            data-testid={`kpi-card-${i}`}
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[rgba(240,235,224,0.45)] text-[10px] uppercase tracking-wide truncate">
                {item.label}
              </p>
              {item.icon && <item.icon size={12} className="text-[rgba(240,235,224,0.25)] shrink-0" />}
            </div>
            <p className="text-[var(--cream)] text-xl font-bold leading-none">{item.value ?? '—'}</p>
            <div className="flex items-center gap-1.5 min-h-[16px]">
              {item.trend !== undefined && <TrendChip value={item.trend} suffix={item.trendSuffix || '%'} />}
              {item.subtext && (
                <span className="text-[rgba(240,235,224,0.3)] text-[10px] truncate">{item.subtext}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default KPIStrip;

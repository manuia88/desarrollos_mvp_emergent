/**
 * P1 · KpiCard — KPI con tendencia (no número desnudo).
 * Props:
 *   label: string · value: string|number (ya formateado) · trendPct: number|null
 *   Icon: lucide component · onClick?: fn · trendLabel: string ("vs semana pasada")
 */
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function KpiCard({ label, value, trendPct = null, Icon, onClick, trendLabel }) {
  const hasTrend = trendPct !== null && trendPct !== undefined && !Number.isNaN(trendPct);
  const up = hasTrend && trendPct > 0;
  const down = hasTrend && trendPct < 0;
  const TrendIcon = up ? TrendingUp : down ? TrendingDown : Minus;
  const trendColor = up ? 'text-[#86efac]' : down ? 'text-[#f9a8d4]' : 'text-[var(--cream-3)]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-testid={`kpi-card-${label}`}
      className={`text-left p-4 rounded-2xl bg-[rgba(240,235,224,0.04)] border border-[rgba(240,235,224,0.08)] transition-all
        ${onClick ? 'hover:border-[rgba(var(--theme-rgb),0.35)] hover:bg-[rgba(var(--theme-rgb),0.06)] cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-2 text-[var(--cream-3)]">
        {Icon && <Icon size={15} />}
        <span className="text-[11px] font-medium uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className="text-[var(--cream)] text-2xl font-bold mt-1.5 tracking-tight truncate">{value}</p>
      {hasTrend && (
        <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trendColor}`}>
          <TrendIcon size={13} />
          <span>{up ? '+' : ''}{trendPct}%</span>
          {trendLabel && <span className="text-[var(--cream-3)] font-normal">· {trendLabel}</span>}
        </div>
      )}
    </button>
  );
}

/**
 * Phase 4 Batch 0 — EntityCard
 * Reusable card with variants: project | asesor | client | search | lead | unit
 * Supports hero_image, health_score, primary_metrics, secondary_metrics, actions.
 */
import React from 'react';
import { Building2, User, UserCheck, Search, Briefcase, Home,
         TrendingUp, TrendingDown, Minus } from 'lucide-react';

const VARIANT_ICONS = {
  project: Building2,
  asesor: Briefcase,
  client: User,
  search: Search,
  lead: UserCheck,
  unit: Home,
};

const VARIANT_ACCENT = {
  project: 'rgba(240,235,224,0.08)',
  asesor:  'rgba(240,235,224,0.06)',
  client:  'rgba(240,235,224,0.06)',
  search:  'rgba(240,235,224,0.06)',
  lead:    'rgba(240,235,224,0.08)',
  unit:    'rgba(240,235,224,0.07)',
};

function Trend({ value }) {
  if (value === undefined || value === null) return null;
  const isUp = value > 0;
  const isDown = value < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color = isUp ? '#4ade80' : isDown ? '#f87171' : 'rgba(240,235,224,0.4)';
  return (
    <span className="flex items-center gap-0.5 text-xs" style={{ color }}>
      <Icon size={11} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function EntityCard({
  variant = 'project',
  hero_image,
  label,
  sublabel,
  health_score,
  primary_metrics = [],
  secondary_metrics = [],
  actions = [],
  onClick,
  className = '',
  'data-testid': testId,
}) {
  const Icon = VARIANT_ICONS[variant] || Building2;

  return (
    <div
      onClick={onClick}
      data-testid={testId || `entity-card-${variant}`}
      className={`rounded-2xl bg-[#0f1320] border border-[rgba(240,235,224,0.08)] overflow-hidden transition-all duration-200
        ${onClick ? 'cursor-pointer hover:border-[rgba(240,235,224,0.18)] hover:shadow-lg hover:-translate-y-0.5' : ''}
        ${className}`}
    >
      {/* Hero image */}
      {hero_image && (
        <div className="h-36 overflow-hidden bg-[rgba(240,235,224,0.04)]">
          <img src={hero_image} alt={label} className="w-full h-full object-cover" />
        </div>
      )}
      {!hero_image && (
        <div className="h-24 flex items-center justify-center" style={{ background: VARIANT_ACCENT[variant] }}>
          <Icon size={32} className="text-[rgba(240,235,224,0.2)]" />
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[var(--cream)] font-semibold text-sm truncate">{label}</h3>
            {sublabel && <p className="text-[rgba(240,235,224,0.45)] text-xs truncate mt-0.5">{sublabel}</p>}
          </div>
          {health_score !== undefined && health_score !== null && (
            <span
              className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full
                ${health_score >= 85 ? 'bg-emerald-500/20 text-emerald-400'
                  : health_score >= 60 ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-red-500/20 text-red-400'}`}
            >
              {health_score}
            </span>
          )}
        </div>

        {/* Primary metrics */}
        {primary_metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {primary_metrics.map((m, i) => (
              <div key={i} className="bg-[rgba(240,235,224,0.04)] rounded-lg p-2">
                <p className="text-[rgba(240,235,224,0.4)] text-[10px] uppercase tracking-wide truncate">{m.label}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[var(--cream)] text-sm font-semibold">{m.value}</span>
                  {m.trend !== undefined && <Trend value={m.trend} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Secondary metrics */}
        {secondary_metrics.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {secondary_metrics.map((m, i) => (
              <span key={i} className="text-[10px] text-[rgba(240,235,224,0.4)]">
                <span className="text-[rgba(240,235,224,0.65)]">{m.label}:</span> {m.value}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        {actions.length > 0 && (
          <div className="flex gap-2 pt-1 border-t border-[rgba(240,235,224,0.06)]">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); a.onClick?.(); }}
                data-testid={a.testId}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${a.primary
                    ? 'bg-[var(--cream)] text-[var(--navy)] hover:opacity-90'
                    : 'border border-[rgba(240,235,224,0.15)] text-[rgba(240,235,224,0.65)] hover:border-[rgba(240,235,224,0.3)] hover:text-[var(--cream)]'}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default EntityCard;

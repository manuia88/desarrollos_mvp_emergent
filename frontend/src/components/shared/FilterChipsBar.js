/**
 * Phase 4 Batch 0 — FilterChipsBar
 * Multi-select filter chips with counters. URL state sync optional.
 * Props:
 *   filters_config: [{ key, label, options: [{ value, label, count? }] }]
 *   current_state: { [key]: value | value[] }
 *   on_change: (key, value) => void
 *   sync_url: bool (default false)
 */
import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';

export function FilterChipsBar({
  filters_config = [],
  current_state = {},
  on_change,
  sync_url = false,
  className = '',
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Sync from URL on mount
  useEffect(() => {
    if (!sync_url) return;
    const updates = {};
    filters_config.forEach(fc => {
      const urlVal = searchParams.get(fc.key);
      if (urlVal && (!current_state[fc.key] || current_state[fc.key] !== urlVal)) {
        updates[fc.key] = urlVal;
      }
    });
    if (Object.keys(updates).length > 0) {
      Object.entries(updates).forEach(([k, v]) => on_change?.(k, v));
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (key, value) => {
    on_change?.(key, value);
    if (sync_url) {
      const next = new URLSearchParams(searchParams);
      if (value === null || value === undefined || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      setSearchParams(next, { replace: true });
    }
  };

  const clearAll = () => {
    filters_config.forEach(fc => handleChange(fc.key, null));
  };

  const activeCount = filters_config.filter(fc => {
    const v = current_state[fc.key];
    return v !== null && v !== undefined && v !== '';
  }).length;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} data-testid="filter-chips-bar">
      {filters_config.map(fc => {
        const active = current_state[fc.key];
        return (
          <div key={fc.key} className="flex items-center gap-1">
            {/* Filter group label */}
            <span className="text-[rgba(240,235,224,0.35)] text-xs shrink-0">{fc.label}:</span>
            {/* Option chips */}
            <div className="flex items-center gap-1 flex-wrap">
              {fc.options.map(opt => {
                const isActive = Array.isArray(active)
                  ? active.includes(opt.value)
                  : active === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleChange(fc.key, isActive ? null : opt.value)}
                    data-testid={`filter-chip-${fc.key}-${opt.value}`}
                    style={{
                      animation: isActive ? 'chipPop 220ms ease-out' : undefined,
                      transitionProperty: 'background-color, color, border-color, transform',
                      transitionDuration: '180ms',
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                      ${isActive
                        ? 'bg-[var(--cream)] text-[var(--navy)] scale-[1.02]'
                        : 'bg-[rgba(240,235,224,0.06)] text-[rgba(240,235,224,0.55)] border border-[rgba(240,235,224,0.1)] hover:border-[rgba(240,235,224,0.25)] hover:text-[var(--cream)]'}`}
                  >
                    {opt.label}
                    {opt.count !== undefined && (
                      <span className={`text-[9px] px-1 rounded-full ${isActive ? 'bg-[rgba(6,8,15,0.2)]' : 'bg-[rgba(240,235,224,0.1)]'}`}>
                        {opt.count}
                      </span>
                    )}
                    {isActive && (
                      <X size={9} className="ml-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {activeCount > 0 && (
        <button
          onClick={clearAll}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)] transition-colors"
          data-testid="filter-clear-all-btn"
        >
          <X size={10} />
          Limpiar ({activeCount})
        </button>
      )}
      <style>{`
        @keyframes chipPop {
          0%   { transform: translateY(2px); opacity: 0.4; }
          60%  { transform: translateY(-1px); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default FilterChipsBar;

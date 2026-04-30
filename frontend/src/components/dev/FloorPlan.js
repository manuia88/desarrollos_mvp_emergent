// FloorPlan — deterministic SVG floor plan per level, units colored by status
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const STATUS_COLORS = {
  disponible: { fill: 'rgba(34,197,94,0.55)', stroke: '#22C55E', label: 'var(--cream)' },
  reservado: { fill: 'rgba(245,158,11,0.55)', stroke: '#F59E0B', label: 'var(--cream)' },
  vendido: { fill: 'rgba(239,68,68,0.38)', stroke: '#EF4444', label: 'var(--cream-3)' },
};

function layoutForLevel(units) {
  // Deterministic grid: distribute units in rows by prototype order, wrap at 4 per row
  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(units.length))));
  const rows = Math.ceil(units.length / cols);
  const CELL = { w: 140, h: 90, gap: 6 };
  const PAD = 28;
  const width = PAD * 2 + cols * CELL.w + (cols - 1) * CELL.gap;
  const height = PAD * 2 + rows * CELL.h + (rows - 1) * CELL.gap;
  const boxes = units.map((u, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return {
      ...u,
      x: PAD + c * (CELL.w + CELL.gap),
      y: PAD + r * (CELL.h + CELL.gap),
      w: CELL.w,
      h: CELL.h,
    };
  });
  return { width, height, boxes, pad: PAD };
}

export default function FloorPlan({ units, selectedUnitId, onUnitClick, onUnitHover, canSeeDetails }) {
  const { t } = useTranslation();
  // Group units by level, ordered
  const byLevel = useMemo(() => {
    const m = new Map();
    for (const u of units) {
      if (!m.has(u.level)) m.set(u.level, []);
      m.get(u.level).push(u);
    }
    return new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
  }, [units]);

  const levels = [...byLevel.keys()];
  const [activeLevel, setActiveLevel] = useState(levels[0]);

  const currentUnits = byLevel.get(activeLevel) || [];
  const { width, height, boxes } = useMemo(() => layoutForLevel(currentUnits), [currentUnits]);

  const statusTally = currentUnits.reduce((a, u) => ({ ...a, [u.status]: (a[u.status] || 0) + 1 }), {});

  return (
    <div data-testid="floor-plan">
      {/* Level switcher */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {levels.map(lvl => {
          const active = lvl === activeLevel;
          return (
            <button
              key={lvl}
              data-testid={`floor-level-${lvl}`}
              onClick={() => setActiveLevel(lvl)}
              style={{
                padding: '7px 14px', borderRadius: 9999,
                background: active ? 'var(--grad)' : 'var(--bg-3)',
                border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                color: active ? '#fff' : 'var(--cream-2)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                cursor: 'pointer',
              }}>
              Nivel {lvl}
            </button>
          );
        })}
      </div>

      {/* Legend + tally */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, fontFamily: 'DM Sans', fontSize: 11.5 }}>
        {['disponible', 'reservado', 'vendido'].map(s => (
          <div key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: STATUS_COLORS[s].fill, border: `1px solid ${STATUS_COLORS[s].stroke}` }} />
            <span style={{ color: 'var(--cream-2)' }}>{t(`dev.status.${s}`)}</span>
            <span style={{ color: 'var(--cream-3)' }}>({statusTally[s] || 0})</span>
          </div>
        ))}
      </div>

      {/* SVG */}
      <div style={{ position: 'relative', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 16, padding: 8 }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* Outer wall */}
          <rect x={12} y={12} width={width - 24} height={height - 24} fill="none" stroke="rgba(240,235,224,0.22)" strokeWidth={2} rx={12} />
          {boxes.map(b => {
            const c = STATUS_COLORS[b.status] || STATUS_COLORS.disponible;
            const selected = selectedUnitId === b.id;
            return (
              <g key={b.id}
                 data-testid={`fp-unit-${b.id}`}
                 style={{ cursor: canSeeDetails ? 'pointer' : 'help', transition: 'transform 0.2s' }}
                 onMouseEnter={() => onUnitHover && onUnitHover(b)}
                 onMouseLeave={() => onUnitHover && onUnitHover(null)}
                 onClick={() => onUnitClick && onUnitClick(b)}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h}
                  fill={c.fill}
                  stroke={selected ? '#fff' : c.stroke}
                  strokeWidth={selected ? 2.5 : 1.2}
                  rx={6}
                  style={{ transition: 'all 0.2s', filter: selected ? 'drop-shadow(0 0 8px rgba(99,102,241,0.8))' : 'none' }} />
                <text x={b.x + b.w / 2} y={b.y + 24} textAnchor="middle"
                  style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, fill: c.label }}>
                  {b.unit_number}
                </text>
                <text x={b.x + b.w / 2} y={b.y + 42} textAnchor="middle"
                  style={{ fontFamily: 'DM Sans', fontSize: 10, fill: 'var(--cream-3)' }}>
                  Proto {b.prototype}
                </text>
                <text x={b.x + b.w / 2} y={b.y + 60} textAnchor="middle"
                  style={{ fontFamily: 'DM Sans', fontSize: 10, fill: 'var(--cream-2)' }}>
                  {canSeeDetails ? `${b.m2_privative} m²` : '—'}
                </text>
                <text x={b.x + b.w / 2} y={b.y + b.h - 8} textAnchor="middle"
                  style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10, fill: c.stroke, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {t(`dev.status.${b.status}`)}
                </text>
              </g>
            );
          })}
        </svg>

        {!canSeeDetails && (
          <div style={{
            position: 'absolute', bottom: 14, right: 14,
            padding: '8px 12px',
            background: 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.30)',
            borderRadius: 9999,
            fontFamily: 'DM Sans', fontSize: 11, color: 'var(--indigo-3)',
          }}>
            {t('dev.floor_gated')}
          </div>
        )}
      </div>
    </div>
  );
}

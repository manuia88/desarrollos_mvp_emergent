/**
 * W5.2 Sub-C — SubscoreFilterPanel.
 * 6 sliders (uno por sub-score · 0-100 · default 0 = "cualquiera").
 * Aplicar → callback con thresholds JSON. Limpiar → reset.
 * Mobile: collapsible drawer. Desktop: sidebar.
 */
import React, { useState, useEffect } from 'react';

const SUBSCORES = [
  { key: 'seguridad',  label: 'Seguridad' },
  { key: 'lifestyle',  label: 'Lifestyle' },
  { key: 'transporte', label: 'Transporte' },
  { key: 'amenidades', label: 'Amenidades' },
  { key: 'precio',     label: 'Precio / m²' },
  { key: 'vibe',       label: 'Vibe urbano' },
];

export default function SubscoreFilterPanel({ value, onApply, onClear, compact = false }) {
  const [open, setOpen] = useState(!compact);
  const [drafts, setDrafts] = useState(() => {
    const init = {};
    SUBSCORES.forEach(s => { init[s.key] = (value && value[s.key]) || 0; });
    return init;
  });

  useEffect(() => {
    if (value) {
      setDrafts(prev => {
        const next = { ...prev };
        SUBSCORES.forEach(s => { next[s.key] = value[s.key] || 0; });
        return next;
      });
    }
  }, [value]);

  const setOne = (k, v) => setDrafts(prev => ({ ...prev, [k]: Number(v) }));

  const apply = () => {
    const active = {};
    for (const s of SUBSCORES) {
      const v = drafts[s.key];
      if (v > 0) active[s.key] = v;
    }
    onApply?.(active);
  };

  const clear = () => {
    const reset = {};
    SUBSCORES.forEach(s => { reset[s.key] = 0; });
    setDrafts(reset);
    onClear?.();
  };

  const activeCount = Object.values(drafts).filter(v => v > 0).length;

  return (
    <div
      data-testid="subscore-filter-panel"
      style={{
        padding: 18,
        borderRadius: 16,
        background: 'rgba(13,16,23,0.92)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      <button
        data-testid="subscore-panel-toggle"
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: '#F0EBE0',
          fontFamily: 'DM Sans',
          textAlign: 'left',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: open ? 14 : 0,
        }}
        aria-expanded={open}
      >
        <span>
          <span style={{ display: 'block', fontSize: 11, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
            Por dimensión zona
          </span>
          <span style={{ display: 'block', fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, marginTop: 2 }}>
            Filtrar por sub-scores {activeCount > 0 && <span style={{ color: '#EC4899' }}>({activeCount})</span>}
          </span>
        </span>
        <span style={{ fontSize: 18, color: 'rgba(240,235,224,0.6)' }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {SUBSCORES.map(s => (
              <label
                key={s.key}
                data-testid={`subscore-slider-${s.key}`}
                style={{ display: 'block', fontFamily: 'DM Sans' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(240,235,224,0.75)', marginBottom: 4 }}>
                  <span>{s.label}</span>
                  <span style={{ color: drafts[s.key] > 0 ? '#a5b4fc' : 'rgba(240,235,224,0.45)', fontWeight: 700 }}>
                    {drafts[s.key] > 0 ? `≥${drafts[s.key]}` : 'cualquiera'}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={drafts[s.key]}
                  onChange={e => setOne(s.key, e.target.value)}
                  style={{
                    width: '100%',
                    accentColor: '#6366F1',
                    cursor: 'pointer',
                  }}
                  aria-label={`Filtrar zonas con ${s.label} mínimo`}
                />
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              data-testid="subscore-apply-btn"
              onClick={apply}
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: 9999,
                border: 'none',
                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                color: '#fff',
                fontFamily: 'DM Sans',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Aplicar filtros
            </button>
            <button
              type="button"
              data-testid="subscore-clear-btn"
              onClick={clear}
              style={{
                padding: '9px 14px',
                borderRadius: 9999,
                background: 'rgba(99,102,241,0.10)',
                color: '#a5b4fc',
                border: '1px solid rgba(99,102,241,0.4)',
                fontFamily: 'DM Sans',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Limpiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

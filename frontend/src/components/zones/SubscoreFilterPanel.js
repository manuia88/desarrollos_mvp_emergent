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

export default function SubscoreFilterPanel({ value, onApply, onClear, compact = false, forecastValue = 0, onForecastChange }) {
  const [open, setOpen] = useState(!compact);
  const [drafts, setDrafts] = useState(() => {
    const init = {};
    SUBSCORES.forEach(s => { init[s.key] = (value && value[s.key]) || 0; });
    return init;
  });
  const [forecastDraft, setForecastDraft] = useState(forecastValue || 0);

  useEffect(() => {
    if (value) {
      setDrafts(prev => {
        const next = { ...prev };
        SUBSCORES.forEach(s => { next[s.key] = value[s.key] || 0; });
        return next;
      });
    }
  }, [value]);

  useEffect(() => { setForecastDraft(forecastValue || 0); }, [forecastValue]);

  const setOne = (k, v) => setDrafts(prev => ({ ...prev, [k]: Number(v) }));

  const apply = () => {
    const active = {};
    for (const s of SUBSCORES) {
      const v = drafts[s.key];
      if (v > 0) active[s.key] = v;
    }
    onApply?.(active);
    onForecastChange?.(forecastDraft);
  };

  const clear = () => {
    const reset = {};
    SUBSCORES.forEach(s => { reset[s.key] = 0; });
    setDrafts(reset);
    setForecastDraft(0);
    onClear?.();
    onForecastChange?.(0);
  };

  const activeCount = Object.values(drafts).filter(v => v > 0).length + (forecastDraft > 0 ? 1 : 0);

  return (
    <div
      data-testid="subscore-filter-panel"
      style={{
        padding: 20,
        borderRadius: 16,
        background: '#fff',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 2px rgba(16,18,28,0.05)',
      }}
    >
      <button
        data-testid="subscore-panel-toggle"
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'transparent', border: 'none', color: 'var(--cream)',
          fontFamily: 'DM Sans', textAlign: 'left', padding: 0, cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: open ? 16 : 0,
        }}
        aria-expanded={open}
      >
        <span>
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
            Filtra por lo que te importa
          </span>
          <span style={{ display: 'block', fontFamily: 'Outfit', fontSize: 17, fontWeight: 800, marginTop: 3, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
            Calidad de la zona {activeCount > 0 && <span style={{ color: 'var(--theme)' }}>({activeCount})</span>}
          </span>
        </span>
        <span style={{
          fontSize: 16, color: 'var(--cream-2)', width: 26, height: 26, borderRadius: 8,
          border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {SUBSCORES.map(s => {
              const on = drafts[s.key] > 0;
              return (
                <label key={s.key} data-testid={`subscore-slider-${s.key}`} style={{ display: 'block', fontFamily: 'DM Sans' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, marginBottom: 7 }}>
                    <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{s.label}</span>
                    <span style={{
                      color: on ? '#fff' : 'var(--cream-3)', background: on ? 'var(--theme)' : 'transparent',
                      fontWeight: 700, fontSize: 11, padding: on ? '2px 8px' : 0, borderRadius: 999,
                    }}>
                      {on ? `≥ ${drafts[s.key]}` : 'cualquiera'}
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={5} value={drafts[s.key]}
                    onChange={e => setOne(s.key, e.target.value)}
                    style={{ width: '100%', accentColor: 'var(--theme)', cursor: 'pointer' }}
                    aria-label={`Filtrar zonas con ${s.label} mínimo`}
                  />
                </label>
              );
            })}
            {/* W5.3 Parte 2B Sub-E — Forecast 12m growth slider */}
            <label
              data-testid="subscore-slider-forecast"
              style={{ display: 'block', fontFamily: 'DM Sans', paddingTop: 14, marginTop: 2, borderTop: '1px solid var(--border)' }}
              title="Filtra solo zonas con proyección anual mayor o igual al umbral seleccionado (ARIMA 12 meses)"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, marginBottom: 7 }}>
                <span style={{ color: 'var(--cream)', fontWeight: 600 }}>Crece al menos (12m)</span>
                <span style={{
                  color: forecastDraft > 0 ? '#fff' : 'var(--cream-3)', background: forecastDraft > 0 ? '#1FA06A' : 'transparent',
                  fontWeight: 700, fontSize: 11, padding: forecastDraft > 0 ? '2px 8px' : 0, borderRadius: 999,
                }}>
                  {forecastDraft > 0 ? `≥ +${forecastDraft}%` : 'cualquiera'}
                </span>
              </div>
              <input
                type="range" min={0} max={25} step={1} value={forecastDraft}
                onChange={e => setForecastDraft(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#1FA06A', cursor: 'pointer' }}
                aria-label="Filtrar zonas con crecimiento mínimo en 12 meses"
              />
              <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 5 }}>
                Proyección a 12 meses (plusvalía esperada de la zona).
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button
              type="button" data-testid="subscore-apply-btn" onClick={apply}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
                background: 'var(--theme)', color: '#fff',
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Aplicar
            </button>
            <button
              type="button" data-testid="subscore-clear-btn" onClick={clear}
              style={{
                padding: '10px 16px', borderRadius: 10, background: '#fff',
                color: 'var(--cream-2)', border: '1px solid var(--border)',
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer',
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

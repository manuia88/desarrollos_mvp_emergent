/**
 * W5.2 Sub-B — ZoneSubscoresCard.
 * Stacked horizontal bars con 6 sub-scores de zona + narratives + tooltips.
 * Diseño: navy/cream + indigo/rose. rounded-full. Sin shadow-2xl. Zero emojis.
 */
import React, { useState } from 'react';

const KEYS = ['lifestyle', 'seguridad', 'transporte', 'amenidades', 'precio', 'vibe'];

const DEFAULT_LABELS = {
  lifestyle: 'Lifestyle',
  seguridad: 'Seguridad',
  transporte: 'Transporte',
  amenidades: 'Amenidades',
  precio: 'Precio / m²',
  vibe: 'Vibe urbano',
};

const DEFAULT_DEFINITIONS = {
  lifestyle: 'Calidad de vida diaria: parques, gastronomía, cultura.',
  seguridad: 'Incidencia delictiva normalizada y percepción ciudadana.',
  transporte: 'Cercanía a Metro, Metrobús y conectividad vial.',
  amenidades: 'Densidad comercial y servicios DENUE en 1 km.',
  precio: 'Plusvalía esperada y costo / m² competitivo.',
  vibe: 'Carácter cultural y atractivo de barrio.',
};

function barColors(value) {
  if (value >= 85) return { from: '#22D3EE', to: '#A3E635', text: '#a3e635' };
  if (value < 60)  return { from: '#EC4899', to: '#F87171', text: '#fca5a5' };
  return { from: '#6366F1', to: '#EC4899', text: '#a5b4fc' };
}

export default function ZoneSubscoresCard({ data }) {
  const [hoverKey, setHoverKey] = useState(null);

  if (!data || !data.subscores) return null;

  const labels = data.labels || DEFAULT_LABELS;
  const definitions = data.definitions || DEFAULT_DEFINITIONS;
  const narratives = data.narratives || {};
  const subscores = data.subscores;

  return (
    <section
      data-testid="zone-subscores-card"
      aria-label="Desglose de sub-scores de la zona"
      style={{
        padding: 22,
        borderRadius: 18,
        background: 'rgba(13,16,23,0.92)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.10)',
        marginBottom: 36,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4 }}>
            Sub-scores de la zona
          </div>
          <h2 style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, margin: 0, color: '#F0EBE0', letterSpacing: '-0.02em' }}>
            ¿Cómo se vive en {data.name || 'esta colonia'}?
          </h2>
        </div>
        {data.score_total != null && (
          <span
            style={{
              padding: '6px 14px',
              borderRadius: 9999,
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.3)',
              color: '#a5b4fc',
              fontFamily: 'DM Sans',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Score total {Number(data.score_total).toFixed(0)}{data.score_letter ? ` · ${data.score_letter}` : ''}
          </span>
        )}
      </div>

      <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {KEYS.map(key => {
          const value = Number(subscores[key] ?? 50);
          const label = labels[key] || key;
          const narrative = narratives[key] || '';
          const definition = definitions[key] || '';
          const c = barColors(value);
          const isHover = hoverKey === key;
          return (
            <div
              key={key}
              role="listitem"
              data-testid={`subscore-row-${key}`}
              onMouseEnter={() => setHoverKey(key)}
              onMouseLeave={() => setHoverKey(null)}
              onFocus={() => setHoverKey(key)}
              onBlur={() => setHoverKey(null)}
              tabIndex={0}
              style={{ position: 'relative', outline: 'none' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontFamily: 'DM Sans', fontSize: 12.5 }}>
                <span style={{ color: 'rgba(240,235,224,0.85)', fontWeight: 600 }}>{label}</span>
                <span style={{ color: c.text, fontWeight: 700 }}>
                  {Number(value).toFixed(0)}
                  <span style={{ color: 'rgba(240,235,224,0.5)', fontWeight: 400, marginLeft: 8 }}>
                    {narrative}
                  </span>
                </span>
              </div>
              <div
                style={{
                  height: 30,
                  width: '100%',
                  borderRadius: 9999,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: `${Math.max(2, Math.min(100, value))}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${c.from}, ${c.to})`,
                    borderRadius: 9999,
                    transition: 'width 0.4s ease-out',
                  }}
                />
              </div>
              {isHover && definition && (
                <div
                  role="tooltip"
                  data-testid={`subscore-tooltip-${key}`}
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    left: 0,
                    maxWidth: 320,
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: 'rgba(6,8,15,0.96)',
                    border: '1px solid rgba(99,102,241,0.4)',
                    color: '#F0EBE0',
                    fontFamily: 'DM Sans',
                    fontSize: 11.5,
                    lineHeight: 1.4,
                    zIndex: 10,
                    pointerEvents: 'none',
                  }}
                >
                  {definition}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {data.source === 'fallback' && (
        <div style={{ marginTop: 12, fontSize: 11, color: 'rgba(240,235,224,0.45)', fontStyle: 'italic' }}>
          Algunos sub-scores muestran valores por defecto (50) por falta de datos suficientes.
        </div>
      )}
    </section>
  );
}

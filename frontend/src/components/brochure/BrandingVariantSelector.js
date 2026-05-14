// W4.9 — BrandingVariantSelector
// Selector visual de las 4 variantes de branding del brochure.
import React, { useEffect, useState } from 'react';

const FALLBACK = [
  { id: 'corporate_navy', label: 'Corporate Navy', description: 'Navy sólido, restraint institucional.', primary: '#06080F', accent: 'var(--theme)', uses_gradient: false },
  { id: 'cream_minimal', label: 'Cream Minimal', description: 'Cream + whitespace editorial.', primary: '#F0EBE0', accent: '#06080F', uses_gradient: false },
  { id: 'gradient_bold', label: 'Gradient Bold', description: 'Bloques indigo→rose, bold.', primary: '#06080F', accent: 'var(--theme-3)', uses_gradient: true },
  { id: 'editorial_serif', label: 'Editorial Serif', description: 'Magazine premium, serif.', primary: '#F0EBE0', accent: 'var(--theme)', uses_gradient: false },
  { id: 'dmx_neutral', label: 'DMX Neutral', description: 'Branding DMX por defecto.', primary: '#06080F', accent: 'var(--theme)', uses_gradient: true },
];

const API = process.env.REACT_APP_BACKEND_URL;

export default function BrandingVariantSelector({ value, onChange }) {
  const [variants, setVariants] = useState(FALLBACK);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/brochures/variants`)
      .then((r) => r.json())
      .then((d) => { if (alive && d?.ok && d.variants?.length) setVariants(d.variants); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <div data-testid="branding-variant-selector" style={{ display: 'grid', gap: 10 }}>
      <label style={{
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
        letterSpacing: '0.06em', color: 'var(--cream)',
      }}>
        VARIANTE DE BRANDING
      </label>
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      }}>
        {variants.map((v) => {
          const selected = value === v.id;
          const bg = v.uses_gradient
            ? 'linear-gradient(135deg, var(--theme) 0%, var(--theme-3) 100%)'
            : v.primary;
          return (
            <button
              type="button"
              key={v.id}
              data-testid={`variant-card-${v.id}`}
              onClick={() => onChange(v.id)}
              style={{
                position: 'relative',
                textAlign: 'left',
                background: 'rgba(15,18,28,0.85)',
                border: selected ? '2px solid var(--theme-3)' : '1px solid rgba(240,235,224,0.12)',
                borderRadius: 14,
                padding: 14,
                cursor: 'pointer',
                color: 'var(--cream)',
                transition: 'border-color 0.18s ease, transform 0.18s ease',
                transform: selected ? 'translateY(-1px)' : 'none',
              }}
            >
              <div style={{
                height: 70, width: '100%',
                borderRadius: 10,
                background: bg,
                marginBottom: 10,
                border: '1px solid rgba(240,235,224,0.10)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', left: 12, bottom: 10,
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
                  color: v.uses_gradient ? '#fff' : (v.primary === '#F0EBE0' ? '#06080F' : '#F0EBE0'),
                }}>
                  Aa
                </div>
                <div style={{
                  position: 'absolute', right: 12, top: 10,
                  width: 18, height: 18, borderRadius: 9999,
                  background: v.accent,
                }} />
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                {v.label}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, lineHeight: 1.45, color: 'var(--cream-3, #a0a4b0)' }}>
                {v.description}
              </div>
              {selected && (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                  color: '#fff', borderRadius: 9999,
                  padding: '2px 9px',
                  fontFamily: 'Outfit', fontWeight: 700, fontSize: 9, letterSpacing: '0.1em',
                }}>
                  SELECCIONADA
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// W5.22 Z.8 — Landing template: Boutique (artesanal · craft details)
import React from 'react';

export default function Boutique({ landing, children }) {
  const c = landing.content || {};
  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#8B6F47';
  const accent = brand.color_accent || '#D9C7A7';
  const fontH = brand.font_heading || 'Outfit, serif';
  const fontB = brand.font_body || 'DM Sans, sans-serif';
  const cta = c.cta?.primary?.text || 'Visita el showroom';

  return (
    <div data-testid="tpl-boutique" style={{ background: '#F7F1E8', color: '#2E1F12', fontFamily: fontB, minHeight: '100vh' }}>
      <div style={{ padding: '6rem 1.5rem 3rem', textAlign: 'center', position: 'relative' }}>
        <svg width="100%" height="40" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.18 }}>
          <pattern id="b-zig" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 20 L20 0 L40 20 L20 40 Z" fill="none" stroke={primary} strokeWidth="1" />
          </pattern>
          <rect width="100%" height="40" fill="url(#b-zig)" />
        </svg>
        <div style={{ letterSpacing: '0.4em', fontSize: 11, color: primary, textTransform: 'uppercase', marginBottom: 20 }}>Coleccion artesanal</div>
        <h1 style={{ fontFamily: fontH, fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, margin: 0, maxWidth: 800, marginInline: 'auto' }}>
          {c.hero?.title}
        </h1>
        {c.hero?.subtitle && (
          <p style={{ maxWidth: 600, margin: '24px auto 0', color: '#5A4030', lineHeight: 1.7 }}>{c.hero.subtitle}</p>
        )}
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '3rem 1.5rem' }}>
        {(c.features || []).slice(0, 5).map((f, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: i % 2 === 0 ? '1fr 2fr' : '2fr 1fr', gap: 36, alignItems: 'center', marginBottom: 56 }}>
            {i % 2 === 0 ? (
              <>
                <div style={{ height: 180, background: `linear-gradient(135deg, ${accent}, ${primary})`, borderRadius: 8 }} />
                <div>
                  <h3 style={{ fontFamily: fontH, margin: 0, fontSize: 24, color: primary }}>{f.title}</h3>
                  <p style={{ color: '#5A4030', marginTop: 12, lineHeight: 1.7 }}>{f.description}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 style={{ fontFamily: fontH, margin: 0, fontSize: 24, color: primary }}>{f.title}</h3>
                  <p style={{ color: '#5A4030', marginTop: 12, lineHeight: 1.7 }}>{f.description}</p>
                </div>
                <div style={{ height: 180, background: `linear-gradient(135deg, ${primary}, ${accent})`, borderRadius: 8 }} />
              </>
            )}
          </div>
        ))}

        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <button
            data-testid="tpl-boutique-cta"
            onClick={() => document.getElementById('lead-form-section')?.scrollIntoView({ behavior: 'smooth' })}
            style={{ padding: '14px 36px', background: primary, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 600, fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            {cta}
          </button>
        </div>
      </div>

      <div id="lead-form-section" style={{ padding: '3rem 1.5rem', background: '#fff' }}>{children}</div>
    </div>
  );
}

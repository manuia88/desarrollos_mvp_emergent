// W5.22 Z.8 — Landing template: Family (calido · escuelas · seguridad)
import React from 'react';

export default function Family({ landing, children }) {
  const c = landing.content || {};
  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#FF8C42';
  const secondary = brand.color_secondary || '#5BA47F';
  const fontH = brand.font_heading || 'Outfit, sans-serif';
  const fontB = brand.font_body || 'DM Sans, sans-serif';
  const cta = c.cta?.primary?.text || 'Agenda tu visita en familia';

  return (
    <div data-testid="tpl-family" style={{ background: '#FFF8F0', color: '#2A2A2A', fontFamily: fontB, minHeight: '100vh' }}>
      <div
        style={{
          padding: '5rem 1.5rem 4rem',
          background: c.hero?.bg_image_r2_key
            ? `linear-gradient(rgba(255,248,240,0.4), rgba(255,248,240,0.85)), url(${c.hero.bg_image_r2_key}) center/cover`
            : `linear-gradient(135deg, #FFF8F0, #FFE5D0)`,
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontFamily: fontH, fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: primary, margin: 0, fontWeight: 700, maxWidth: 800, marginInline: 'auto' }}>
          {c.hero?.title}
        </h1>
        {c.hero?.subtitle && (
          <p style={{ maxWidth: 600, margin: '24px auto 0', color: '#5A4A3A', fontSize: 'clamp(1rem, 1.4vw, 1.15rem)', lineHeight: 1.7 }}>
            {c.hero.subtitle}
          </p>
        )}
        <button
          data-testid="tpl-family-cta"
          onClick={() => document.getElementById('lead-form-section')?.scrollIntoView({ behavior: 'smooth' })}
          style={{ marginTop: 32, padding: '14px 32px', background: primary, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
        >
          {cta}
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '4rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
        {(c.features || []).slice(0, 6).map((f, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 4px 18px rgba(0,0,0,0.06)', border: `1px solid ${primary}22` }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: i % 2 === 0 ? primary : secondary, marginBottom: 18 }} />
            <h3 style={{ fontFamily: fontH, margin: 0, fontSize: 20 }}>{f.title}</h3>
            <p style={{ color: '#6B5A4A', margin: '8px 0 0 0', lineHeight: 1.6 }}>{f.description}</p>
          </div>
        ))}
      </div>

      {(c.testimonials || []).length > 0 && (
        <div style={{ background: '#FFE5D0', padding: '4rem 1.5rem' }}>
          <h2 style={{ fontFamily: fontH, textAlign: 'center', color: primary, margin: 0 }}>Familias que ya confiaron</h2>
          <div style={{ maxWidth: 800, margin: '32px auto 0', display: 'grid', gap: 24 }}>
            {(c.testimonials || []).slice(0, 3).map((t, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 24 }}>
                <p style={{ fontStyle: 'italic', color: '#4A3A2A', margin: 0 }}>&ldquo;{t.quote}&rdquo;</p>
                <p style={{ marginTop: 12, marginBottom: 0, color: primary, fontWeight: 600 }}>{t.author}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div id="lead-form-section" style={{ padding: '4rem 1.5rem', background: '#fff' }}>{children}</div>
    </div>
  );
}

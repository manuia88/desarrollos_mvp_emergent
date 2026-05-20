// W5.22 Z.8 — Landing template: Modern (minimalista · sans · grid 2 cols)
import React from 'react';

export default function Modern({ landing, children }) {
  const c = landing.content || {};
  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#6366F1';
  const secondary = brand.color_secondary || '#EC4899';
  const fontH = brand.font_heading || 'Outfit, sans-serif';
  const fontB = brand.font_body || 'DM Sans, sans-serif';
  const cta = c.cta?.primary?.text || 'Solicitar info';

  return (
    <div data-testid="tpl-modern" style={{ background: '#fff', color: '#111', fontFamily: fontB, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'center', minHeight: '70vh' }}>
          <div>
            <div style={{ height: 4, width: 60, background: `linear-gradient(90deg, ${primary}, ${secondary})`, marginBottom: 32 }} />
            <h1 style={{ fontFamily: fontH, fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, lineHeight: 1.1, margin: 0 }}>
              {c.hero?.title}
            </h1>
            {c.hero?.subtitle && (
              <p style={{ fontSize: 'clamp(1rem, 1.4vw, 1.15rem)', color: '#555', marginTop: 24, lineHeight: 1.7 }}>
                {c.hero.subtitle}
              </p>
            )}
            <button
              data-testid="tpl-modern-cta"
              onClick={() => document.getElementById('lead-form-section')?.scrollIntoView({ behavior: 'smooth' })}
              style={{
                marginTop: 32, padding: '14px 32px',
                background: `linear-gradient(90deg, ${primary}, ${secondary})`,
                color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 600, cursor: 'pointer', fontSize: 15,
              }}
            >
              {cta}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {(c.stats || []).slice(0, 4).map((s, i) => (
              <div key={i} style={{ background: '#FAFAFA', padding: 24, borderRadius: 16, border: '1px solid #EAEAEA' }}>
                <div style={{ fontFamily: fontH, fontSize: 32, fontWeight: 700, color: primary }}>{s.value}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {(c.features || []).length > 0 && (
          <div style={{ marginTop: 96, display: 'grid', gap: 24 }}>
            {(c.features || []).slice(0, 6).map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 20, padding: '20px 0', borderTop: '1px solid #EAEAEA' }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: `linear-gradient(135deg, ${primary}, ${secondary})`, flexShrink: 0 }} />
                <div>
                  <h3 style={{ margin: 0, fontFamily: fontH, fontSize: 18 }}>{f.title}</h3>
                  <p style={{ margin: '6px 0 0 0', color: '#555' }}>{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div id="lead-form-section" style={{ marginTop: 96 }}>{children}</div>
      </div>
    </div>
  );
}

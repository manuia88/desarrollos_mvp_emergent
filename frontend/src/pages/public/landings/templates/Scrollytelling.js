// W5.22 Z.8 — Landing template: Scrollytelling (paralax · long story · sticky sections)
import React from 'react';

export default function Scrollytelling({ landing, children }) {
  const c = landing.content || {};
  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#6366F1';
  const secondary = brand.color_secondary || '#EC4899';
  const fontH = brand.font_heading || 'Outfit, sans-serif';
  const fontB = brand.font_body || 'DM Sans, sans-serif';
  const cta = c.cta?.primary?.text || 'Empieza el viaje';

  const sections = [
    { title: c.hero?.title || 'Capitulo I', subtitle: c.hero?.subtitle, bg: '#06080F', color: '#F0EBE0' },
    ...(c.features || []).slice(0, 4).map((f, i) => ({
      title: f.title,
      subtitle: f.description,
      bg: i % 2 === 0 ? '#0A0A1F' : '#1A0E2E',
      color: '#F0EBE0',
    })),
    { title: 'El siguiente paso', subtitle: 'Reserva tu lugar antes de que se cierre la etapa.', bg: '#1A0828', color: '#F0EBE0', isCta: true },
  ];

  return (
    <div data-testid="tpl-scrollytelling" style={{ fontFamily: fontB }}>
      {sections.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'relative', minHeight: '100vh', background: s.bg, color: s.color,
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            padding: '4rem 1.5rem', textAlign: 'center',
            backgroundImage: `radial-gradient(at top right, ${primary}22, transparent), radial-gradient(at bottom left, ${secondary}22, transparent)`,
          }}
        >
          <div style={{ position: 'sticky', top: 60, maxWidth: 760 }}>
            <div style={{ letterSpacing: '0.4em', fontSize: 11, opacity: 0.5, textTransform: 'uppercase', marginBottom: 16 }}>Capitulo {i + 1}</div>
            <h2 style={{ fontFamily: fontH, fontSize: 'clamp(2rem, 5vw, 3.75rem)', margin: 0, fontWeight: 800, lineHeight: 1.1 }}>{s.title}</h2>
            {s.subtitle && (
              <p style={{ marginTop: 24, fontSize: 'clamp(1rem, 1.4vw, 1.25rem)', opacity: 0.85, lineHeight: 1.7 }}>{s.subtitle}</p>
            )}
            {s.isCta && (
              <button
                data-testid="tpl-scrolly-cta"
                onClick={() => document.getElementById('lead-form-section')?.scrollIntoView({ behavior: 'smooth' })}
                style={{
                  marginTop: 36, padding: '14px 36px',
                  background: `linear-gradient(90deg, ${primary}, ${secondary})`,
                  color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: 'pointer',
                }}
              >
                {cta}
              </button>
            )}
          </div>
        </div>
      ))}

      <div id="lead-form-section" style={{ padding: '4rem 1.5rem', background: '#06080F', color: '#F0EBE0' }}>{children}</div>
    </div>
  );
}

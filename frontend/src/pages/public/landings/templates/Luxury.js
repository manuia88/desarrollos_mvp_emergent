// W5.22 Z.8 — Landing template: Luxury (oro + negro · serif · audiencia premium)
import React from 'react';

const FONT_HEAD = 'Playfair Display, Outfit, serif';
const FONT_BODY = 'DM Sans, sans-serif';

export default function Luxury({ landing, onLead, isPreview, children }) {
  const c = landing.content || {};
  const hero = c.hero || {};
  const stats = c.stats || [];
  const features = c.features || [];
  const cta = c.cta?.primary?.text || 'Reservar visita privada';
  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#C8A24A';
  const bg = brand.color_secondary || '#0A0A0A';
  const cream = brand.color_accent || '#F0EBE0';
  const heading = brand.font_heading || FONT_HEAD;
  const body = brand.font_body || FONT_BODY;

  return (
    <div data-testid="tpl-luxury" style={{ background: bg, color: cream, minHeight: '100vh', fontFamily: body }}>
      <div
        style={{
          minHeight: '90vh',
          background: hero.bg_image_r2_key
            ? `linear-gradient(rgba(10,10,10,0.55), rgba(10,10,10,0.85)), url(${hero.bg_image_r2_key})`
            : `linear-gradient(135deg, ${bg} 0%, #1a1410 100%)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '6rem 1.5rem 4rem',
          textAlign: 'center',
        }}
      >
        <div style={{ letterSpacing: '0.45em', fontSize: 11, color: primary, marginBottom: 24, textTransform: 'uppercase' }}>
          {brand.disclaimer_text ? '' : 'Coleccion exclusiva'}
        </div>
        <h1 style={{ fontFamily: heading, fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontWeight: 700, margin: 0, maxWidth: 900 }}>
          {hero.title}
        </h1>
        {hero.subtitle && (
          <p style={{ fontSize: 'clamp(1rem, 1.6vw, 1.25rem)', color: '#c8c0b0', maxWidth: 640, marginTop: 24, lineHeight: 1.7 }}>
            {hero.subtitle}
          </p>
        )}
        <button
          data-testid="tpl-luxury-cta"
          onClick={() => document.getElementById('lead-form-section')?.scrollIntoView({ behavior: 'smooth' })}
          style={{
            marginTop: 40, padding: '14px 36px', background: primary, color: bg, border: 'none',
            borderRadius: 9999, fontWeight: 700, letterSpacing: '0.1em', fontSize: 13, cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {cta}
        </button>
      </div>

      {stats.length > 0 && (
        <div style={{ padding: '4rem 1.5rem', display: 'flex', justifyContent: 'center', gap: 64, flexWrap: 'wrap', borderTop: `1px solid ${primary}33`, borderBottom: `1px solid ${primary}33` }}>
          {stats.slice(0, 3).map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: heading, fontSize: 'clamp(2rem, 4vw, 3rem)', color: primary, fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#a09080', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 8 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {features.length > 0 && (
        <div style={{ padding: '5rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
          {features.slice(0, 5).map((f, i) => (
            <div key={i} style={{ marginBottom: 48, paddingBottom: 32, borderBottom: i < features.length - 1 ? `1px solid ${primary}22` : 'none' }}>
              <h3 style={{ fontFamily: heading, fontSize: 28, color: primary, margin: 0 }}>{f.title}</h3>
              <p style={{ color: '#b8b0a0', marginTop: 12, lineHeight: 1.7 }}>{f.description}</p>
            </div>
          ))}
        </div>
      )}

      <div id="lead-form-section" style={{ padding: '4rem 1.5rem', background: '#050505' }}>{children}</div>
    </div>
  );
}

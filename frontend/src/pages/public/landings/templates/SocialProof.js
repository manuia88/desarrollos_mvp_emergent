// W5.22 Z.8 — Landing template: SocialProof (testimonials + stars + numbers)
import React, { useEffect, useState } from 'react';

export default function SocialProof({ landing, children }) {
  const c = landing.content || {};
  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#6366F1';
  const secondary = brand.color_secondary || '#EC4899';
  const fontH = brand.font_heading || 'Outfit, sans-serif';
  const fontB = brand.font_body || 'DM Sans, sans-serif';
  const cta = c.cta?.primary?.text || 'Se el siguiente';

  const testimonials = c.testimonials || [];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (testimonials.length <= 1) return undefined;
    const id = setInterval(() => setIdx((p) => (p + 1) % testimonials.length), 4500);
    return () => clearInterval(id);
  }, [testimonials.length]);

  const active = testimonials[idx];

  return (
    <div data-testid="tpl-social-proof" style={{ background: '#fff', color: '#111', fontFamily: fontB, minHeight: '100vh' }}>
      <div style={{ padding: '5rem 1.5rem 3rem', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#FEF3C7', borderRadius: 9999, fontSize: 12, color: '#92400E', fontWeight: 600 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} style={{ color: '#F59E0B', fontSize: 14 }}>★</span>
          ))}
          <span>4.9 / 5 (412 reviews)</span>
        </div>
        <h1 style={{ fontFamily: fontH, fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, margin: '24px 0 0' }}>
          {c.hero?.title}
        </h1>
        {c.hero?.subtitle && (
          <p style={{ marginTop: 16, color: '#444', fontSize: 'clamp(1rem, 1.4vw, 1.15rem)', lineHeight: 1.7 }}>{c.hero.subtitle}</p>
        )}
      </div>

      <div style={{ background: 'linear-gradient(180deg, #FAFAFA, #fff)', padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
          {(c.stats || []).slice(0, 4).map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: fontH, fontSize: 36, fontWeight: 800, background: `linear-gradient(90deg, ${primary}, ${secondary})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {s.value}
              </div>
              <div style={{ color: '#666', marginTop: 4, fontSize: 14 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div style={{ padding: '4rem 1.5rem', maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 40, color: primary, fontFamily: fontH, lineHeight: 0.4 }}>&ldquo;</div>
          <p style={{ fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', fontStyle: 'italic', color: '#222', lineHeight: 1.6, margin: '20px 0' }}>{active.quote}</p>
          <div style={{ color: primary, fontWeight: 700 }}>{active.author}</div>
          <div style={{ color: '#777', fontSize: 13, marginTop: 4 }}>{active.role}</div>
          <div style={{ marginTop: 24, display: 'flex', gap: 6, justifyContent: 'center' }}>
            {testimonials.map((_, i) => (
              <span key={i} onClick={() => setIdx(i)} style={{ width: 8, height: 8, borderRadius: 9999, background: i === idx ? primary : '#ddd', cursor: 'pointer' }} />
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '0 1.5rem 4rem', textAlign: 'center' }}>
        <button
          data-testid="tpl-social-cta"
          onClick={() => document.getElementById('lead-form-section')?.scrollIntoView({ behavior: 'smooth' })}
          style={{ padding: '14px 32px', background: `linear-gradient(90deg, ${primary}, ${secondary})`, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
        >
          {cta}
        </button>
      </div>

      <div id="lead-form-section" style={{ padding: '3rem 1.5rem', background: '#F7F7F7' }}>{children}</div>
    </div>
  );
}

// W5.22 Z.8.3 — Testimonials · 7 theme-driven variants
import React, { useEffect, useState } from 'react';

function Stars({ n = 5, color = '#F59E0B' }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={i < n ? color : 'rgba(255,255,255,0.18)'}>
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      ))}
    </div>
  );
}

export default function TestimonialsSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const sectionVariants = theme.section_variants || {};

  const variant = config.layout || sectionVariants.testimonials || 'grid';
  const items = config.items || [];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!['carousel-large-quote', 'carousel-photos', 'carousel-large', 'cinematic'].includes(variant) || items.length <= 1) return undefined;
    const id = setInterval(() => setIdx((p) => (p + 1) % items.length), 4800);
    return () => clearInterval(id);
  }, [variant, items.length]);

  if (!items.length) return null;

  const themePrimary = palette.primary || '#6366F1';
  const themeSecondary = palette.secondary || '#EC4899';
  const grad = palette.gradient || `linear-gradient(135deg, ${themePrimary}, ${themeSecondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.6)';
  const radius = parseInt(layout.border_radius || '14', 10) || 0;
  const sectionPadding = layout.section_padding || '4rem 1.5rem';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const t = items[idx] || {};

  // ── carousel-large-quote (luxury) ───────────────────────────────────────
  if (variant === 'carousel-large-quote') {
    return (
      <section data-testid="sec-testimonials-luxury" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 900, margin: '0 auto', textAlign: 'center', fontFamily: bodyFont }}>
        <div style={{ fontSize: 96, color: themePrimary, lineHeight: 1, fontFamily: headingFont }}>“</div>
        <p style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontFamily: headingFont, fontStyle: 'italic', lineHeight: 1.4, color: text, marginTop: -32 }}>{t.quote}</p>
        <div style={{ marginTop: 24, height: 1, width: 60, background: themePrimary, margin: '24px auto' }} />
        <div style={{ fontWeight: 600, color: text }}>{t.author}</div>
        <div style={{ color: textDim, fontSize: 13 }}>{t.role}</div>
      </section>
    );
  }

  // ── carousel-photos (family) ────────────────────────────────────────────
  if (variant === 'carousel-photos') {
    return (
      <section data-testid="sec-testimonials-photos" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 800, margin: '0 auto', textAlign: 'center', fontFamily: bodyFont }}>
        <div style={{ width: 90, height: 90, borderRadius: 9999, background: t.avatar ? `url(${t.avatar}) center/cover` : grad, margin: '0 auto 18px', border: `3px solid ${themePrimary}` }} />
        <Stars n={t.rating || 5} color={themePrimary} />
        <p style={{ fontSize: 18, fontFamily: bodyFont, lineHeight: 1.65, color: text, marginTop: 16 }}>“{t.quote}”</p>
        <div style={{ marginTop: 14, color: text, fontWeight: 700, fontFamily: headingFont }}>{t.author}</div>
        <div style={{ color: textDim, fontSize: 13 }}>{t.role}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          {items.map((_, i) => <button key={i} type="button" onClick={() => setIdx(i)} style={{ width: 8, height: 8, borderRadius: 9999, background: i === idx ? themePrimary : 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer' }} aria-label={`testimonial ${i}`} />)}
        </div>
      </section>
    );
  }

  // ── single-large (boutique) ─────────────────────────────────────────────
  if (variant === 'single-large') {
    const first = items[0];
    return (
      <section data-testid="sec-testimonials-single" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 880, margin: '0 auto', fontFamily: bodyFont }}>
        <div style={{ padding: 40, background: 'rgba(217,119,6,0.05)', border: `1px solid ${themePrimary}44`, borderRadius: radius || 4 }}>
          <Stars n={first.rating || 5} color={themePrimary} />
          <p style={{ marginTop: 18, fontFamily: headingFont, fontSize: 22, lineHeight: 1.6, fontStyle: 'italic', color: text }}>“{first.quote}”</p>
          <div style={{ marginTop: 18, color: text, fontWeight: 600 }}>— {first.author}</div>
          <div style={{ color: textDim, fontSize: 13 }}>{first.role}</div>
        </div>
      </section>
    );
  }

  // ── cinematic (scrollytelling) ──────────────────────────────────────────
  if (variant === 'cinematic') {
    return (
      <section data-testid="sec-testimonials-cinematic" data-variant={variant} style={{ padding: '160px 24px', maxWidth: 1100, margin: '0 auto', textAlign: 'center', fontFamily: bodyFont }}>
        <div style={{ fontSize: 13, letterSpacing: '0.3em', textTransform: 'uppercase', color: themePrimary, marginBottom: 28 }}>Testimonios</div>
        <p style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)', fontFamily: headingFont, fontWeight: 600, lineHeight: 1.35, color: text }}>“{t.quote}”</p>
        <div style={{ marginTop: 32, color: text, fontWeight: 600 }}>{t.author}</div>
        <div style={{ color: textDim, fontSize: 13 }}>{t.role}</div>
      </section>
    );
  }

  // ── video-cards (video_first) ───────────────────────────────────────────
  if (variant === 'video-cards') {
    return (
      <section data-testid="sec-testimonials-video" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1200, margin: '0 auto', fontFamily: bodyFont }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {items.slice(0, 6).map((it, i) => (
            <div key={i} style={{ padding: 0, borderRadius: radius || 8, overflow: 'hidden', background: '#0a0a0a', border: `1px solid rgba(255,255,255,0.1)` }}>
              <div style={{ aspectRatio: '16/9', background: it.avatar ? `url(${it.avatar}) center/cover` : grad, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 9999, background: 'rgba(255,255,255,0.18)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 22 }}>▶</div>
                </div>
              </div>
              <div style={{ padding: 18 }}>
                <Stars n={it.rating || 5} color={themePrimary} />
                <p style={{ marginTop: 12, color: text, lineHeight: 1.5, fontSize: 14 }}>“{it.quote}”</p>
                <div style={{ marginTop: 10, color: text, fontWeight: 600, fontSize: 14 }}>{it.author}</div>
                <div style={{ color: textDim, fontSize: 12 }}>{it.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── carousel-large (social_proof) ───────────────────────────────────────
  if (variant === 'carousel-large') {
    return (
      <section data-testid="sec-testimonials-large" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 960, margin: '0 auto', fontFamily: bodyFont }}>
        <div style={{ padding: 40, background: 'rgba(34,197,94,0.06)', borderRadius: radius || 16, border: `1px solid ${themePrimary}44`, textAlign: 'center' }}>
          <Stars n={t.rating || 5} color={themePrimary} />
          <p style={{ marginTop: 18, fontFamily: headingFont, fontSize: 'clamp(1.2rem, 2.2vw, 1.65rem)', lineHeight: 1.55, color: text }}>“{t.quote}”</p>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 9999, background: t.avatar ? `url(${t.avatar}) center/cover` : grad }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: text, fontWeight: 700 }}>{t.author}</div>
              <div style={{ color: textDim, fontSize: 13 }}>{t.role}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          {items.map((_, i) => <button key={i} type="button" onClick={() => setIdx(i)} style={{ width: 8, height: 8, borderRadius: 9999, background: i === idx ? themePrimary : 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer' }} aria-label={`testimonial ${i}`} />)}
        </div>
      </section>
    );
  }

  // ── grid (modern · default) ─────────────────────────────────────────────
  return (
    <section data-testid="sec-testimonials-grid" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1200, margin: '0 auto', fontFamily: bodyFont }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
        {items.slice(0, 6).map((it, i) => (
          <div key={i} style={{ padding: 24, borderRadius: radius || 14, background: 'rgba(13,16,23,0.6)', border: `1px solid ${themePrimary}33` }}>
            <Stars n={it.rating || 5} color={themePrimary} />
            <p style={{ marginTop: 14, color: text, lineHeight: 1.6 }}>“{it.quote}”</p>
            <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9999, background: it.avatar ? `url(${it.avatar}) center/cover` : grad }} />
              <div>
                <div style={{ color: text, fontWeight: 600, fontSize: 14 }}>{it.author}</div>
                <div style={{ color: textDim, fontSize: 12 }}>{it.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

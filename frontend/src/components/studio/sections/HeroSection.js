// W5.22 Z.8.3 — Hero Section · 10 theme-driven variants
import React from 'react';

const DEFAULT_BG = '#06080F';
const DEFAULT_TEXT = '#F0EBE0';

export default function HeroSection({ config = {}, brandKit = {}, linkedEntity, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const sectionVariants = theme.section_variants || {};

  // config.variant takes precedence; else theme.section_variants.hero; else "centered"
  const variant = config.variant || sectionVariants.hero || 'centered';
  const headline = config.headline || linkedEntity?.name || 'Tu proximo proyecto';
  const subhead = config.subhead || '';
  const bgImage = config.bg_image || linkedEntity?.images?.[0] || '';
  const primaryCta = config.primary_cta || { text: 'Comenzar', action: 'scroll_to_lead' };
  const secondaryCta = config.secondary_cta;

  const themePrimary = palette.primary || brandKit.color_primary || '#6366F1';
  const themeSecondary = palette.secondary || brandKit.color_secondary || '#EC4899';
  const grad = palette.gradient || `linear-gradient(90deg, ${themePrimary}, ${themeSecondary})`;
  const bg = palette.bg || DEFAULT_BG;
  const text = palette.text || DEFAULT_TEXT;
  const textDim = palette.text_dim || 'rgba(240,235,224,0.62)';
  const radius = parseInt(layout.border_radius || '16', 10) || 0;
  const sectionPadding = layout.section_padding || '80px 24px';

  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const headingWeight = typography.heading_weight || '800';
  const headingLs = typography.heading_letter_spacing || '-0.02em';
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const bodySize = typography.body_size || '16px';
  const dataFont = typography.data_font || headingFont;

  const scrollToLead = () => document.getElementById('lead-form-anchor')?.scrollIntoView({ behavior: 'smooth' });

  const CTA = ({ text: ctaText, kind = 'primary', onClick }) => {
    const isPrimary = kind === 'primary';
    return (
      <button
        data-testid={`hero-${kind}-cta`}
        type="button"
        onClick={onClick}
        style={{
          padding: '14px 28px',
          background: isPrimary ? grad : 'transparent',
          color: isPrimary ? '#fff' : text,
          border: isPrimary ? 'none' : `1px solid ${themePrimary}55`,
          borderRadius: 9999,
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          fontFamily: bodyFont,
          transition: `transform ${theme.animation?.duration || '320ms'} ${theme.animation?.transition_curve || 'cubic-bezier(0.22, 1, 0.36, 1)'}`,
        }}
      >
        {ctaText}
      </button>
    );
  };

  const headingStyle = {
    fontFamily: headingFont,
    fontWeight: headingWeight,
    letterSpacing: headingLs,
    margin: 0,
    lineHeight: 1.05,
    color: text,
  };
  const subStyle = {
    marginTop: 18,
    color: textDim,
    fontSize: bodySize,
    lineHeight: typography.line_height || 1.6,
    fontFamily: bodyFont,
  };
  const wrapBase = {
    background: bg,
    color: text,
    fontFamily: bodyFont,
  };

  // ── Variant 1: fullscreen-text-bottom-left (luxury) ──────────────────────
  if (variant === 'fullscreen-text-bottom-left' || variant === 'fullscreen') {
    return (
      <section data-testid="sec-hero-fullscreen" data-variant={variant} style={{ ...wrapBase, position: 'relative', minHeight: '92vh', display: 'flex', alignItems: 'flex-end', padding: sectionPadding, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: bgImage ? `linear-gradient(0deg, rgba(10,10,10,0.85), rgba(10,10,10,0.35)), url(${bgImage}) center/cover` : grad, opacity: bgImage ? 1 : 0.5 }} />
        <div style={{ position: 'relative', maxWidth: 720, zIndex: 2 }}>
          <div style={{ height: 1, width: 80, background: themePrimary, marginBottom: 28 }} />
          <h1 style={{ ...headingStyle, fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>{headline}</h1>
          {subhead && <p style={subStyle}>{subhead}</p>}
          <div style={{ marginTop: 36, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <CTA text={primaryCta.text} kind="primary" onClick={scrollToLead} />
            {secondaryCta?.text && <CTA text={secondaryCta.text} kind="secondary" />}
          </div>
        </div>
      </section>
    );
  }

  // ── Variant 2: centered (modern) ─────────────────────────────────────────
  if (variant === 'centered') {
    return (
      <section data-testid="sec-hero-centered" data-variant={variant} style={{ ...wrapBase, padding: sectionPadding, textAlign: 'center' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h1 style={{ ...headingStyle, fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>{headline}</h1>
          {subhead && <p style={subStyle}>{subhead}</p>}
          <div style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <CTA text={primaryCta.text} kind="primary" onClick={scrollToLead} />
            {secondaryCta?.text && <CTA text={secondaryCta.text} kind="secondary" />}
          </div>
        </div>
      </section>
    );
  }

  // ── Variant 3: split-image-right (family) ────────────────────────────────
  if (variant === 'split-image-right' || variant === 'split') {
    return (
      <section data-testid="sec-hero-split" data-variant={variant} style={{ ...wrapBase, padding: sectionPadding }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 40, maxWidth: 1280, margin: '0 auto', alignItems: 'center' }}>
          <div>
            <div style={{ height: 4, width: 64, background: grad, marginBottom: 22, borderRadius: 9999 }} />
            <h1 style={{ ...headingStyle, fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}>{headline}</h1>
            {subhead && <p style={subStyle}>{subhead}</p>}
            <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <CTA text={primaryCta.text} kind="primary" onClick={scrollToLead} />
              {secondaryCta?.text && <CTA text={secondaryCta.text} kind="secondary" />}
            </div>
          </div>
          <div style={{ aspectRatio: '4/3', borderRadius: radius || 24, background: bgImage ? `url(${bgImage}) center/cover` : grad, opacity: bgImage ? 1 : 0.5 }} />
        </div>
      </section>
    );
  }

  // ── Variant 4: stats-hero (investor) ─────────────────────────────────────
  if (variant === 'stats-hero') {
    const stats = config.stats || linkedEntity?.stats || [
      { label: 'Plusvalia 5a', value: '+38%' },
      { label: 'IRR', value: '14.2%' },
      { label: 'TIR', value: '18%' },
    ];
    return (
      <section data-testid="sec-hero-stats" data-variant={variant} style={{ ...wrapBase, padding: sectionPadding }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32, alignItems: 'center' }}>
          <div>
            <h1 style={{ ...headingStyle, fontSize: 'clamp(1.75rem, 4vw, 3rem)' }}>{headline}</h1>
            {subhead && <p style={subStyle}>{subhead}</p>}
            <div style={{ marginTop: 28 }}>
              <CTA text={primaryCta.text} kind="primary" onClick={scrollToLead} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {stats.slice(0, 4).map((s, i) => (
              <div key={i} style={{ padding: 18, background: 'rgba(59,130,246,0.08)', border: `1px solid ${themePrimary}33`, borderRadius: radius || 8 }}>
                <div style={{ fontFamily: dataFont, fontSize: 32, fontWeight: 800, color: themeSecondary }}>{s.value}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: textDim }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ── Variant 5: portrait-frame (boutique) ─────────────────────────────────
  if (variant === 'portrait-frame' || variant === 'centered-portrait') {
    return (
      <section data-testid="sec-hero-portrait" data-variant={variant} style={{ ...wrapBase, padding: sectionPadding, textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ width: 180, height: 180, borderRadius: 9999, margin: '0 auto 32px', background: bgImage ? `url(${bgImage}) center/cover` : grad, border: `4px solid ${themeSecondary}`, opacity: bgImage ? 1 : 0.7 }} />
          <h1 style={{ ...headingStyle, fontSize: 'clamp(1.75rem, 4vw, 2.75rem)' }}>{headline}</h1>
          {subhead && <p style={subStyle}>{subhead}</p>}
          <div style={{ marginTop: 28 }}>
            <CTA text={primaryCta.text} kind="primary" onClick={scrollToLead} />
          </div>
        </div>
      </section>
    );
  }

  // ── Variant 6: countdown-prominent (urgent) ──────────────────────────────
  if (variant === 'countdown-prominent') {
    const expires = config.expires_at || '';
    return (
      <section data-testid="sec-hero-countdown" data-variant={variant} style={{ ...wrapBase, padding: sectionPadding, textAlign: 'center', borderTop: `4px solid ${themePrimary}`, borderBottom: `4px solid ${themePrimary}` }}>
        <div style={{ display: 'inline-block', padding: '6px 18px', borderRadius: 9999, background: themePrimary, color: '#fff', fontWeight: 800, fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 18 }}>{config.urgency_label || 'OFERTA LIMITADA'}</div>
          <h1 style={{ ...headingStyle, fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}>{headline}</h1>
          {subhead && <p style={subStyle}>{subhead}</p>}
          {expires && <div style={{ marginTop: 18, color: themePrimary, fontFamily: dataFont, fontWeight: 700 }}>Termina {new Date(expires).toLocaleDateString('es-MX')}</div>}
          <div style={{ marginTop: 28 }}>
            <CTA text={primaryCta.text} kind="primary" onClick={scrollToLead} />
          </div>
      </section>
    );
  }

  // ── Variant 7: parallax-fullscreen (scrollytelling) ──────────────────────
  if (variant === 'parallax-fullscreen') {
    return (
      <section data-testid="sec-hero-parallax" data-variant={variant} style={{ ...wrapBase, position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center', padding: sectionPadding, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: bgImage ? `linear-gradient(rgba(10,6,18,0.6), rgba(10,6,18,0.9)), url(${bgImage}) center/cover fixed` : grad, opacity: bgImage ? 1 : 0.5 }} />
        <div style={{ position: 'relative', maxWidth: 720, textAlign: 'center', zIndex: 2 }}>
          <h1 style={{ ...headingStyle, fontSize: 'clamp(2.75rem, 7vw, 5.5rem)' }}>{headline}</h1>
          {subhead && <p style={{ ...subStyle, fontSize: '1.15rem', marginTop: 28 }}>{subhead}</p>}
          <div style={{ marginTop: 40, fontFamily: bodyFont, color: textDim, fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase' }}>↓ Scroll para descubrir</div>
        </div>
      </section>
    );
  }

  // ── Variant 8: video-fullscreen-overlay (video_first) ────────────────────
  if (variant === 'video-fullscreen-overlay' || variant === 'video-fullscreen') {
    const videoUrl = config.bg_video || '';
    return (
      <section data-testid="sec-hero-video" data-variant={variant} style={{ ...wrapBase, position: 'relative', minHeight: '92vh', display: 'grid', placeItems: 'center', overflow: 'hidden', padding: sectionPadding }}>
        {videoUrl ? (
          <video autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} src={videoUrl} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: bgImage ? `url(${bgImage}) center/cover` : '#000' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0.8))' }} />
        <div style={{ position: 'relative', textAlign: 'center', maxWidth: 800, zIndex: 2 }}>
          <h1 style={{ ...headingStyle, color: '#fff', fontSize: 'clamp(2.5rem, 6.5vw, 5rem)' }}>{headline}</h1>
          {subhead && <p style={{ ...subStyle, color: 'rgba(255,255,255,0.85)' }}>{subhead}</p>}
          <div style={{ marginTop: 32 }}>
            <CTA text={primaryCta.text} kind="primary" onClick={scrollToLead} />
          </div>
        </div>
      </section>
    );
  }

  // ── Variant 9: testimonial-prominent (social_proof) ──────────────────────
  if (variant === 'testimonial-prominent' || variant === 'testimonial-first') {
    const quote = config.featured_quote || { text: 'El mejor proceso de compra que he tenido.', author: 'Cliente DMX', rating: 5 };
    return (
      <section data-testid="sec-hero-testimonial" data-variant={variant} style={{ ...wrapBase, padding: sectionPadding, textAlign: 'center' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 18 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} style={{ color: i < (quote.rating || 5) ? themePrimary : 'rgba(255,255,255,0.18)', fontSize: 22 }}>★</span>
            ))}
          </div>
          <p style={{ ...headingStyle, fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)', fontStyle: 'italic', lineHeight: 1.35 }}>“{quote.text}”</p>
          <div style={{ marginTop: 18, color: textDim, fontFamily: bodyFont }}>— {quote.author}</div>
          <div style={{ marginTop: 12, fontFamily: headingFont, fontWeight: headingWeight, fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', color: text }}>{headline}</div>
          {subhead && <p style={subStyle}>{subhead}</p>}
          <div style={{ marginTop: 28 }}>
            <CTA text={primaryCta.text} kind="primary" onClick={scrollToLead} />
          </div>
        </div>
      </section>
    );
  }

  // ── Variant 10: split-vs (compare) ───────────────────────────────────────
  if (variant === 'split-vs' || variant === 'split-comparison') {
    const left = config.left_label || 'Tradicional';
    const right = config.right_label || 'DesarrollosMX';
    return (
      <section data-testid="sec-hero-split-vs" data-variant={variant} style={{ ...wrapBase, padding: sectionPadding }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <h1 style={{ ...headingStyle, textAlign: 'center', fontSize: 'clamp(1.75rem, 4vw, 3rem)' }}>{headline}</h1>
          {subhead && <p style={{ ...subStyle, textAlign: 'center' }}>{subhead}</p>}
          <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            <div style={{ padding: 24, borderRadius: radius || 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
              <div style={{ color: textDim, fontFamily: bodyFont, letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: 11 }}>{left}</div>
              <div style={{ marginTop: 12, fontSize: 28, fontFamily: headingFont, fontWeight: 700, opacity: 0.55 }}>Lento · costoso</div>
            </div>
            <div style={{ padding: 24, borderRadius: radius || 12, background: grad, color: '#fff', textAlign: 'center' }}>
              <div style={{ letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: 11, opacity: 0.85 }}>{right}</div>
              <div style={{ marginTop: 12, fontSize: 28, fontFamily: headingFont, fontWeight: 700 }}>Rapido · transparente</div>
            </div>
          </div>
          <div style={{ marginTop: 32, textAlign: 'center' }}>
            <CTA text={primaryCta.text} kind="primary" onClick={scrollToLead} />
          </div>
        </div>
      </section>
    );
  }

  // ── Fallback: centered ───────────────────────────────────────────────────
  return (
    <section data-testid="sec-hero-default" style={{ ...wrapBase, padding: sectionPadding, textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ ...headingStyle, fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>{headline}</h1>
      {subhead && <p style={subStyle}>{subhead}</p>}
      <div style={{ marginTop: 32 }}>
        <CTA text={primaryCta.text} kind="primary" onClick={scrollToLead} />
      </div>
    </section>
  );
}

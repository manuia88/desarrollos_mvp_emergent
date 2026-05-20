// W5.22 Z.8.2 — Hero Section (variants split / centered / fullscreen)
import React from 'react';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

export default function HeroSection({ config = {}, brandKit = {}, linkedEntity }) {
  const variant = config.variant || 'centered';
  const headline = config.headline || linkedEntity?.name || 'Tu proximo proyecto';
  const subhead = config.subhead || '';
  const bgImage = config.bg_image || linkedEntity?.images?.[0] || '';
  const primary = config.primary_cta || { text: 'Comenzar', action: 'scroll_to_lead' };
  const secondary = config.secondary_cta;
  const brandPrimary = brandKit.color_primary || '#6366F1';
  const brandSecondary = brandKit.color_secondary || '#EC4899';
  const grad = `linear-gradient(90deg, ${brandPrimary}, ${brandSecondary})`;

  const scrollToLead = () => document.getElementById('lead-form-anchor')?.scrollIntoView({ behavior: 'smooth' });

  if (variant === 'split') {
    return (
      <section data-testid="sec-hero-split" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', minHeight: '70vh', alignItems: 'center', padding: '4rem 1.5rem', gap: 40, maxWidth: 1280, margin: '0 auto' }}>
        <div>
          <div style={{ height: 4, width: 60, background: grad, marginBottom: 24, borderRadius: 9999 }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 5vw, 3.75rem)', margin: 0, lineHeight: 1.05, fontWeight: 800 }}>{headline}</h1>
          {subhead && <p style={{ marginTop: 18, color: 'rgba(240,235,224,0.62)', fontSize: 'clamp(1rem, 1.4vw, 1.15rem)', lineHeight: 1.7 }}>{subhead}</p>}
          <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
            <button data-testid="hero-primary-cta" type="button" onClick={scrollToLead} style={{ padding: '14px 28px', background: grad, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{primary.text}</button>
            {secondary?.text && <button type="button" style={{ padding: '14px 28px', background: 'transparent', color: '#F0EBE0', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 9999, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{secondary.text}</button>}
          </div>
        </div>
        <div style={{ aspectRatio: '4/3', borderRadius: 20, background: bgImage ? `url(${bgImage}) center/cover` : grad, opacity: bgImage ? 1 : 0.4 }} />
      </section>
    );
  }
  if (variant === 'fullscreen') {
    return (
      <section data-testid="sec-hero-fullscreen" style={{ position: 'relative', minHeight: '90vh', display: 'grid', placeItems: 'center', padding: '6rem 1.5rem 4rem', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: bgImage ? `linear-gradient(rgba(6,8,15,0.55), rgba(6,8,15,0.85)), url(${bgImage}) center/cover` : grad, opacity: bgImage ? 1 : 0.35 }} />
        <div style={{ position: 'relative', maxWidth: 800 }}>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', margin: 0, fontWeight: 800, lineHeight: 1.05 }}>{headline}</h1>
          {subhead && <p style={{ marginTop: 18, color: 'rgba(240,235,224,0.78)', fontSize: 'clamp(1rem, 1.6vw, 1.25rem)' }}>{subhead}</p>}
          <button data-testid="hero-primary-cta" type="button" onClick={scrollToLead} style={{ marginTop: 32, padding: '14px 32px', background: grad, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{primary.text}</button>
        </div>
      </section>
    );
  }
  return (
    <section data-testid="sec-hero-centered" style={{ padding: '5rem 1.5rem 4rem', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', margin: 0, fontWeight: 800, lineHeight: 1.05 }}>{headline}</h1>
      {subhead && <p style={{ marginTop: 18, color: 'rgba(240,235,224,0.62)', fontSize: 'clamp(1rem, 1.4vw, 1.15rem)' }}>{subhead}</p>}
      <button data-testid="hero-primary-cta" type="button" onClick={scrollToLead} style={{ marginTop: 32, padding: '14px 32px', background: grad, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{primary.text}</button>
    </section>
  );
}

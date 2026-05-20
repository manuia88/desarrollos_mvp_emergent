// W5.22 Z.8.5 — Scrollytelling · Capitulo (4 sub-variants: origen · diseno · vida · inversion)
import React from 'react';

export default function ScrollytellingCapituloSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const primary = palette.primary || '#7C3AED';
  const secondary = palette.secondary || '#EC4899';
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.65)';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const sectionPadding = layout.section_padding || '140px 48px';

  const num = config.num || 1;
  const title = config.title || `Capitulo ${num}`;
  const subtitle = config.subtitle || '';
  const body = config.body || '';

  return (
    <section data-testid={`sec-capitulo-${num}`} style={{ padding: sectionPadding, fontFamily: bodyFont, color: text, position: 'relative' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'left' }}>
        <div style={{ fontFamily: headingFont, fontSize: 14, color: primary, letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 18 }}>· Capitulo {num} ·</div>
        <h2 style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 'clamp(2.25rem, 5vw, 3.75rem)', letterSpacing: '-0.02em', margin: '0 0 14px', lineHeight: 1.05 }}>{title}</h2>
        {subtitle && <p style={{ color: textDim, fontSize: 18, margin: '0 0 32px', fontStyle: 'italic', lineHeight: 1.5 }}>{subtitle}</p>}
        <div style={{ height: 1, width: 120, background: `linear-gradient(90deg, ${primary}, ${secondary})`, margin: '0 0 32px' }} />
        {body && <p style={{ fontSize: 18, lineHeight: 1.75, color: text, margin: 0, maxWidth: 720 }}>{body}</p>}
      </div>
    </section>
  );
}

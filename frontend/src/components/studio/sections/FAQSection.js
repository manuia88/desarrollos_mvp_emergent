// W5.22 Z.8.3 — FAQ · theme-aware accordion
import React from 'react';

export default function FAQSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const items = config.items || [];
  if (!items.length) return null;

  const themePrimary = palette.primary || '#6366F1';
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.78)';
  const radius = parseInt(layout.border_radius || '12', 10) || 0;
  const sectionPadding = layout.section_padding || '4rem 1.5rem';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";

  return (
    <section data-testid="sec-faq" style={{ padding: sectionPadding, maxWidth: 760, margin: '0 auto', fontFamily: bodyFont }}>
      <h2 style={{ fontFamily: headingFont, textAlign: 'center', margin: '0 0 28px', fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: text }}>{config.title || 'Preguntas frecuentes'}</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((q, i) => (
          <details key={i} data-testid={`faq-${i}`} style={{ background: 'rgba(13,16,23,0.6)', border: `1px solid ${themePrimary}33`, borderRadius: radius, padding: '14px 18px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontFamily: headingFont, listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: text }}>
              <span>{q.question}</span>
              <span style={{ opacity: 0.5 }}>+</span>
            </summary>
            <p style={{ marginTop: 12, color: textDim, lineHeight: 1.6 }}>{q.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

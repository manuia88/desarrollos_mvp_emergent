// W5.22 Z.8.5 — Social proof · Testimonios grande (carousel hero-size testimonials)
import React, { useEffect, useState } from 'react';

export default function SocialProofTestimoniosGrandeSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const primary = palette.primary || '#22C55E';
  const secondary = palette.secondary || '#3B82F6';
  const grad = palette.gradient || `linear-gradient(135deg, ${primary}, ${secondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.65)';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const sectionPadding = layout.section_padding || '96px 24px';

  const items = config.items && config.items.length ? config.items : [
    { quote: 'El proceso fue transparente · me sentí acompañada de inicio a fin.', author: 'Maria L.', role: 'Familia · Polanco', rating: 5 },
    { quote: 'Datos reales · sin sorpresas. Compré con confianza.', author: 'Carlos R.', role: 'Inversionista · Roma', rating: 5 },
    { quote: 'Encontramos la casa de nuestros sueños y los hijos felices en la nueva escuela.', author: 'Familia Vega', role: 'Familia · Coyoacán', rating: 5 },
  ];

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return undefined;
    const id = setInterval(() => setIdx((p) => (p + 1) % items.length), 5500);
    return () => clearInterval(id);
  }, [items.length]);
  const t = items[idx] || items[0];

  return (
    <section data-testid="sec-testimonios-grande" style={{ padding: sectionPadding, fontFamily: bodyFont, color: text }}>
      <div style={{ maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 18 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} style={{ color: i < (t.rating || 5) ? primary : 'rgba(255,255,255,0.18)', fontSize: 22 }}>★</span>
          ))}
        </div>
        <p style={{ fontFamily: headingFont, fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontStyle: 'italic', lineHeight: 1.45, fontWeight: 600, margin: '0 0 28px' }}>"{t.quote}"</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 9999, background: t.avatar ? `url(${t.avatar}) center/cover` : grad }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{t.author}</div>
            <div style={{ color: textDim, fontSize: 13 }}>{t.role}</div>
          </div>
        </div>
        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 8 }}>
          {items.map((_, i) => (
            <button key={i} type="button" onClick={() => setIdx(i)} aria-label={`testimonial ${i}`} style={{ width: 10, height: 10, borderRadius: 9999, background: i === idx ? primary : 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer' }} />
          ))}
        </div>
      </div>
    </section>
  );
}

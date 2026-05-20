// W5.22 Z.8.5 — Social proof · Social stats (families · satisfaction · rating · testimonios)
import React, { useEffect, useRef, useState } from 'react';

function AnimatedN({ value }) {
  const [n, setN] = useState(0);
  const target = parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    const start = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - start) / 1300);
      setN(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  if (String(value).match(/[^0-9.]/)) return <>{value}</>;
  return <>{Number.isInteger(target) ? Math.round(n) : n.toFixed(1)}</>;
}

const DEFAULT_ITEMS = [
  { label: 'Familias confiaron', data_field: 'families_count', suffix: '+' },
  { label: 'Satisfaccion', data_field: 'satisfaction_pct', suffix: '%' },
  { label: 'Rating Google', data_field: 'google_rating', suffix: ' estrellas' },
  { label: 'Testimonios', data_field: 'testimonials_count', suffix: ' resenas' },
];

export default function SocialProofSocialStatsSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const primary = palette.primary || '#22C55E';
  const secondary = palette.secondary || '#3B82F6';
  const grad = palette.gradient || `linear-gradient(90deg, ${primary}, ${secondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.65)';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const radius = parseInt(layout.border_radius || '16', 10) || 0;
  const sectionPadding = layout.section_padding || '80px 24px';

  const tpl = config.spec_data || {};
  const items = (tpl.social_stats_items && tpl.social_stats_items.length) ? tpl.social_stats_items : DEFAULT_ITEMS;
  const data = config.template_data || tpl.template_data || {};

  return (
    <section data-testid="sec-social-stats" style={{ padding: sectionPadding, fontFamily: bodyFont, color: text }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', textAlign: 'center', margin: '0 0 14px' }}>
          {config.title || 'Las cifras que importan'}
        </h2>
        <p style={{ textAlign: 'center', color: textDim, fontSize: 15, marginBottom: 48 }}>Numeros reales · sin filtros · validados por nuestra comunidad</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {items.map((it, i) => {
            const raw = data[it.data_field] ?? '?';
            return (
              <div key={i} style={{ padding: 36, background: 'rgba(34,197,94,0.08)', border: `1px solid ${primary}33`, borderRadius: radius, textAlign: 'center' }}>
                <div style={{ fontFamily: headingFont, fontSize: 'clamp(2.5rem, 4.5vw, 3.5rem)', fontWeight: 800, background: grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1, letterSpacing: '-0.04em' }}>
                  {it.prefix || ''}<AnimatedN value={raw} />{it.suffix || ''}
                </div>
                <div style={{ marginTop: 14, color: text, fontWeight: 600, fontSize: 14 }}>{it.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

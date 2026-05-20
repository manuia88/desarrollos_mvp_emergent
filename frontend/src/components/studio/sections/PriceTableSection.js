// W5.22 Z.8.3 — PriceTable · theme-driven (default / highlighted-comparison / highlighted-cols)
import React from 'react';

export default function PriceTableSection({ config = {}, brandKit = {}, theme = {}, templateKey, themeMode }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const sectionVariants = theme.section_variants || {};
  const variant = config.layout || sectionVariants.price_table || 'default';

  const tiers = config.tiers || [
    { name: 'Basico', price: '$4.8M', features: ['Tipo 1R', '54m2', 'Roof'], cta: 'Reservar' },
    { name: 'Premium', price: '$7.2M', features: ['Tipo 2R', '88m2', 'Roof + Parking'], cta: 'Reservar', highlight: true },
    { name: 'Penthouse', price: '$12.5M', features: ['PH', '140m2', 'Premium Pack'], cta: 'Consultar' },
  ];
  const themePrimary = palette.primary || brandKit.color_primary || '#6366F1';
  const themeSecondary = palette.secondary || brandKit.color_secondary || '#EC4899';
  const grad = palette.gradient || `linear-gradient(135deg, ${themePrimary}, ${themeSecondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.6)';
  const radius = parseInt(layout.border_radius || '18', 10) || 0;
  const sectionPadding = layout.section_padding || '4rem 1.5rem';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const dataFont = typography.data_font || headingFont;

  // ── highlighted-comparison (investor) · table-style con valores numericos ─
  if (variant === 'highlighted-comparison') {
    return (
      <section data-testid="sec-price-comparison" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1100, margin: '0 auto', fontFamily: bodyFont }}>
        <h2 style={{ fontFamily: headingFont, textAlign: 'center', margin: '0 0 32px', fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: text }}>{config.title || 'Comparativo tipologias'}</h2>
        <div style={{ overflow: 'auto', borderRadius: radius || 8, border: `1px solid ${themePrimary}33` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: text, fontFamily: bodyFont }}>
            <thead>
              <tr style={{ background: 'rgba(59,130,246,0.08)' }}>
                <th style={{ padding: 14, textAlign: 'left', borderBottom: `1px solid ${themePrimary}33`, fontFamily: headingFont, fontSize: 13 }}>Tipologia</th>
                <th style={{ padding: 14, textAlign: 'right', borderBottom: `1px solid ${themePrimary}33`, fontFamily: dataFont, fontSize: 13 }}>Precio</th>
                <th style={{ padding: 14, textAlign: 'left', borderBottom: `1px solid ${themePrimary}33`, fontSize: 13 }}>Caracteristicas</th>
                <th style={{ padding: 14, textAlign: 'center', borderBottom: `1px solid ${themePrimary}33`, fontSize: 13 }}></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={i} style={{ background: t.highlight ? `${themeSecondary}11` : 'transparent', borderTop: i ? `1px solid ${themePrimary}22` : 'none' }}>
                  <td style={{ padding: 14, fontWeight: 700, fontFamily: headingFont }}>{t.highlight ? '★ ' : ''}{t.name}</td>
                  <td style={{ padding: 14, textAlign: 'right', fontFamily: dataFont, color: themeSecondary, fontWeight: 700, fontSize: 16 }}>{t.price}</td>
                  <td style={{ padding: 14, color: textDim, fontSize: 13 }}>{(t.features || []).join(' · ')}</td>
                  <td style={{ padding: 14, textAlign: 'center' }}>
                    <button type="button" style={{ padding: '8px 14px', borderRadius: 6, background: t.highlight ? themeSecondary : 'transparent', color: t.highlight ? '#fff' : themePrimary, border: `1px solid ${t.highlight ? themeSecondary : themePrimary}`, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>{t.cta || 'Ver'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  // ── highlighted-cols (compare) · grid con col destacada border ─────────
  if (variant === 'highlighted-cols') {
    return (
      <section data-testid="sec-price-cols" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1100, margin: '0 auto', fontFamily: bodyFont }}>
        <h2 style={{ fontFamily: headingFont, textAlign: 'center', margin: '0 0 32px', fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: text }}>{config.title || 'Elige tu plan'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))`, gap: 0, border: `1px solid ${themePrimary}33`, borderRadius: radius || 12, overflow: 'hidden' }}>
          {tiers.map((t, i) => (
            <div key={i} data-testid={`price-tier-${i}`} style={{ padding: 28, background: t.highlight ? grad : 'rgba(13,16,23,0.4)', color: t.highlight ? '#fff' : text, borderRight: i < tiers.length - 1 ? `1px solid ${themePrimary}33` : 'none', position: 'relative' }}>
              {t.highlight && <div style={{ position: 'absolute', top: 10, right: 10, padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.18)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>POPULAR</div>}
              <h3 style={{ margin: 0, fontFamily: headingFont, fontSize: 18 }}>{t.name}</h3>
              <div style={{ fontFamily: dataFont, fontSize: 32, fontWeight: 800, margin: '14px 0' }}>{t.price}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'grid', gap: 8 }}>
                {(t.features || []).map((f, j) => (
                  <li key={j} style={{ fontSize: 13, opacity: 0.95 }}>✓ {f}</li>
                ))}
              </ul>
              <button type="button" style={{ width: '100%', padding: '10px 16px', borderRadius: 6, background: t.highlight ? '#fff' : 'transparent', color: t.highlight ? themePrimary : text, border: `1px solid ${t.highlight ? '#fff' : themePrimary}55`, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{t.cta || 'Reservar'}</button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── default (modern) · card grid con highlight gradient ────────────────
  return (
    <section data-testid="sec-price-table" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1100, margin: '0 auto', fontFamily: bodyFont }}>
      <h2 style={{ fontFamily: headingFont, textAlign: 'center', margin: '0 0 32px', fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: text }}>{config.title || 'Selecciona tu tipologia'}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))`, gap: 18 }}>
        {tiers.map((t, i) => (
          <div key={i} data-testid={`price-tier-${i}`} style={{ position: 'relative', padding: 28, borderRadius: radius || 18, background: t.highlight ? grad : 'rgba(13,16,23,0.6)', border: t.highlight ? 'none' : `1px solid ${themePrimary}33`, color: t.highlight ? '#fff' : text }}>
            {t.highlight && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', padding: '4px 12px', borderRadius: 9999, background: '#fff', color: '#111', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>POPULAR</div>}
            <h3 style={{ margin: 0, fontFamily: headingFont, fontSize: 20 }}>{t.name}</h3>
            <div style={{ fontFamily: dataFont, fontSize: 36, fontWeight: 800, margin: '12px 0' }}>{t.price}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'grid', gap: 8 }}>
              {(t.features || []).map((f, j) => (
                <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, opacity: t.highlight ? 1 : 0.85 }}>
                  <span style={{ color: t.highlight ? '#fff' : themePrimary }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button type="button" style={{ width: '100%', padding: '12px 20px', borderRadius: 9999, background: t.highlight ? '#fff' : grad, color: t.highlight ? '#111' : '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{t.cta || 'Reservar'}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

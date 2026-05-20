// W5.22 Z.8.3 — PropertyShowcase · theme-aware
import React from 'react';

export default function PropertyShowcaseSection({ config = {}, brandKit = {}, linkedEntity, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};

  const dev = linkedEntity?.type === 'development' ? linkedEntity : null;
  const showFeatures = config.show_features_grid !== false;
  const showProgress = config.show_units_progress !== false;
  const show3DGS = config.show_3dgs_link === true;

  const themePrimary = palette.primary || brandKit.color_primary || '#6366F1';
  const themeSecondary = palette.secondary || brandKit.color_secondary || '#EC4899';
  const grad = palette.gradient || `linear-gradient(90deg, ${themePrimary}, ${themeSecondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.62)';
  const radius = parseInt(layout.border_radius || '20', 10) || 0;
  const sectionPadding = layout.section_padding || '4rem 1.5rem';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const dataFont = typography.data_font || headingFont;

  const amenities = dev?.amenities || ['Roof garden', 'Coworking', 'Gym', 'Pet area', 'Concierge', 'Seguridad 24/7'];
  const priceFrom = dev?.price_from ? `$${(dev.price_from / 1_000_000).toFixed(1)}M` : '$4.8M';

  return (
    <section data-testid="sec-property-showcase" style={{ padding: sectionPadding, maxWidth: 1200, margin: '0 auto', fontFamily: bodyFont }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'center' }}>
        <div style={{ aspectRatio: '16/10', borderRadius: radius, background: dev?.images?.[0] ? `url(${dev.images[0]}) center/cover` : grad, opacity: dev?.images?.[0] ? 1 : 0.5 }} />
        <div>
          <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 9999, background: grad, color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 16, fontFamily: dataFont }}>Desde {priceFrom} MXN</div>
          <h2 style={{ margin: 0, fontFamily: headingFont, fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: text }}>{dev?.name || 'Proyecto destacado'}</h2>
          <p style={{ color: textDim, margin: '8px 0 0' }}>{dev?.colonia} {dev?.alcaldia ? `· ${dev.alcaldia}` : ''}</p>
          {showFeatures && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginTop: 22 }}>
              {amenities.slice(0, 6).map((a, i) => (
                <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: `${themePrimary}14`, border: `1px solid ${themePrimary}33`, fontSize: 13, color: text }}>{a}</div>
              ))}
            </div>
          )}
          {showProgress && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: textDim, marginBottom: 6 }}>
                <span>Unidades disponibles</span>
                <span style={{ fontFamily: dataFont }}>32%</span>
              </div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ width: '68%', height: '100%', background: grad }} />
              </div>
            </div>
          )}
          {show3DGS && (
            <a data-testid="property-3dgs-link" href={`/embed/3dgs/${dev?.id || 'demo'}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 20, padding: '10px 18px', borderRadius: 9999, background: `${themePrimary}1f`, color: text, textDecoration: 'none', border: `1px solid ${themePrimary}55`, fontSize: 13 }}>Tour 3D Gaussian Splatting →</a>
          )}
        </div>
      </div>
    </section>
  );
}

// W5.22 Z.8.3 — Map · theme-driven Mapbox embed con fallback gradient
import React from 'react';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';

export default function MapSection({ config = {}, brandKit = {}, linkedEntity, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};

  const lat = config.lat ?? linkedEntity?.lat ?? 19.4326;
  const lng = config.lng ?? linkedEntity?.lng ?? -99.1332;
  const zoom = config.zoom || 15;
  const label = config.marker_label || linkedEntity?.name || 'Aqui estamos';

  const themePrimary = palette.primary || brandKit.color_primary || '#6366F1';
  const themeSecondary = palette.secondary || brandKit.color_secondary || '#EC4899';
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.62)';
  const radius = parseInt(layout.border_radius || '20', 10) || 0;
  const sectionPadding = layout.section_padding || '4rem 1.5rem';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";

  return (
    <section data-testid="sec-map" style={{ padding: sectionPadding, maxWidth: 1200, margin: '0 auto', fontFamily: bodyFont }}>
      <h2 style={{ fontFamily: headingFont, fontSize: 'clamp(1.5rem, 3vw, 2rem)', margin: '0 0 12px', color: text }}>Ubicacion</h2>
      <p style={{ color: textDim, margin: '0 0 24px' }}>{label}</p>
      <div style={{ aspectRatio: '16/9', borderRadius: radius, overflow: 'hidden', background: `linear-gradient(135deg, ${themePrimary}33, ${themeSecondary}33)`, position: 'relative' }}>
        {MAPBOX_TOKEN ? (
          <iframe
            data-testid="map-mapbox"
            title="map"
            width="100%"
            height="100%"
            src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11.html?title=false&access_token=${MAPBOX_TOKEN}&zoomwheel=false#${zoom}/${lat}/${lng}`}
            style={{ border: 0, width: '100%', height: '100%' }}
          />
        ) : (
          <div data-testid="map-fallback" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8, color: themePrimary }}>◉</div>
              <div style={{ color: text, fontSize: 13 }}>Lat {Number(lat).toFixed(4)} · Lng {Number(lng).toFixed(4)}</div>
              <div style={{ fontSize: 11, color: textDim, marginTop: 8 }}>Configura REACT_APP_MAPBOX_TOKEN para mapa interactivo</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

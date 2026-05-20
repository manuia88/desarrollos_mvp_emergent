// W5.22 Z.8.2 — Map: Mapbox embed con fallback gradient
import React from 'react';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';

export default function MapSection({ config = {}, brandKit = {}, linkedEntity }) {
  const lat = config.lat ?? linkedEntity?.lat ?? 19.4326;
  const lng = config.lng ?? linkedEntity?.lng ?? -99.1332;
  const zoom = config.zoom || 15;
  const label = config.marker_label || linkedEntity?.name || 'Aqui estamos';
  const primary = brandKit.color_primary || '#6366F1';
  const secondary = brandKit.color_secondary || '#EC4899';

  return (
    <section data-testid="sec-map" style={{ padding: '4rem 1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(1.5rem, 3vw, 2rem)', margin: '0 0 12px' }}>Ubicacion</h2>
      <p style={{ color: 'rgba(240,235,224,0.62)', margin: '0 0 24px' }}>{label}</p>
      <div style={{ aspectRatio: '16/9', borderRadius: 20, overflow: 'hidden', background: `linear-gradient(135deg, ${primary}33, ${secondary}33)`, position: 'relative' }}>
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
              <div style={{ fontSize: 36, marginBottom: 8 }}>◉</div>
              <div style={{ color: 'rgba(240,235,224,0.7)', fontSize: 13 }}>Lat {lat.toFixed(4)} · Lng {lng.toFixed(4)}</div>
              <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.4)', marginTop: 8 }}>Configura REACT_APP_MAPBOX_TOKEN para mapa interactivo</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

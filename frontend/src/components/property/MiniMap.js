// MiniMap — small Mapbox map centered on a property with a single marker
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

export default function MiniMap({ center, label }) {
  const ref = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!TOKEN || !ref.current || mapRef.current || !center) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center,
      zoom: 14,
      attributionControl: false,
      interactive: true,
    });
    mapRef.current = map;

    const el = document.createElement('div');
    el.style.width = '18px';
    el.style.height = '18px';
    el.style.borderRadius = '9999px';
    el.style.background = 'linear-gradient(135deg, #6366F1, #EC4899)';
    el.style.border = '2px solid #fff';
    el.style.boxShadow = '0 0 12px rgba(99,102,241,0.8)';
    new mapboxgl.Marker({ element: el }).setLngLat(center).addTo(map);

    return () => { map.remove(); mapRef.current = null; };
  }, [center]);

  if (!TOKEN) {
    return (
      <div style={{
        height: 220, borderRadius: 16,
        background: '#0D1118', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
      }}>
        mapa no disponible
      </div>
    );
  }

  return (
    <div
      data-testid="mini-map"
      ref={ref}
      aria-label={label}
      style={{ height: 220, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}
    />
  );
}

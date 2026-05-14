// W2.5 SA6 — Mapbox heatmap with metric-colored dots (size~units_count)
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

// Linear color scale: low=indigo, high=pink (matches gradient)
function valueToColor(v, min, max) {
  if (v == null || max <= min) return 'var(--theme)';
  const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
  // Interpolate var(--theme) -> var(--theme)
  const r1 = 0x63, g1 = 0x66, b1 = 0xF1;
  const r2 = 0xEC, g2 = 0x48, b2 = 0x99;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

export default function CubeHeatmap({ points, metric, onDrill }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(false);

  // Init map once
  useEffect(() => {
    if (!TOKEN || !ref.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-99.1332, 19.4326], // CDMX
      zoom: 10.5,
      attributionControl: false,
      interactive: true,
    });
    mapRef.current = map;
    map.on('load', () => setReady(true));
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Re-render markers when points change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!points || points.length === 0) return;

    const vals = points.map(p => p.value).filter(v => v != null);
    const minV = vals.length ? Math.min(...vals) : 0;
    const maxV = vals.length ? Math.max(...vals) : 1;
    const unitsArr = points.map(p => p.units_total || 0);
    const maxUnits = Math.max(...unitsArr, 1);

    points.forEach(pt => {
      const el = document.createElement('div');
      const sz = Math.max(14, Math.min(40, 12 + (pt.units_total || 0) / maxUnits * 28));
      el.style.width = `${sz}px`;
      el.style.height = `${sz}px`;
      el.style.borderRadius = '9999px';
      el.style.background = valueToColor(pt.value, minV, maxV);
      el.style.border = '2px solid rgba(255,255,255,0.85)';
      el.style.boxShadow = '0 0 8px rgba(0,0,0,0.55)';
      el.style.cursor = 'pointer';
      el.style.transition = 'transform 180ms';
      el.setAttribute('data-testid', `cube-heatmap-dot-${pt.tier_id}`);
      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.15)'; });
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

      const popup = new mapboxgl.Popup({ offset: 14, closeButton: false, className: 'cube-popup' })
        .setHTML(`
          <div style="font-family:DM Sans;color:#06080F;padding:6px 4px;min-width:160px;">
            <div style="font-weight:700;font-size:12.5px;margin-bottom:3px;">${pt.name}</div>
            <div style="font-family:DM Mono,monospace;font-size:10.5px;color:#444;">
              ${metric}: <strong>${pt.value != null ? pt.value.toLocaleString('es-MX') : '—'}</strong>
            </div>
            <div style="font-family:DM Mono,monospace;font-size:10.5px;color:#444;">
              unidades: <strong>${pt.units_total || 0}</strong>
            </div>
          </div>
        `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([pt.lng, pt.lat])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onDrill) onDrill(pt);
      });

      markersRef.current.push(marker);
    });

    // Fit bounds
    if (points.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      points.forEach(p => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 13.5, duration: 600 });
    } else if (points.length === 1) {
      map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 14, duration: 600 });
    }
  }, [points, metric, ready, onDrill]);

  if (!TOKEN) {
    return (
      <div data-testid="cube-heatmap-no-token" style={{
        height: 500, borderRadius: 14, background: '#0D1118',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)',
      }}>
        Mapa no disponible · falta REACT_APP_MAPBOX_TOKEN
      </div>
    );
  }

  return (
    <div
      data-testid="cube-heatmap"
      ref={ref}
      style={{
        height: 500, borderRadius: 14, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    />
  );
}

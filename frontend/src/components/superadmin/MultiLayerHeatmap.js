// W2.9 Phase Z.2 — Multi-layer Mapbox heatmap (price · demand · risk · supply)
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

// Color schemes per layer (low → high)
const SCHEMES = {
  price:  { from: [99, 102, 241],  to: [236, 72, 153],  label: 'Precio' },   // indigo→rose
  demand: { from: [74, 222, 128],  to: [251, 191, 36],  label: 'Demanda' },  // green→amber
  risk:   { from: [59, 130, 246],  to: [239, 68, 68],   label: 'Riesgo' },   // blue→red
  supply: { from: [34, 211, 238],  to: [168, 85, 247],  label: 'Oferta' },   // cyan→purple
};

function valueToColor(scheme, v, min, max) {
  if (v == null || max <= min) return `rgb(${scheme.from.join(',')})`;
  const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
  const r = Math.round(scheme.from[0] + (scheme.to[0] - scheme.from[0]) * t);
  const g = Math.round(scheme.from[1] + (scheme.to[1] - scheme.from[1]) * t);
  const b = Math.round(scheme.from[2] + (scheme.to[2] - scheme.from[2]) * t);
  return `rgb(${r},${g},${b})`;
}

export default function MultiLayerHeatmap({ data, activeLayers, onZoneClick }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!TOKEN || !ref.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-99.1332, 19.4326],
      zoom: 10.5,
      attributionControl: false,
      interactive: true,
    });
    mapRef.current = map;
    map.on('load', () => setReady(true));
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!data || !data.layers) return;

    // Iterate active layers; stack markers with offsets for overlap clarity
    const layerOrder = ['price', 'supply', 'demand', 'risk'].filter((k) => activeLayers.includes(k));
    layerOrder.forEach((layerKey, layerIdx) => {
      const layer = data.layers[layerKey];
      if (!layer || layer.available === false || !layer.items || layer.items.length === 0) return;
      const scheme = SCHEMES[layerKey];
      const vals = layer.items.map((p) => p.value).filter((v) => v != null);
      const minV = vals.length ? Math.min(...vals) : 0;
      const maxV = vals.length ? Math.max(...vals) : 1;

      layer.items.forEach((pt) => {
        const el = document.createElement('div');
        const sz = layerIdx === 0 ? 22 : 16; // primary layer larger
        el.style.width = `${sz}px`;
        el.style.height = `${sz}px`;
        el.style.borderRadius = '9999px';
        el.style.background = valueToColor(scheme, pt.value, minV, maxV);
        el.style.border = `2px solid ${layerIdx === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)'}`;
        el.style.boxShadow = layerIdx === 0 ? '0 0 6px rgba(0,0,0,0.55)' : '0 0 3px rgba(0,0,0,0.35)';
        el.style.cursor = 'pointer';
        el.style.transition = 'transform 180ms';
        el.style.opacity = layerIdx === 0 ? '1' : '0.7';
        el.setAttribute('data-testid', `intel-heatmap-dot-${layerKey}-${pt.zone_id}`);

        el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.15)'; });
        el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

        const popup = new mapboxgl.Popup({ offset: 14, closeButton: false })
          .setHTML(`
            <div style="font-family:DM Sans;color:#06080F;padding:6px 4px;min-width:170px;">
              <div style="font-weight:700;font-size:12.5px;margin-bottom:3px;">${pt.name || pt.zone_id}</div>
              <div style="font-family:DM Mono,monospace;font-size:10.5px;color:#444;">
                ${scheme.label}: <b>${pt.value}</b>
              </div>
              <div style="font-family:DM Mono,monospace;font-size:10px;color:#888;margin-top:3px;">
                Click para análisis
              </div>
            </div>`);

        const offsetLng = (layerIdx % 2 === 0 ? 1 : -1) * 0.0008 * Math.floor(layerIdx / 2 + 1);
        const offsetLat = (layerIdx >= 2 ? 1 : -1) * 0.0008 * Math.floor(layerIdx / 2 + 1);
        const m = new mapboxgl.Marker(el)
          .setLngLat([pt.lng + offsetLng, pt.lat + offsetLat])
          .setPopup(popup)
          .addTo(map);

        el.addEventListener('click', () => { onZoneClick && onZoneClick(pt); });
        markersRef.current.push(m);
      });
    });
  }, [data, activeLayers, ready, onZoneClick]);

  if (!TOKEN) {
    return (
      <div data-testid="intel-heatmap-no-token" style={{
        height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.02)',
        fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)',
      }}>
        REACT_APP_MAPBOX_TOKEN no configurado.
      </div>
    );
  }

  return (
    <div data-testid="intel-multi-heatmap" ref={ref} style={{
      height: 600, borderRadius: 14, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.10)',
    }} />
  );
}

export { SCHEMES };

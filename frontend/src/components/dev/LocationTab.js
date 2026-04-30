// Tab 5 — Localización: Mapbox + POI toggles + walking/driving times (gated)
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Lock, Leaf, Shield, Route, Store } from '../icons';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const POI_CATEGORIES = [
  { k: 'schools', label: 'Escuelas', color: '#22C55E' },
  { k: 'hospitals', label: 'Hospitales', color: '#EC4899' },
  { k: 'metro', label: 'Metro', color: '#F59E0B' },
  { k: 'parks', label: 'Parques', color: '#10B981' },
  { k: 'supermarkets', label: 'Super', color: '#A78BFA' },
];

// Deterministic POI offsets around dev center (Math.random-free for stability)
function poiFor(center, cat) {
  const [lng, lat] = center;
  const count = 5;
  const rotations = { schools: 0, hospitals: 72, metro: 144, parks: 216, supermarkets: 288 };
  const rot = rotations[cat.k] || 0;
  const r = 0.005;
  return Array.from({ length: count }, (_, i) => {
    const angle = (rot + i * 36) * Math.PI / 180;
    return { lng: lng + Math.cos(angle) * r * (0.6 + (i % 3) * 0.25), lat: lat + Math.sin(angle) * r * (0.6 + (i % 3) * 0.25) };
  });
}

// Deterministic landmark times (stable per dev)
function landmarkTimesFor(id) {
  const h = [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
  return [
    { name: 'Reforma', walk: 20 + (h % 18), drive: 8 + (h % 10) },
    { name: 'Aeropuerto', walk: null, drive: 18 + (h % 20) },
    { name: 'Centro Histórico', walk: 28 + (h % 22), drive: 12 + (h % 12) },
  ];
}

export default function LocationTab({ dev, user, onGateOpen }) {
  const { t } = useTranslation();
  const container = useRef(null);
  const mapRef = useRef(null);
  const [active, setActive] = useState({ schools: true, metro: true, parks: true, hospitals: false, supermarkets: false });

  useEffect(() => {
    if (!TOKEN || !container.current || mapRef.current || !dev.center) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: dev.center,
      zoom: 14,
    });
    mapRef.current = map;

    const markerEl = document.createElement('div');
    markerEl.style.width = '26px';
    markerEl.style.height = '26px';
    markerEl.style.borderRadius = '9999px';
    markerEl.style.background = 'linear-gradient(135deg, #6366F1, #EC4899)';
    markerEl.style.border = '3px solid #fff';
    markerEl.style.boxShadow = '0 0 16px rgba(99,102,241,0.8)';
    new mapboxgl.Marker({ element: markerEl }).setLngLat(dev.center).addTo(map);

    return () => { map.remove(); mapRef.current = null; };
  }, [dev.center]);

  // Manage POI layers
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const applyLayer = () => {
      POI_CATEGORIES.forEach(cat => {
        const srcId = `poi-${cat.k}`;
        const lyrId = `poi-layer-${cat.k}`;
        const visible = active[cat.k];
        if (!m.getSource(srcId)) {
          if (!visible) return;
          const points = poiFor(dev.center, cat);
          m.addSource(srcId, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: points.map(p => ({
                type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { cat: cat.k },
              })),
            },
          });
          m.addLayer({
            id: lyrId, type: 'circle', source: srcId,
            paint: {
              'circle-color': cat.color,
              'circle-radius': 7,
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2,
            },
          });
        } else {
          if (m.getLayer(lyrId)) m.setLayoutProperty(lyrId, 'visibility', visible ? 'visible' : 'none');
        }
      });
    };

    if (m.isStyleLoaded()) applyLayer();
    else m.once('load', applyLayer);
  }, [active, dev.center]);

  const landmarks = landmarkTimesFor(dev.id);

  return (
    <div data-testid="location-tab" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Address */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>{t('dev.location_h')}</div>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)' }}>
          {dev.address_full}
        </div>
      </div>

      {/* POI toggles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {POI_CATEGORIES.map(cat => {
          const act = active[cat.k];
          return (
            <button key={cat.k}
              data-testid={`poi-toggle-${cat.k}`}
              onClick={() => setActive(a => ({ ...a, [cat.k]: !a[cat.k] }))}
              style={{
                padding: '7px 14px', borderRadius: 9999,
                background: act ? cat.color + '22' : 'var(--bg-3)',
                border: `1px solid ${act ? cat.color + '60' : 'var(--border)'}`,
                color: act ? cat.color : 'var(--cream-3)',
                fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <span style={{ width: 7, height: 7, borderRadius: 9999, background: cat.color }} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Map */}
      {!TOKEN ? (
        <div style={{ height: 420, borderRadius: 16, background: '#0D1118', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans', color: 'var(--cream-3)' }}>
          {t('mapa.token_missing')}
        </div>
      ) : (
        <div ref={container} data-testid="loc-map"
          style={{ height: 420, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }} />
      )}

      {/* Landmark times */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{t('dev.landmarks_h')}</div>
        {user ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }} className="land-grid">
            {landmarks.map(l => (
              <div key={l.name} style={{
                padding: 14, background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)', borderRadius: 12,
              }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 6 }}>{l.name}</div>
                <div style={{ display: 'flex', gap: 12, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                  {l.walk !== null && <span><Route size={10} color="var(--cream-3)" /> {l.walk} min a pie</span>}
                  <span><Route size={10} color="var(--cream-3)" /> {l.drive} min en auto</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <button onClick={() => onGateOpen(t('dev.gate_context_landmarks'))} data-testid="gate-open-from-landmarks"
            style={{
              padding: 18, width: '100%',
              background: 'rgba(99,102,241,0.06)',
              border: '1px dashed rgba(99,102,241,0.30)',
              borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              fontFamily: 'DM Sans', fontSize: 13, color: 'var(--indigo-3)',
              cursor: 'pointer',
            }}>
            <Lock size={14} color="var(--indigo-3)" />
            {t('dev.landmarks_gated')}
          </button>
        )}
      </div>

      <style>{`@media (max-width: 700px) { .land-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

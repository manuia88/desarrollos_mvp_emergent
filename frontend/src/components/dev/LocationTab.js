// Tab 5 — Localización: Mapbox + POI toggles + walking/driving times (gated)
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Lock, Leaf, Shield, Route, Store } from '../icons';
import { tc } from '../../lib/titleCase';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const POI_CATEGORIES = [
  { k: 'schools', label: 'Escuelas', color: '#22C55E' },
  { k: 'hospitals', label: 'Hospitales', color: 'var(--theme-3)' },
  { k: 'metro', label: 'Metro', color: 'var(--amber)' },
  { k: 'parks', label: 'Parques', color: '#10B981' },
  { k: 'supermarkets', label: 'Super', color: '#A78BFA' },
];

// Distancia REAL (línea recta, haversine) del desarrollo a hitos de CDMX — antes eran tiempos inventados (hash del id).
function landmarkDistancesFor(center) {
  const [lng, lat] = center || [-99.17, 19.42];
  const LM = [
    { name: 'Paseo de la Reforma', lng: -99.1677, lat: 19.4270 },
    { name: 'Centro Histórico', lng: -99.1332, lat: 19.4326 },
    { name: 'Aeropuerto (AICM)', lng: -99.0721, lat: 19.4361 },
  ];
  const km = (b) => {
    const R = 6371, dLat = (b.lat - lat) * Math.PI / 180, dLng = (b.lng - lng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };
  return LM.map((l) => ({ name: l.name, km: km(l) }));
}

export default function LocationTab({ dev, user, onGateOpen }) {
  const { t } = useTranslation();
  const container = useRef(null);
  const mapRef = useRef(null);
  const [active, setActive] = useState({ schools: true, metro: true, parks: true, hospitals: false, supermarkets: false });
  // Lugares REALES de la colonia (Google Places) — antes se inventaban posiciones (poiFor) y tiempos (hash). Ya no.
  const [lugares, setLugares] = useState({});
  useEffect(() => {
    const cid = dev.colonia_id || dev.colonia;
    if (!cid) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/zona/${encodeURIComponent(cid)}/lugares`)
      .then((r) => r.json()).then((d) => setLugares(d?.lugares || {})).catch(() => {});
  }, [dev.colonia_id, dev.colonia]);
  const CAT_MAP = { schools: 'escuela', hospitals: 'hospital', metro: 'transporte', parks: 'parque', supermarkets: 'supermercado' };
  const realPois = (catK) => (lugares[CAT_MAP[catK]] || []).filter((p) => p.loc && p.loc.latitude && p.loc.longitude);

  useEffect(() => {
    if (!TOKEN || !container.current || mapRef.current || !dev.center) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: dev.center,
      zoom: 14,
    });
    mapRef.current = map;

    const markerEl = document.createElement('div');
    markerEl.style.width = '26px';
    markerEl.style.height = '26px';
    markerEl.style.borderRadius = '9999px';
    markerEl.style.background = 'linear-gradient(135deg, var(--theme), var(--theme-3))';
    markerEl.style.border = '3px solid #fff';
    markerEl.style.boxShadow = '0 0 16px rgba(var(--theme-rgb),0.8)';
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
        const pts = realPois(cat.k);   // lugares REALES de Google (con coordenadas), no posiciones inventadas
        if (!m.getSource(srcId)) {
          if (!visible || !pts.length) return;
          m.addSource(srcId, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: pts.map(p => ({
                type: 'Feature', geometry: { type: 'Point', coordinates: [p.loc.longitude, p.loc.latitude] }, properties: { cat: cat.k, name: p.name || '' },
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
  }, [active, dev.center, lugares]);

  const landmarks = landmarkDistancesFor(dev.center);

  return (
    <div data-testid="location-tab" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Address */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>{tc(t('dev.location_h'))}</div>
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
              {cat.label}{realPois(cat.k).length ? <span style={{ opacity: 0.7, fontWeight: 700 }}> · {realPois(cat.k).length}</span> : null}
            </button>
          );
        })}
      </div>

      {/* Map */}
      {!TOKEN ? (
        <div style={{ height: 420, borderRadius: 16, background: 'rgba(var(--theme-rgb),0.04)', border: '1px dashed var(--card-border, var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans', color: 'var(--cream-3)' }}>
          {t('mapa.token_missing')}
        </div>
      ) : (
        <div ref={container} data-testid="loc-map"
          style={{ height: 420, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }} />
      )}

      {/* Landmark times */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{tc(t('dev.landmarks_h'))}</div>
        {user ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }} className="land-grid">
            {landmarks.map(l => (
              <div key={l.name} style={{
                padding: 14, background: 'rgba(var(--cream-rgb),0.03)',
                border: '1px solid var(--border)', borderRadius: 12,
              }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 6 }}>{l.name}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                  <Route size={11} color="var(--cream-3)" /> a <b style={{ color: 'var(--cream)' }}>{l.km < 1 ? `${Math.round(l.km * 1000)} m` : `${l.km.toFixed(1)} km`}</b> en línea recta
                </div>
              </div>
            ))}
          </div>
        ) : (
          <button onClick={() => onGateOpen(t('dev.gate_context_landmarks'))} data-testid="gate-open-from-landmarks"
            style={{
              padding: 18, width: '100%',
              background: 'rgba(var(--theme-rgb),0.06)',
              border: '1px dashed rgba(var(--theme-rgb),0.30)',
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

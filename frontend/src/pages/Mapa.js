// Mapa page — Mapbox GL JS with CDMX colonia polygons colored by IE Score + heatmap toggle
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Navbar from '../components/landing/Navbar';
import { fetchColonias } from '../api/marketplace';
import { X, ArrowRight } from '../components/icons';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

// IE composite = mean of 6 sub-scores
function composite(c) {
  const k = ['movilidad', 'seguridad', 'comercio', 'plusvalia', 'educacion', 'riesgo'];
  const sum = k.reduce((s, x) => s + (c.scores?.[x] || 0), 0);
  return Math.round(sum / k.length);
}

function colorFromScore(score) {
  // 0..100 -> red -> amber -> green
  const pct = Math.max(0, Math.min(100, score)) / 100;
  if (pct < 0.5) {
    const r = 239, g = Math.round(68 + (158 * pct * 2)), b = 68;
    return `rgb(${r},${g},${b})`;
  }
  const local = (pct - 0.5) * 2;
  const r = Math.round(245 - 211 * local), g = Math.round(158 + 39 * local), b = Math.round(11 + 83 * local);
  return `rgb(${r},${g},${b})`;
}

function buildGeoJSON(colonias) {
  return {
    type: 'FeatureCollection',
    features: colonias.map(c => ({
      type: 'Feature',
      properties: {
        id: c.id,
        name: c.name,
        alcaldia: c.alcaldia,
        ie_score: composite(c),
        price_m2: c.price_m2,
        color: colorFromScore(composite(c)),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[...c.polygon, c.polygon[0]]],
      },
    })),
  };
}

function buildCentersGeoJSON(colonias) {
  return {
    type: 'FeatureCollection',
    features: colonias.map(c => ({
      type: 'Feature',
      properties: { name: c.name, price_m2: c.price_m2 },
      geometry: { type: 'Point', coordinates: c.center },
    })),
  };
}

export default function Mapa({ user, onLogin, onLogout }) {
  const { t } = useTranslation();
  const mapRef = useRef(null);
  const container = useRef(null);
  const [colonias, setColonias] = useState([]);
  const [coloniaById, setColoniaById] = useState({});
  const [layer, setLayer] = useState('ie'); // 'ie' or 'heat'
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchColonias().then(list => {
      setColonias(list);
      const m = {}; list.forEach(c => { m[c.id] = c; });
      setColoniaById(m);
    });
  }, []);

  useEffect(() => {
    if (!TOKEN || !container.current || mapRef.current || colonias.length === 0) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-99.17, 19.41],
      zoom: 11.2,
    });
    mapRef.current = map;

    map.on('load', () => {
      // Polygons source + layers
      map.addSource('colonias', { type: 'geojson', data: buildGeoJSON(colonias) });

      map.addLayer({
        id: 'colonias-fill',
        type: 'fill',
        source: 'colonias',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.55,
        },
      });
      map.addLayer({
        id: 'colonias-outline',
        type: 'line',
        source: 'colonias',
        paint: {
          'line-color': '#F0EBE0',
          'line-width': 1,
          'line-opacity': 0.4,
        },
      });
      map.addLayer({
        id: 'colonias-labels',
        type: 'symbol',
        source: 'colonias',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': '#F0EBE0',
          'text-halo-color': '#06080F',
          'text-halo-width': 1,
        },
      });

      // Heatmap source (centers weighted by price_m2)
      map.addSource('centers', { type: 'geojson', data: buildCentersGeoJSON(colonias) });
      map.addLayer({
        id: 'price-heat',
        type: 'heatmap',
        source: 'centers',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'price_m2'],
            30, 0.2, 70, 0.6, 110, 1.0,
          ],
          'heatmap-radius': 70,
          'heatmap-opacity': 0.75,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(6,8,15,0)',
            0.2, 'rgba(99,102,241,0.4)',
            0.5, 'rgba(236,72,153,0.6)',
            0.9, 'rgba(245,158,11,0.85)',
            1, 'rgba(239,68,68,0.9)',
          ],
        },
      });

      // Click handler
      map.on('click', 'colonias-fill', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties.id;
        setSelected(id);
        const c = coloniaById[id];
        if (c) map.flyTo({ center: c.center, zoom: 13.2, duration: 700 });
      });
      map.on('mouseenter', 'colonias-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'colonias-fill', () => { map.getCanvas().style.cursor = ''; });
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [colonias, coloniaById]);

  // Toggle layers
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded || !m.isStyleLoaded()) return;
    const setVis = (id, vis) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis);
    };
    if (layer === 'ie') {
      setVis('colonias-fill', 'visible');
      setVis('colonias-outline', 'visible');
      setVis('colonias-labels', 'visible');
      setVis('price-heat', 'none');
    } else {
      setVis('colonias-fill', 'none');
      setVis('colonias-outline', 'visible');
      setVis('colonias-labels', 'visible');
      setVis('price-heat', 'visible');
    }
  }, [layer]);

  const selectedColonia = selected ? coloniaById[selected] : null;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
      <main style={{ paddingTop: 60, position: 'relative', height: 'calc(100vh - 60px)' }}>
        {!TOKEN && (
          <div style={{
            position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
            zIndex: 30, padding: '14px 20px',
            background: 'rgba(239,68,68,0.14)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 12, fontFamily: 'DM Sans', fontSize: 13, color: '#fca5a5',
          }} data-testid="mapbox-token-missing">
            {t('mapa.token_missing')}
          </div>
        )}
        <div ref={container} style={{ position: 'absolute', inset: 0 }} data-testid="mapa-container" />

        {/* Floating header */}
        <div style={{
          position: 'absolute', top: 20, left: 20, zIndex: 10,
          padding: '14px 18px',
          background: 'rgba(6,8,15,0.85)',
          border: '1px solid var(--border-2)',
          backdropFilter: 'blur(18px)',
          borderRadius: 16,
          maxWidth: 360,
        }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t('mapa.page_title')}</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em', marginBottom: 6 }}>
            {t('mapa.h1')}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', lineHeight: 1.5 }}>
            {t('mapa.sub')}
          </div>
        </div>

        {/* Layer toggle */}
        <div style={{
          position: 'absolute', top: 20, right: 20, zIndex: 10,
          display: 'flex', gap: 6, padding: 4,
          background: 'rgba(6,8,15,0.85)',
          border: '1px solid var(--border-2)',
          backdropFilter: 'blur(18px)',
          borderRadius: 9999,
        }}>
          {[
            { k: 'ie', label: t('mapa.layer_ie') },
            { k: 'heat', label: t('mapa.layer_heat') },
          ].map(l => {
            const active = layer === l.k;
            return (
              <button key={l.k}
                onClick={() => setLayer(l.k)}
                data-testid={`layer-toggle-${l.k}`}
                style={{
                  padding: '7px 14px', borderRadius: 9999,
                  background: active ? 'var(--grad)' : 'transparent',
                  color: active ? '#fff' : 'var(--cream-3)',
                  border: 'none',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                  cursor: 'pointer',
                }}>
                {l.label}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 20, left: 20, zIndex: 10,
          padding: '12px 16px',
          background: 'rgba(6,8,15,0.85)',
          border: '1px solid var(--border-2)',
          backdropFilter: 'blur(18px)',
          borderRadius: 14,
        }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t('mapa.legend_score')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 140, height: 8, borderRadius: 9999,
              background: 'linear-gradient(to right, rgb(239,68,68), rgb(245,158,11), rgb(34,197,94))',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 140, fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', position: 'absolute', bottom: 14, left: 16 }}>
              <span>0</span><span>50</span><span>100</span>
            </div>
          </div>
        </div>

        {/* Side panel for selected colonia */}
        {selectedColonia && (
          <div
            data-testid="colonia-side-panel"
            style={{
              position: 'absolute', top: 140, right: 20, zIndex: 11,
              width: 340, maxHeight: 'calc(100% - 180px)', overflowY: 'auto',
              padding: 22,
              background: 'rgba(6,8,15,0.95)',
              border: '1px solid var(--border-2)',
              backdropFilter: 'blur(18px)',
              borderRadius: 18,
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>{selectedColonia.alcaldia}</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                  {selectedColonia.name}
                </div>
              </div>
              <button onClick={() => setSelected(null)} data-testid="close-panel"
                style={{
                  width: 28, height: 28, borderRadius: 9999,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-2)',
                  color: 'var(--cream-3)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <X size={12} />
              </button>
            </div>

            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 48, lineHeight: 1,
              background: 'var(--grad)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              letterSpacing: '-0.03em', marginBottom: 2,
            }}>
              {composite(selectedColonia)}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginBottom: 16 }}>
              {t('mapa.legend_score')} · DMX
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[
                { k: t('mapa.panel_pm2'), v: `$${selectedColonia.price_m2}k` },
                { k: t('mapa.panel_momentum'), v: selectedColonia.momentum },
                { k: t('mapa.panel_inventory'), v: `${selectedColonia.inventory} u` },
                { k: selectedColonia.tier, v: '★' },
              ].map(({ k, v }) => (
                <div key={k} style={{
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginBottom: 3 }}>{k}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {['vida', 'movilidad', 'seguridad', 'comercio'].map(k => (
                <div key={k} style={{
                  padding: '10px 12px',
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.22)',
                  borderRadius: 10,
                }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--indigo-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                    {t(`bento.layers.${k}`)}
                  </div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>
                    {selectedColonia.scores[k]}
                  </div>
                </div>
              ))}
            </div>

            <Link
              to={`/marketplace?colonia=${selectedColonia.id}`}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              data-testid="panel-open-marketplace"
            >
              {t('mapa.panel_open')} <ArrowRight size={12} />
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

// Mapa page — Mapbox GL JS with CDMX colonia polygons colored by IE Score + heatmap toggle
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Navbar from '../components/landing/Navbar';
import { fetchColonias } from '../api/marketplace';
import { X, ArrowRight } from '../components/icons';
import { Z } from '../styles/zIndex';

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
        seguridad: (c.scores && c.scores.seguridad) || 0,
        momentum_num: parseFloat(String(c.momentum || '0').replace('%', '')) || 0,
        color: colorFromScore(composite(c)),
      },
      // Geometría REAL si el catálogo ya la tiene (db.colonias.geometry); si no, el polígono semilla.
      geometry: (c.geometry && c.geometry.coordinates)
        ? c.geometry
        : { type: 'Polygon', coordinates: [[...c.polygon, c.polygon[0]]] },
    })),
  };
}

function buildCentersGeoJSON(colonias) {
  return {
    type: 'FeatureCollection',
    features: colonias.map(c => ({
      type: 'Feature',
      properties: { id: c.id, name: c.name, price_m2: c.price_m2 },
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
      style: 'mapbox://styles/mapbox/light-v11',  // Mapa de Valores: fondo CLARO (v2)
      center: [-99.17, 19.41],
      zoom: 11.2,
    });
    mapRef.current = map;

    map.on('load', () => {
      // Polygons source + layers
      map.addSource('colonias', { type: 'geojson', data: buildGeoJSON(colonias) });

      // Tinte de zona SUTIL por precio (no protagonista — las burbujas + etiquetas llevan la info).
      map.addLayer({
        id: 'colonias-fill',
        type: 'fill',
        source: 'colonias',
        paint: {
          'fill-color': [
            'interpolate', ['linear'], ['get', 'price_m2'],
            30, '#EDE9FF', 55, '#D9CCFF', 80, '#BDA6FF', 105, '#9B7BFF', 140, '#7C5CFF',
          ],
          'fill-opacity': 0.30,
        },
      });
      map.addLayer({
        id: 'colonias-outline',
        type: 'line',
        source: 'colonias',
        paint: {
          'line-color': 'rgba(109,74,255,0.45)',
          'line-width': 1.2,
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

      // ── Burbujas de VALOR: círculo por colonia (tamaño + color por precio/m²) + etiqueta con el precio ──
      map.addLayer({
        id: 'colonia-glow', type: 'circle', source: 'centers',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'price_m2'], 30, 26, 90, 42, 140, 58],
          'circle-color': ['interpolate', ['linear'], ['get', 'price_m2'], 30, '#A78BFA', 80, '#7C5CFF', 140, '#C63FAE'],
          'circle-opacity': 0.16, 'circle-blur': 0.9,
        },
      });
      map.addLayer({
        id: 'colonia-dot', type: 'circle', source: 'centers',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'price_m2'], 30, 7, 90, 12, 140, 17],
          'circle-color': ['interpolate', ['linear'], ['get', 'price_m2'], 30, '#A78BFA', 80, '#7C5CFF', 140, '#C63FAE'],
          'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'colonia-price', type: 'symbol', source: 'centers',
        layout: {
          'text-field': ['concat', ['get', 'name'], '\n$', ['to-string', ['get', 'price_m2']], 'k/m²'],
          'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        },
        paint: { 'text-color': '#2A2140', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      });
      map.on('click', 'colonia-dot', (e) => {
        const f = e.features?.[0]; if (!f) return;
        setSelected(f.properties.id);
        const c = coloniaById[f.properties.id];
        if (c) map.flyTo({ center: c.center, zoom: 13.2, duration: 700 });
      });
      map.on('mouseenter', 'colonia-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'colonia-dot', () => { map.getCanvas().style.cursor = ''; });

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
            zIndex: Z.DROPDOWN, padding: '14px 20px',
            background: 'rgba(239,68,68,0.14)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 12, fontFamily: 'DM Sans', fontSize: 13, color: '#fca5a5',
          }} data-testid="mapbox-token-missing">
            {t('mapa.token_missing')}
          </div>
        )}
        <div ref={container} style={{ position: 'absolute', inset: 0 }} data-testid="mapa-container" />

        {/* Floating header — tarjeta clara (glass blanco) */}
        <div style={{
          position: 'absolute', top: 20, left: 20, zIndex: Z.DROPDOWN,
          padding: '16px 20px',
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #ECECEC',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 12px 36px rgba(16,24,40,0.12)',
          borderRadius: 18,
          maxWidth: 340,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#8A8F9E', marginBottom: 6 }}>Mapa de Valores · CDMX</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: '#1E2230', letterSpacing: '-0.02em', marginBottom: 6 }}>
            ¿Cuánto cuesta el m² por colonia?
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#5A5F6E', lineHeight: 1.5 }}>
            Precio por m² real de cada colonia. Toca una para ver su valuación, plusvalía y qué tan segura es.
          </div>
        </div>

        {/* Layer toggle */}
        <div style={{
          position: 'absolute', top: 20, right: 20, zIndex: Z.DROPDOWN,
          display: 'flex', gap: 6, padding: 4,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #ECECEC',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 12px 36px rgba(16,24,40,0.12)',
          borderRadius: 9999,
        }}>
          {[
            { k: 'ie', label: 'Precio/m²' },
            { k: 'heat', label: 'Mapa de calor' },
          ].map(l => {
            const active = layer === l.k;
            return (
              <button key={l.k}
                onClick={() => setLayer(l.k)}
                data-testid={`layer-toggle-${l.k}`}
                style={{
                  padding: '7px 14px', borderRadius: 9999,
                  background: active ? 'var(--grad)' : 'transparent',
                  color: active ? '#fff' : '#5A5F6E',
                  border: 'none',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                  cursor: 'pointer',
                }}>
                {l.label}
              </button>
            );
          })}
        </div>

        {/* Legend — Precio por m² (rampa morada · tarjeta clara) */}
        <div style={{
          position: 'absolute', bottom: 20, left: 20, zIndex: Z.DROPDOWN,
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #ECECEC',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 12px 36px rgba(16,24,40,0.12)',
          borderRadius: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#8A8F9E', marginBottom: 8 }}>Precio por m²</div>
          <div style={{
            width: 160, height: 8, borderRadius: 9999,
            background: 'linear-gradient(to right, #A78BFA, #7C5CFF, #C63FAE)',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 160, fontFamily: 'DM Sans', fontSize: 10, color: '#5A5F6E', marginTop: 5 }}>
            <span>$30k</span><span>$80k</span><span>$140k+</span>
          </div>
        </div>

        {/* Side panel for selected colonia */}
        {selectedColonia && (
          <div
            data-testid="colonia-side-panel"
            style={{
              position: 'absolute', top: 140, right: 20, zIndex: Z.DROPDOWN,
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

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
import DisclosurePill from '../components/shared/DisclosurePill';

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
  // Upgrade #1 — "Vigila esta colonia": watchlist local (la alerta de forecast + aviso de Atlax la
  // conecta el backend después; aquí queda el enganche real + la intención del comprador).
  const [watched, setWatched] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dmx.watched_colonias') || '{}'); } catch { return {}; }
  });
  const getWatcher = () => {
    try { let w = localStorage.getItem('dmx.watcher_id'); if (!w) { w = 'w_' + Math.random().toString(36).slice(2, 11); localStorage.setItem('dmx.watcher_id', w); } return w; } catch { return 'anon'; }
  };
  const toggleWatch = (id, name) => setWatched((prev) => {
    const next = { ...prev }; const adding = !next[id];
    if (adding) next[id] = name; else delete next[id];
    try { localStorage.setItem('dmx.watched_colonias', JSON.stringify(next)); } catch {}
    // Persiste en backend (watch real · detecta cambios · cierra ciclo de re-engagement)
    const API = process.env.REACT_APP_BACKEND_URL, w = getWatcher();
    if (adding) fetch(`${API}/api/colonia-watch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ colonia_id: id, watcher: w, name }) }).catch(() => {});
    else fetch(`${API}/api/colonia-watch?watcher=${w}&colonia_id=${id}`, { method: 'DELETE' }).catch(() => {});
    return next;
  });

  const [similar, setSimilar] = useState([]);     // Upgrade #3 · colonias parecidas a la seleccionada
  const [catastro, setCatastro] = useState(null); // Catastro OFICIAL SIGCDMX por colonia (valor + predios)
  const [geojson, setGeojson] = useState(null);  // polígonos REALES (1,811 IECM) para el choropleth
  const [mapReady, setMapReady] = useState(0);   // se incrementa cada vez que el mapa carga (re-engancha capas)
  const [devs, setDevs] = useState([]);          // desarrollos reales = los PREDIOS que sí vendemos
  useEffect(() => {
    fetchColonias().then(list => {
      setColonias(list);
      const m = {}; list.forEach(c => { m[c.id] = c; });
      setColoniaById(m);
    });
    // Malla real de colonias (fronteras de verdad · adiós cuadros de juguete)
    const API = process.env.REACT_APP_BACKEND_URL;
    fetch(`${API}/api/colonias-geojson`).then(r => r.json()).then(gj => {
      if (gj && gj.features) setGeojson(gj);
    }).catch(() => {});
    // Predios reales = nuestros desarrollos (catastro abierto NO trae coordenadas → estos son los puntos reales)
    fetch(`${API}/api/developments?limit=200`).then(r => r.json()).then(ds => {
      if (Array.isArray(ds)) setDevs(ds);
    }).catch(() => {});
  }, []);

  // Cuando llega la geometría real, reemplaza la fuente del mapa (de cuadros → fronteras reales)
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !geojson) return;
    const apply = () => { const s = m.getSource('colonias'); if (s) s.setData(geojson); };
    if (m.isStyleLoaded && m.isStyleLoaded()) apply(); else m.once('idle', apply);
  }, [geojson]);

  // PREDIOS reales (nuestros desarrollos) como puntos verdes con $/m² · click → ficha del desarrollo.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !devs.length || !Object.keys(coloniaById).length) return;
    const per = {};
    const feats = [];
    devs.forEach((d) => {
      const col = coloniaById[d.colonia_id];
      const c = col && col.center;
      if (!c) return;
      const i = (per[d.colonia_id] = (per[d.colonia_id] || 0) + 1) - 1;  // spread determinista por colonia
      const ang = i * 2.4, r = i === 0 ? 0 : 0.0016 * (1 + (i % 3));
      feats.push({
        type: 'Feature',
        properties: { slug: d.slug || d.id, name: d.name, pm2: d.price_m2_dev ? Math.round(d.price_m2_dev / 1000) : null },
        geometry: { type: 'Point', coordinates: [c[0] + r * Math.cos(ang), c[1] + r * Math.sin(ang)] },
      });
    });
    const data = { type: 'FeatureCollection', features: feats };
    const apply = () => {
      if (m.getSource('devs')) { m.getSource('devs').setData(data); return; }
      m.addSource('devs', { type: 'geojson', data });
      m.addLayer({
        id: 'dev-point', type: 'circle', source: 'devs',
        paint: { 'circle-radius': 5, 'circle-color': '#1FA06A', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      });
      m.addLayer({
        id: 'dev-label', type: 'symbol', source: 'devs',
        layout: { 'text-field': ['case', ['has', 'pm2'], ['concat', '$', ['to-string', ['get', 'pm2']], 'k'], ''], 'text-size': 10, 'text-offset': [0, 1.1], 'text-anchor': 'top' },
        paint: { 'text-color': '#1FA06A', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      });
      m.on('click', 'dev-point', (e) => { const f = e.features && e.features[0]; if (f) window.location.href = `/desarrollo/${f.properties.slug}`; });
      m.on('mouseenter', 'dev-point', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'dev-point', () => { m.getCanvas().style.cursor = ''; });
    };
    if (m.isStyleLoaded && m.isStyleLoaded()) apply(); else m.once('idle', apply);
  }, [devs, coloniaById]);

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
      // Polygons source + layers (generateId → permite feature-state hover para resaltar la colonia)
      map.addSource('colonias', { type: 'geojson', data: buildGeoJSON(colonias), generateId: true });

      // Tinte de zona SUTIL por precio (no protagonista — las burbujas + etiquetas llevan la info).
      map.addLayer({
        id: 'colonias-fill',
        type: 'fill',
        source: 'colonias',
        paint: {
          // Choropleth por VALOR CATASTRAL REAL del suelo. Rampa calibrada a la DISTRIBUCIÓN real
          // (mediana ~$2,400/m², p75 ~$3,300, p90 ~$5,000) → incluso el valor bajo se ve CON color
          // (antes empezaba en $2,500=casi-blanco → 75% de CDMX salía "en blanco" aunque tenía dato).
          'fill-color': [
            'case',
            ['has', 'valor_catastral'],
            ['interpolate', ['linear'], ['get', 'valor_catastral'],
              500, '#CFE3F2', 1500, '#9FB6E6', 2400, '#9079D8', 3300, '#7E5FD6',
              5000, '#7C5CFF', 9000, '#9B46CB', 19000, '#C63FAE'],
            'rgba(124,92,255,0.06)',
          ],
          // Sube la opacidad al pasar el mouse → la colonia bajo el cursor "se enciende".
          'fill-opacity': ['case',
            ['boolean', ['feature-state', 'hover'], false], 0.85,
            ['case', ['has', 'valor_catastral'], 0.6, 0.10]],
        },
      });
      // Borde de colonia VISIBLE (distingue zonas) + se engrosa/oscurece al hover.
      map.addLayer({
        id: 'colonias-outline',
        type: 'line',
        source: 'colonias',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#5B33D6', 'rgba(91,51,214,0.35)'],
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false],
            2.4,
            ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 1.1, 15, 1.8]],
        },
      });
      // Nombre de colonia (aparece al acercar · ayuda a ubicarte)
      map.addLayer({
        id: 'colonias-label',
        type: 'symbol',
        source: 'colonias',
        minzoom: 12.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 10, 15, 13],
          'text-max-width': 8, 'text-padding': 6, 'symbol-avoid-edges': true,
        },
        paint: {
          'text-color': '#3A2A6B', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.4,
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
        const c = coloniaById[f.properties.id] || f.properties;
        setSelected(c);
        if (c.center) map.flyTo({ center: c.center, zoom: 13.2, duration: 700 });
      });
      map.on('mouseenter', 'colonia-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'colonia-dot', () => { map.getCanvas().style.cursor = ''; });

      // Click handler
      map.on('click', 'colonias-fill', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = { ...f.properties };
        // scores/trend vienen como JSON string desde el vector tile → parsear
        try { if (typeof p.scores === 'string') p.scores = JSON.parse(p.scores); } catch {}
        try { if (typeof p.trend === 'string') p.trend = JSON.parse(p.trend); } catch {}
        setSelected(p);
        // Solo acerca si estás LEJOS; si ya estás en zoom de predio, no muevas el mapa (fix "se aleja").
        if (e.lngLat && map.getZoom() < 14) map.flyTo({ center: [e.lngLat.lng, e.lngLat.lat], zoom: 13.4, duration: 700 });
      });
      // Hover: resalta la colonia bajo el cursor (feature-state) → navegar/distinguir zonas es claro.
      let hoveredId = null;
      map.on('mousemove', 'colonias-fill', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const f = e.features && e.features[0]; if (!f) return;
        if (hoveredId !== null) map.setFeatureState({ source: 'colonias', id: hoveredId }, { hover: false });
        hoveredId = f.id;
        map.setFeatureState({ source: 'colonias', id: hoveredId }, { hover: true });
      });
      map.on('mouseleave', 'colonias-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredId !== null) map.setFeatureState({ source: 'colonias', id: hoveredId }, { hover: false });
        hoveredId = null;
      });
      setMapReady((v) => v + 1);  // señal: el mapa cargó → re-engancha las capas dependientes (predios)
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

  const selectedColonia = selected;  // ahora `selected` es el objeto (props del polígono o la colonia seed)

  // Upgrade #3 · "Parecidas a las que te gustaron" — al seleccionar una colonia con scores, trae similares.
  const selId = selected && selected.id;
  useEffect(() => {
    if (!selId || !(selected && selected.scores)) { setSimilar([]); return; }
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/colonias-similar/${selId}?n=3`)
      .then((r) => r.json()).then((d) => setSimilar(d.similar || [])).catch(() => setSimilar([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  // Catastro OFICIAL (SIGCDMX) — consulta por ID de colonia (cruce espacial · exacto 99%); el endpoint
  // cae al nombre si no es id. Antes consultaba por NOMBRE (regex frágil) → falsos "próximamente".
  const selKey = selected && (selected.id || selected.name);
  useEffect(() => {
    if (!selKey) { setCatastro(null); return; }
    setCatastro(null);
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/catastro/colonia/${encodeURIComponent(selKey)}`)
      .then((r) => r.json()).then((d) => setCatastro(d && d.disponible ? d : null)).catch(() => setCatastro(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  // PREDIOS como POLÍGONOS del lote — cargados por VIEWPORT solo a zoom cercano (forma real, no puntos;
  // no se mezclan con el relleno de colonia porque solo salen al acercar). Click → ficha del predio.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    let cancelled = false;
    const API = process.env.REACT_APP_BACKEND_URL;
    const ZMIN = 14;  // predios (lotes) aparecen a nivel calle, no solo muy de cerca
    const fetchBbox = () => {
      const src = m.getSource('catastro-poly');
      if (!src) return;
      if (m.getZoom() < ZMIN) { src.setData({ type: 'FeatureCollection', features: [] }); return; }
      const b = m.getBounds();
      fetch(`${API}/api/catastro/predios-bbox?w=${b.getWest().toFixed(5)}&s=${b.getSouth().toFixed(5)}&e=${b.getEast().toFixed(5)}&n=${b.getNorth().toFixed(5)}&limit=3000`)
        .then((r) => r.json()).then((gj) => { if (!cancelled && m.getSource('catastro-poly')) m.getSource('catastro-poly').setData(gj); }).catch(() => {});
    };
    const setup = () => {
      if (!m.getSource('catastro-poly')) {
        m.addSource('catastro-poly', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({
          id: 'catastro-poly-fill', type: 'fill', source: 'catastro-poly',
          paint: {
            'fill-color': ['interpolate', ['linear'], ['get', 'v'],
              500, '#CFE3F2', 1500, '#9FB6E6', 2400, '#9079D8', 3300, '#7E5FD6',
              5000, '#7C5CFF', 9000, '#9B46CB', 19000, '#C63FAE'],
            'fill-opacity': 0.6,
          },
        });
        m.addLayer({
          id: 'catastro-poly-line', type: 'line', source: 'catastro-poly',
          paint: { 'line-color': 'rgba(255,255,255,0.65)', 'line-width': 0.5 },
        });
        m.on('mouseenter', 'catastro-poly-fill', () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', 'catastro-poly-fill', () => { m.getCanvas().style.cursor = ''; });
        m.on('click', 'catastro-poly-fill', (e) => {
          const f = e.features && e.features[0]; if (!f) return;
          const pr = f.properties;
          const mx = (x) => '$' + Math.round(x || 0).toLocaleString('es-MX');
          const row = (k, v) => v ? `<div style="display:flex;justify-content:space-between;gap:14px"><span style="color:#8A8F9E">${k}</span><span style="color:#1E2230;font-weight:600">${v}</span></div>` : '';
          // Unidades del predio (deptos/locales) — Campeche 322 → Depto 1-6 + Loc 1 y 2
          let units = [];
          try { units = pr.unidades ? JSON.parse(pr.unidades) : []; } catch {}
          const unitsHtml = units.length ? `
            <div style="margin-top:8px;border-top:1px solid #EEE;padding-top:7px">
              <div style="font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#7C5CFF;margin-bottom:2px">${units.length} unidades en este predio</div>
              <div style="display:flex;justify-content:space-between;font-size:9px;color:#9AA0AE;margin-bottom:4px"><span>unidad</span><span>m² · valor catastral</span></div>
              <div style="max-height:160px;overflow-y:auto;padding-right:2px">
              ${units.map((u) => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;padding:1.5px 0"><span style="color:#5A5F6E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(u.r || '').replace(/.*?(depto|dpto|dep|loc)/i, '$1').slice(0, 22) || '—'}</span><span style="color:#1E2230;white-space:nowrap">${u.c ? Math.round(u.c) + 'm² · ' : ''}${mx(u.vs)}</span></div>`).join('')}
              </div>
            </div>` : '';
          const html = `<div style="font-family:'DM Sans',sans-serif;min-width:210px">
            <div style="font-weight:700;font-size:13px;color:#1E2230;margin-bottom:2px">${(pr.calle || 'Predio').slice(0, 55)}</div>
            <div style="font-size:10.5px;color:#8A8F9E;margin-bottom:8px">${pr.colonia || ''}${pr.cp ? ' · CP ' + pr.cp : ''}</div>
            <div style="font-size:11.5px;line-height:1.7">
              ${row('Valor catastral', mx(pr.vs))}
              ${row('Suelo', mx(pr.v) + '/m²')}
              ${row('Terreno', pr.sup ? Math.round(pr.sup) + ' m²' : '')}
              ${row('Construcción', pr.supc ? Math.round(pr.supc) + ' m²' : '')}
              ${row('Año', pr.anio || '')}
            </div>
            ${unitsHtml}
            <div style="font-size:9.5px;color:#9AA0AE;margin-top:7px">Catastro oficial SIGCDMX 2021 · valor del predial</div>
          </div>`;
          new mapboxgl.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(html).addTo(m);
        });
        m.on('moveend', fetchBbox);
      }
      fetchBbox();
    };
    if (m.isStyleLoaded && m.isStyleLoaded()) setup(); else m.once('idle', setup);
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

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
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#8A8F9E', marginBottom: 8 }}>Valor del suelo · $/m²</div>
          <div style={{
            width: 160, height: 8, borderRadius: 9999,
            background: 'linear-gradient(to right, #CFE3F2, #9079D8, #7C5CFF, #9B46CB, #C63FAE)',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 160, fontFamily: 'DM Sans', fontSize: 10, color: '#5A5F6E', marginTop: 5 }}>
            <span>$500</span><span>$3k</span><span>$19k+</span>
          </div>
          <div style={{ fontSize: 9.5, color: '#9AA0AE', marginTop: 6 }}>Catastro oficial SIGCDMX · click = predios</div>
        </div>

        {/* Panel rico de colonia — CLARO · gráfica histórica de plusvalía + AVM + scores + Vigila */}
        {selectedColonia && (() => {
          const c = selectedColonia;
          const tr = c.trend || [];
          const up = c.momentum_positive !== false && !String(c.momentum || '').startsWith('-');
          const isW = !!watched[c.id];
          return (
          <div data-testid="colonia-side-panel" style={{
            position: 'absolute', top: 100, right: 20, zIndex: Z.DROPDOWN,
            width: 360, maxHeight: 'calc(100% - 140px)', overflowY: 'auto',
            padding: 22, background: 'rgba(255,255,255,0.97)', border: '1px solid #ECECEC',
            backdropFilter: 'blur(18px)', boxShadow: '0 24px 60px rgba(16,24,40,0.18)', borderRadius: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#8A8F9E', marginBottom: 4 }}>{c.alcaldia}</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: '#1E2230', letterSpacing: '-0.02em' }}>{c.name}</div>
              </div>
              <button onClick={() => setSelected(null)} data-testid="close-panel" style={{
                width: 30, height: 30, borderRadius: 9999, background: '#F1F2F6', border: '1px solid #ECECEC',
                color: '#5A5F6E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}><X size={13} /></button>
            </div>

            {/* Precio/m² grande + plusvalía (o aviso si la colonia aún no tiene valuación) */}
            {c.price_m2 ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 38, lineHeight: 1, color: '#1E2230', letterSpacing: '-0.03em' }}>${c.price_m2}k</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#5A5F6E' }}>/m²</div>
                {c.momentum && (
                  <div style={{ marginLeft: 'auto', fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: up ? '#1FA06A' : '#E2982E' }}>
                    {up ? '▲' : '▼'} {c.momentum} <span style={{ fontWeight: 500, fontSize: 11, color: '#8A8F9E' }}>plusvalía</span>
                  </div>
                )}
              </div>
            ) : catastro ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 34, lineHeight: 1, color: '#1E2230', letterSpacing: '-0.03em' }}>${(catastro.valor_suelo_m2 || 0).toLocaleString('es-MX')}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#5A5F6E' }}>/m² de suelo · catastro oficial</div>
              </div>
            ) : (
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#5A5F6E', background: '#F1F2F6', borderRadius: 10, padding: '10px 12px', marginBottom: 4 }}>
                Valuación de esta colonia <b>próximamente</b>. Ya tenemos su frontera; el valor llega al cargar el catastro.
              </div>
            )}

            {/* GRÁFICA HISTÓRICA de precio/m² (24 meses) — lo que pide el founder */}
            {tr.length > 1 && (() => {
              const w = 312, h = 84, min = Math.min(...tr), max = Math.max(...tr), rng = max - min || 1;
              const pts = tr.map((v, i) => `${(i / (tr.length - 1)) * w},${h - ((v - min) / rng) * (h - 12) - 6}`);
              const col = up ? '#1FA06A' : '#C63FAE';
              return (
                <div style={{ marginTop: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#8A8F9E', marginBottom: 6 }}>Precio/m² · Últimos 24 Meses</div>
                  <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block' }} preserveAspectRatio="none">
                    <path d={`M${pts.join(' L')} L${w},${h} L0,${h} Z`} fill={col} opacity="0.12" />
                    <path d={`M${pts.join(' L')}`} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 11, color: '#5A5F6E', marginTop: 4 }}>
                    <span>${tr[0]}k</span>
                    <span style={{ color: col, fontWeight: 700 }}>hoy ${tr[tr.length - 1]}k/m²</span>
                  </div>
                </div>
              );
            })()}

            {/* Sello de calidad — solo si NO hay dato real (ni catastro oficial ni scores) */}
            {!catastro && (c.calidad_estimada || (!c.has_data && !c.scores)) && (
              <div style={{ marginBottom: 10 }}>
                <DisclosurePill esEstimado quality={c.calidad_estimada ? 'estimated' : 'seeded'} />
              </div>
            )}

            {/* Scores en lenguaje de beneficio */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[['comercio', 'Todo a la Mano'], ['movilidad', 'Llegas Rápido'], ['seguridad', 'Tranquila'], ['vida', 'Mucha Vida']].map(([k, label]) => (
                <div key={k} style={{ padding: '10px 12px', background: '#F6F4FF', border: '1px solid #E7E0FF', borderRadius: 12 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: '#7C5CFF', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: '#1E2230' }}>{c.scores?.[k] ?? '—'}</div>
                </div>
              ))}
            </div>

            {/* Valor del suelo · Catastro oficial (claro: precio del terreno + predio típico + cobertura) */}
            {catastro && (
              <div style={{ marginBottom: 14, padding: '14px', background: '#F1F4F0', border: '1px solid #E2E8DD', borderRadius: 14 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#5A6B52', marginBottom: 10 }}>Valor del suelo · Catastro oficial</div>
                <div style={{ display: 'flex', gap: 22 }}>
                  <div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: '#1E2230', lineHeight: 1 }}>${(catastro.valor_suelo_m2 || 0).toLocaleString('es-MX')}<span style={{ fontSize: 11, color: '#8A8F9E', fontWeight: 500 }}> /m²</span></div>
                    <div style={{ fontSize: 10.5, color: '#5A6B52', marginTop: 3 }}>precio del terreno</div>
                  </div>
                  {catastro.valor_predio_tipico ? (
                    <div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: '#1E2230', lineHeight: 1 }}>${(catastro.valor_predio_tipico || 0).toLocaleString('es-MX')}</div>
                      <div style={{ fontSize: 10.5, color: '#5A6B52', marginTop: 3 }}>predio típico</div>
                    </div>
                  ) : null}
                </div>
                <div style={{ fontSize: 10.5, color: '#8A8F9E', marginTop: 11 }}>{(catastro.predios || 0).toLocaleString()} predios reales · SIGCDMX, base del predial</div>
              </div>
            )}

            {/* Parecidas a esta (upgrade #3 · taste) */}
            {similar.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#8A8F9E', marginBottom: 8 }}>Parecidas a {c.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {similar.map((s) => (
                    <button key={s.id} onClick={() => { const full = coloniaById[s.id] || s; setSelected(full); if (full.center) mapRef.current && mapRef.current.flyTo({ center: full.center, zoom: 13.4, duration: 700 }); }}
                      style={{ cursor: 'pointer', textAlign: 'left', padding: '8px 11px', borderRadius: 12, background: '#F6F4FF', border: '1px solid #E7E0FF', fontFamily: 'DM Sans' }}>
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1E2230' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: '#7C5CFF' }}>${s.price_m2}k/m² · {s.momentum}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Vigila esta colonia (upgrade #1) */}
            <button onClick={() => toggleWatch(c.id, c.name)} style={{
              width: '100%', padding: '11px', borderRadius: 12, marginBottom: 10, cursor: 'pointer',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5,
              background: isW ? 'rgba(31,160,106,0.10)' : '#fff',
              border: `1px solid ${isW ? 'rgba(31,160,106,0.4)' : '#D9CCFF'}`,
              color: isW ? '#1FA06A' : 'var(--theme)',
            }}>
              {isW ? '✓ Te avisaremos si cambia el precio o la seguridad' : '🔔 Vigila esta colonia'}
            </button>

            <Link to={`/marketplace?colonia=${c.id}`} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
              padding: '12px', borderRadius: 12, textDecoration: 'none',
              background: 'var(--grad)', color: '#fff', fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
            }} data-testid="panel-open-marketplace">
              Ver desarrollos en {c.name} <ArrowRight size={13} />
            </Link>
          </div>
          );
        })()}
      </main>
    </div>
  );
}

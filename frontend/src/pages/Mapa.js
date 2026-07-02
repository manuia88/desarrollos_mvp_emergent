// Mapa page — Mapbox GL JS with CDMX colonia polygons colored by IE Score + heatmap toggle
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { fetchColonias } from '../api/marketplace';
import { X, ArrowRight } from '../components/icons';
import { Z } from '../styles/zIndex';
import DisclosurePill from '../components/shared/DisclosurePill';
import { tc } from '../lib/titleCase';
import ToolNav from '../components/ui/ToolNav';

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

// ── Capas del choropleth (selector "¿qué pinto?") ──────────────────────────────────────────────
// Default = VALOR CATASTRAL (paint de siempre). Las demás capas pintan por 'metric_value' (inyectado
// desde /api/mapa/capa/{key}). Escala score 0-100 = rojo→verde (calidad); escalas nativas (precio/FAR/%)
// = rampa violeta→magenta de marca, anclada a min/p50/max reales de la capa. Sin dato → gris neutro.
const VALOR_FILL_COLOR = ['case', ['has', 'valor_catastral'],
  ['interpolate', ['linear'], ['get', 'valor_catastral'],
    500, '#CFE3F2', 1500, '#9FB6E6', 2400, '#9079D8', 3300, '#7E5FD6', 5000, '#7C5CFF', 9000, '#9B46CB', 19000, '#C63FAE'],
  'rgba(124,92,255,0.06)'];
const VALOR_FILL_OPACITY = ['case', ['boolean', ['feature-state', 'hover'], false], 0.85,
  ['case', ['has', 'valor_catastral'], 0.6, 0.10]];
const CAPA_FILL_OPACITY = ['case', ['boolean', ['feature-state', 'hover'], false], 0.9,
  ['case', ['has', 'metric_value'], 0.72, 0.10]];
function _seqRamp(stats) {
  const lo = (stats && typeof stats.min === 'number') ? stats.min : 0;
  let mid = (stats && typeof stats.p50 === 'number') ? stats.p50 : (lo + 100) / 2;
  let hi = (stats && typeof stats.max === 'number') ? stats.max : 100;
  if (!(mid > lo)) mid = lo + Math.max(1, (hi - lo) / 2);
  if (!(hi > mid)) hi = mid + Math.max(1, Math.abs(mid) * 0.1);
  return ['interpolate', ['linear'], ['get', 'metric_value'],
    lo, '#CFE3F2', lo + (mid - lo) / 2, '#9FB6E6', mid, '#9079D8', mid + (hi - mid) / 2, '#7C5CFF', hi, '#C63FAE'];
}
function capaFillColor(meta, stats) {
  const ramp = (meta && meta.scale === 'score')
    ? ['interpolate', ['linear'], ['get', 'metric_value'], 20, '#E5484D', 40, '#F0883E', 55, '#F5D90A', 72, '#8DCE4A', 88, '#2F9E44']
    : _seqRamp(stats);
  return ['case', ['has', 'metric_value'], ramp, '#E6E6EF'];
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

// Centroide aproximado de un polígono/multipolígono GeoJSON (promedio de vértices del primer anillo) → para volar a una
// colonia de las 1,811 que NO está en las 16 seed (sin center precomputado).
function _polyCentroid(geom) {
  try {
    let ring = null;
    if (geom.type === 'Polygon') ring = geom.coordinates[0];
    else if (geom.type === 'MultiPolygon') ring = geom.coordinates[0][0];
    if (!ring || !ring.length) return null;
    let sx = 0, sy = 0;
    ring.forEach(([x, y]) => { sx += x; sy += y; });
    return [sx / ring.length, sy / ring.length];
  } catch { return null; }
}

export default function Mapa() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const container = useRef(null);
  const [colonias, setColonias] = useState([]);
  const [coloniaById, setColoniaById] = useState({});
  const [layer, setLayer] = useState('ie');
  const [showDevs, setShowDevs] = useState(false); // desarrollos ocultos por default → mapa limpio
  const [valoracion, setValoracion] = useState(null); // F2: precio mercado + plusvalía real (colonia vs alcaldía)
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
  const [capas, setCapas] = useState([]);        // catálogo de capas del choropleth (/api/mapa/capas)
  const [activeCapa, setActiveCapa] = useState('valor');  // capa activa ("¿qué pinto?") · default valor del suelo
  const [capaMeta, setCapaMeta] = useState(null);         // meta+stats de la capa activa → alimenta la legend
  const [capaOpen, setCapaOpen] = useState(false);        // dropdown del selector de capas abierto
  const [mapSearch, setMapSearch] = useState('');         // búsqueda in-map (colonia)
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

  // Catálogo de capas del choropleth (para el selector "¿qué pinto?").
  useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/mapa/capas`).then((r) => r.json())
      .then((d) => { if (d && Array.isArray(d.capas)) setCapas(d.capas); }).catch(() => {});
  }, []);

  // Aplica la capa activa: parte de `geojson` (choropleth real con valor_catastral + id), inyecta metric_value
  // desde /api/mapa/capa/{key} y repinta. 'valor' = default (limpia metric_value, restaura paint catastral).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !geojson) return undefined;
    let cancelled = false;
    const API = process.env.REACT_APP_BACKEND_URL;
    const run = async () => {
      if (!m.getLayer || !m.getLayer('colonias-fill')) return;
      const src = m.getSource('colonias');
      if (!src) return;
      if (activeCapa === 'valor') {
        const feats = geojson.features.map((f) => {
          const p = { ...(f.properties || {}) }; delete p.metric_value; return { ...f, properties: p };
        });
        if (!cancelled) {
          src.setData({ ...geojson, features: feats });
          m.setPaintProperty('colonias-fill', 'fill-color', VALOR_FILL_COLOR);
          m.setPaintProperty('colonias-fill', 'fill-opacity', VALOR_FILL_OPACITY);
          setCapaMeta({ key: 'valor', label: 'Valor del suelo', unit: '$/m²', scale: 'price', emoji: '💰',
            fuente: 'catastro', es_estimado: false, stats: { min: 500, p50: 3000, max: 19000 } });
        }
        return;
      }
      try {
        const r = await fetch(`${API}/api/mapa/capa/${activeCapa}`).then((x) => x.json());
        if (cancelled || !r || !r.values) return;
        const vals = r.values;
        const feats = geojson.features.map((f) => {
          const p = { ...(f.properties || {}) };
          const id = p.id;
          if (id != null && Object.prototype.hasOwnProperty.call(vals, id)) p.metric_value = vals[id];
          else delete p.metric_value;
          return { ...f, properties: p };
        });
        src.setData({ ...geojson, features: feats });
        m.setPaintProperty('colonias-fill', 'fill-color', capaFillColor(r.meta, r.stats));
        m.setPaintProperty('colonias-fill', 'fill-opacity', CAPA_FILL_OPACITY);
        setCapaMeta({ ...(r.meta || {}), stats: r.stats });
      } catch { /* fail-open: deja el paint anterior */ }
    };
    if (m.isStyleLoaded && m.isStyleLoaded()) run(); else m.once('idle', run);
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCapa, geojson, mapReady]);

  // BÚSQUEDA → MAPA: si llega ?colonia=ID, enfoca esa colonia al entrar (de las 16 seed o de las 1,811 vía centroide) +
  // abre su panel. Así la info fluye: el usuario busca/elige una zona y el mapa lo lleva justo ahí.
  const _focusedRef = useRef(false);
  useEffect(() => {
    if (_focusedRef.current || !mapRef.current) return undefined;
    const cid = searchParams.get('colonia');
    if (!cid) return undefined;
    let obj = coloniaById[cid];
    let center = obj && obj.center;
    if (!center && geojson) {
      const feat = (geojson.features || []).find((f) => (f.properties || {}).id === cid);
      if (feat) { obj = { ...(feat.properties || {}), id: cid }; center = _polyCentroid(feat.geometry); if (center) obj.center = center; }
    }
    if (obj) {
      _focusedRef.current = true;
      setSelected(obj);
      const fly = () => mapRef.current && mapRef.current.flyTo({ center, zoom: 13.6, duration: 900 });
      if (center) { const m = mapRef.current; if (m.isStyleLoaded && m.isStyleLoaded()) fly(); else m.once('idle', fly); }
    }
    return undefined;
  }, [searchParams, geojson, coloniaById, mapReady]);

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
      // Desarrollos OCULTOS por default (toggle "Desarrollos" del toolbar) — el mapa de valores arranca LIMPIO
      // (solo el choropleth), sin los puntos/precios encimados. El usuario los prende si quiere ver el inventario.
      m.addLayer({
        id: 'dev-point', type: 'circle', source: 'devs',
        layout: { visibility: 'none' },
        paint: { 'circle-radius': 5, 'circle-color': '#1FA06A', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      });
      m.addLayer({
        id: 'dev-label', type: 'symbol', source: 'devs',
        layout: { visibility: 'none', 'text-field': ['case', ['has', 'pm2'], ['concat', '$', ['to-string', ['get', 'pm2']], 'k'], ''], 'text-size': 10, 'text-offset': [0, 1.1], 'text-anchor': 'top' },
        paint: { 'text-color': '#1FA06A', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      });
      m.on('click', 'dev-point', (e) => { const f = e.features && e.features[0]; if (f) navigate(`/desarrollo/${f.properties.slug}`); });
      m.on('mouseenter', 'dev-point', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'dev-point', () => { m.getCanvas().style.cursor = ''; });
    };
    if (m.isStyleLoaded && m.isStyleLoaded()) apply(); else m.once('idle', apply);
  }, [devs, coloniaById, navigate]);

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
          // zoom DEBE ir top-level (Mapbox lo prohíbe dentro de 'case'): interpolate afuera, hover adentro de cada parada.
          'line-width': ['interpolate', ['linear'], ['zoom'],
            10, ['case', ['boolean', ['feature-state', 'hover'], false], 2.4, 0.5],
            13, ['case', ['boolean', ['feature-state', 'hover'], false], 2.4, 1.1],
            15, ['case', ['boolean', ['feature-state', 'hover'], false], 2.4, 1.8]],
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

      // REDISEÑO F1 (estética Monopolio): UN solo sistema visual = el POLÍGONO choropleth. Se retiraron el heatmap
      // y las 3 capas de burbujas (glow/dot/price) que competían con el relleno y hacían "ruido". El precio/plusvalía
      // ahora se lee en el TOOLTIP flotante (hover) y en el panel lateral — no gritado sobre el mapa.

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
      // Hover: resalta la colonia (feature-state) + TOOLTIP flotante limpio (nombre · $/m² suelo · $/m² mercado).
      const tip = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'dmx-map-tip', maxWidth: '240px' });
      let hoveredId = null;
      map.on('mousemove', 'colonias-fill', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const f = e.features && e.features[0]; if (!f) return;
        if (hoveredId !== null) map.setFeatureState({ source: 'colonias', id: hoveredId }, { hover: false });
        hoveredId = f.id;
        map.setFeatureState({ source: 'colonias', id: hoveredId }, { hover: true });
        const p = f.properties || {};
        // Solo PRECIO DE MERCADO (lo que la gente entiende). NADA de valor catastral en el hover (confunde /
        // parece "mentira" a quien no sabe). Si no hay precio de mercado de esta colonia, invita a tocar.
        const merc = p.price_m2
          ? `<div style="font-size:15px"><span style="font-family:Outfit,sans-serif;font-weight:800;color:#7C5CFF">$${p.price_m2}k</span> <span style="color:#6B6684;font-size:12px">/m²</span></div>`
          : `<div style="color:#8A85A0;font-size:11.5px">Toca para ver su valuación</div>`;
        tip.setLngLat(e.lngLat).setHTML(
          `<div style="font-family:'DM Sans',sans-serif;line-height:1.45;color:#2A2140">
             <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:13.5px">${p.name || ''}</div>
             ${p.alcaldia ? `<div style="color:#8A85A0;font-size:11px;margin-bottom:5px">${p.alcaldia}</div>` : '<div style="height:5px"></div>'}
             ${merc}
           </div>`
        ).addTo(map);
      });
      map.on('mouseleave', 'colonias-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredId !== null) map.setFeatureState({ source: 'colonias', id: hoveredId }, { hover: false });
        hoveredId = null;
        tip.remove();
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
    // Un solo sistema visual (el choropleth de polígonos). Siempre visible fill+borde+etiqueta.
    setVis('colonias-fill', 'visible');
    setVis('colonias-outline', 'visible');
    setVis('colonias-label', 'visible');
    // Desarrollos: solo si el toggle está prendido.
    setVis('dev-point', showDevs ? 'visible' : 'none');
    setVis('dev-label', showDevs ? 'visible' : 'none');
  }, [layer, showDevs, devs]);

  const selectedColonia = selected;  // ahora `selected` es el objeto (props del polígono o la colonia seed)

  // Upgrade #3 · "Parecidas a las que te gustaron" — al seleccionar una colonia con scores, trae similares.
  const selId = selected && selected.id;
  useEffect(() => {
    if (!selId || !(selected && selected.scores)) { setSimilar([]); return; }
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/colonias-similar/${selId}?n=3`)
      .then((r) => r.json()).then((d) => setSimilar(d.similar || [])).catch(() => setSimilar([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  // F2 · Valoración de la colonia: precio de MERCADO real (Monopolio/AVM) + plusvalía anual derivada del índice SHF
  // de la alcaldía (marcada "estimada"). Alimenta la gráfica de valorización del panel (estilo Propiedades.com).
  useEffect(() => {
    if (!selId) { setValoracion(null); return; }
    setValoracion(null);
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/mapa/colonia/${encodeURIComponent(selId)}/valoracion`)
      .then((r) => r.json()).then((d) => setValoracion(d || null)).catch(() => setValoracion(null));
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
            // Si el predio tiene AVM de MERCADO ($/m², estilo propiedades.com) se pinta con su escala de mercado;
            // si no, cae al valor catastral del suelo. Misma rampa violeta→magenta = "más caro = más magenta".
            'fill-color': ['case', ['has', 'avm'],
              ['interpolate', ['linear'], ['get', 'avm'],
                25000, '#CFE3F2', 45000, '#9FB6E6', 65000, '#9079D8', 85000, '#7C5CFF', 110000, '#9B46CB', 140000, '#C63FAE'],
              ['interpolate', ['linear'], ['get', 'v'],
                500, '#CFE3F2', 1500, '#9FB6E6', 2400, '#9079D8', 3300, '#7E5FD6', 5000, '#7C5CFF', 9000, '#9B46CB', 19000, '#C63FAE']],
            // Los predios con precio de mercado resaltan un poco más que los de solo catastral.
            'fill-opacity': ['case', ['has', 'avm'], 0.74, 0.55],
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
          // Bloque de MERCADO (estilo propiedades.com): lidera con el $/m² de mercado cuando el predio está materializado.
          const avmBlock = pr.avm ? `
            <div style="background:linear-gradient(135deg,#F3EEFF,#FBEFF8);border-radius:10px;padding:9px 11px;margin:2px 0 9px">
              <div style="font-size:9.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#7C5CFF;margin-bottom:1px">Precio de mercado estimado</div>
              <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:19px;color:#1E2230">$${(pr.avm / 1000).toFixed(0)}k<span style="font-size:12px;color:#8A85A0;font-weight:600"> /m²</span></div>
              <div style="font-size:9px;color:#9AA0AE;margin-top:1px">AVM DesarrollosMX · ${Number(pr.avm_est) ? 'estimado' : 'con comparables'}</div>
            </div>` : '';
          const html = `<div style="font-family:'DM Sans',sans-serif;min-width:210px">
            <div style="font-weight:700;font-size:13px;color:#1E2230;margin-bottom:2px">${(pr.calle || 'Predio').slice(0, 55)}</div>
            <div style="font-size:10.5px;color:#8A8F9E;margin-bottom:8px">${pr.colonia || ''}${pr.cp ? ' · CP ' + pr.cp : ''}</div>
            ${avmBlock}
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
    // LAYOUT full-viewport: SIDEBAR (info) + MAPA. Un solo producto integrado — sin widgets sueltos.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#fff' }}>

      {/* ========================= NAV SUPERIOR unificado (menú Herramientas real) ========================= */}
      <ToolNav />

      {/* Fila: SIDEBAR + MAPA (llena el resto bajo el nav) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

      {/* ========================= SIDEBAR (hub de info · un solo scroll) ========================= */}
      <aside style={{
        width: 400, flexShrink: 0, height: '100%', overflowY: 'auto',
        background: '#fff', borderRight: '1px solid #ECECEC',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header limpio: título de la herramienta (el brand vive en el nav superior) */}
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #F1F2F6' }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 21, color: '#1E2230', letterSpacing: '-0.02em' }}>
            {tc('Mapa de Valores')}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#8A8F9E', marginTop: 6 }}>
            CDMX · Precio del m²
          </div>
        </div>

        {/* Cuerpo del sidebar: bienvenida ↔ colonia seleccionada */}
        {!selectedColonia ? (
          /* ---------- BIENVENIDA (sin colonia) ---------- */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 26px' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: '#1E2230', letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 12 }}>
              ¿Cuánto cuesta el m² por colonia?
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: '#5A5F6E', lineHeight: 1.55 }}>
              Precio por m² real de cada colonia. Toca una en el mapa para ver su valuación, plusvalía y qué tan segura es.
            </div>

            {/* La leyenda vive FLOTANTE sobre el mapa (siempre visible, cambia con la capa). */}
            <div style={{ marginTop: 'auto', paddingTop: 24, fontSize: 12, color: '#9AA0AE', lineHeight: 1.55 }}>
              Usa <b style={{ color: '#5A5F6E' }}>¿Qué pinto?</b> (arriba a la derecha del mapa) para cambiar la capa:
              precio, plusvalía, seguridad, agua, escuelas, vida nocturna y más. Acércate para ver los predios.
            </div>
          </div>
        ) : (() => {
          /* ---------- COLONIA SELECCIONADA ---------- */
          const c = selectedColonia;
          const up = c.momentum_positive !== false && !String(c.momentum || '').startsWith('-');
          const isW = !!watched[c.id];
          return (
          <div data-testid="colonia-side-panel" style={{ padding: '20px 26px 28px' }}>
            {/* Volver a la bienvenida */}
            <button onClick={() => setSelected(null)} data-testid="close-panel" style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', marginBottom: 18,
              borderRadius: 9999, background: '#F6F4FF', border: '1px solid #E7E0FF',
              color: 'var(--theme)', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
            }}><X size={12} /> Ver todo el mapa</button>

            {/* Encabezado */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#8A8F9E', marginBottom: 4 }}>{c.alcaldia}</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: '#1E2230', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{c.name}</div>
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
              (() => {
                const mk = catastro.mercado || {};
                const real = mk.source === 'mercado';
                return (
                  <div style={{ marginBottom: 4 }}>
                    {mk.precio_venta_m2 ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 34, lineHeight: 1, color: '#1E2230', letterSpacing: '-0.03em' }}>${mk.precio_venta_m2.toLocaleString('es-MX')}</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#5A5F6E' }}>/m² {real ? 'venta' : 'venta estimado'}</div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: real ? '#E4F6EC' : '#FBF2D6', color: real ? '#1FA06A' : '#9A7B16' }}>
                            {real ? '✓ precio de mercado' : `≈ estimado · confianza ${mk.confianza}`}
                          </span>
                        </div>
                        {!real && mk.rango && (
                          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#8A8F9E', marginTop: 3 }}>rango ${mk.rango[0].toLocaleString('es-MX')}–${mk.rango[1].toLocaleString('es-MX')}/m² · suelo catastral ${(catastro.valor_suelo_m2 || 0).toLocaleString('es-MX')}/m²</div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 34, lineHeight: 1, color: '#1E2230', letterSpacing: '-0.03em' }}>${(catastro.valor_suelo_m2 || 0).toLocaleString('es-MX')}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#5A5F6E' }}>/m² de suelo · catastro oficial</div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#5A5F6E', background: '#F1F2F6', borderRadius: 10, padding: '10px 12px', marginBottom: 4 }}>
                Valuación de esta colonia <b>próximamente</b>. Ya tenemos su frontera; el valor llega al cargar el catastro.
              </div>
            )}

            {/* PLUSVALÍA · valorización anual — F2: serie REAL derivada del índice oficial SHF de la alcaldía (marcada). */}
            {(() => {
              const pv = valoracion && valoracion.plusvalia;
              const serie = (pv && Array.isArray(pv.series) && pv.series) || [];
              if (serie.length > 1) {
                const w = 312, h = 84, vals = serie.map((s) => s.valor_m2 || 0);
                const min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
                const pts = serie.map((s, i) => `${(i / (serie.length - 1)) * w},${h - (((s.valor_m2 || 0) - min) / rng) * (h - 12) - 6}`);
                const lastYoy = serie[serie.length - 1].yoy_pct;
                const upv = (lastYoy ?? 0) >= 0, col = upv ? '#1FA06A' : '#C63FAE';
                const alc = valoracion.alcaldia_plusvalia && valoracion.alcaldia_plusvalia.alcaldia;
                return (
                  <div style={{ marginTop: 16, marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#8A8F9E' }}>{tc('Plusvalía · valorización anual')}</div>
                      {lastYoy != null && <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: col }}>{upv ? '▲' : '▼'} {Math.abs(lastYoy).toFixed(1)}%/año</div>}
                    </div>
                    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block' }} preserveAspectRatio="none">
                      <path d={`M${pts.join(' L')} L${w},${h} L0,${h} Z`} fill={col} opacity="0.12" />
                      <path d={`M${pts.join(' L')}`} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 11, color: '#5A5F6E', marginTop: 4 }}>
                      <span>{serie[0].anio}</span><span>{serie[serie.length - 1].anio}</span>
                    </div>
                    {pv.es_estimado && <div style={{ fontSize: 9.5, color: '#9AA0AE', marginTop: 5 }}>Estimada · índice oficial SHF de {alc || 'la alcaldía'}</div>}
                  </div>
                );
              }
              return null;
            })()}

            {/* Sello de calidad — solo si NO hay dato real (ni catastro oficial ni scores) */}
            {!catastro && (c.calidad_estimada || (!c.has_data && !c.scores)) && (
              <div style={{ marginTop: 12, marginBottom: 10 }}>
                <DisclosurePill esEstimado quality={c.calidad_estimada ? 'estimated' : 'seeded'} />
              </div>
            )}

            {/* Scores en lenguaje de beneficio */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16, marginBottom: 16 }}>
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
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#5A6B52', marginBottom: 10 }}>{tc('Valor del suelo · Catastro oficial')}</div>
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
                      <div style={{ fontSize: 11, color: '#7C5CFF' }}>{s.alcaldia}{s.valor_m2 ? ` · $${s.valor_m2.toLocaleString('es-MX')}/m²` : ''}</div>
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

            <Link to={`/zona/${c.id}?ver=propiedades`} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
              padding: '12px', borderRadius: 12, textDecoration: 'none',
              background: 'var(--grad)', color: '#fff', fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
            }} data-testid="panel-open-marketplace">
              Ver desarrollos en {c.name} <ArrowRight size={13} />
            </Link>
          </div>
          );
        })()}
      </aside>

      {/* ========================= MAPA ========================= */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
        <div ref={container} style={{ position: 'absolute', inset: 0 }} data-testid="mapa-container" />

        {/* Búsqueda in-map (jump a colonia) — arriba-izquierda, estilo Monopolio/propiedades.com */}
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: Z.DROPDOWN, width: 262 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)', border: '1px solid #ECECEF', borderRadius: mapSearch.trim().length >= 2 ? '13px 13px 0 0' : 13, boxShadow: '0 6px 24px rgba(16,24,40,0.10)' }}>
            <span style={{ color: '#9AA0AE', fontSize: 15 }}>⌕</span>
            <input value={mapSearch} onChange={(e) => setMapSearch(e.target.value)} placeholder="Busca una colonia…" aria-label="Buscar una colonia en el mapa" data-testid="mapa-search"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'DM Sans', fontSize: 13, color: '#1E2230' }} />
            {mapSearch && <button onClick={() => setMapSearch('')} aria-label="Limpiar búsqueda" style={{ border: 'none', background: 'transparent', color: '#9AA0AE', cursor: 'pointer', fontSize: 13 }}>✕</button>}
          </div>
          {mapSearch.trim().length >= 2 && (() => {
            const q = mapSearch.trim().toLowerCase();
            const hits = colonias.filter((c) => (c.name || '').toLowerCase().includes(q)).slice(0, 7);
            return (
              <div style={{ background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(16px)', border: '1px solid #ECECEF', borderTop: 'none', borderRadius: '0 0 13px 13px', boxShadow: '0 12px 32px rgba(16,24,40,0.14)', overflow: 'hidden' }}>
                {hits.length === 0 ? (
                  <div style={{ padding: '11px 13px', fontFamily: 'DM Sans', fontSize: 12.5, color: '#9AA0AE' }}>Sin resultados</div>
                ) : hits.map((c) => (
                  <button key={c.id} onClick={() => {
                    const m = mapRef.current;
                    let center = c.center;
                    if (!center && geojson) { const f = (geojson.features || []).find((ft) => (ft.properties || {}).id === c.id); if (f) center = _polyCentroid(f.geometry); }
                    setSelected({ ...c }); setMapSearch('');
                    if (center && m) m.flyTo({ center, zoom: 13.8, duration: 900 });
                  }} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: '9px 13px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F9'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: '#1E2230' }}>{c.name}</span>
                    <span style={{ fontSize: 10.5, color: '#9AA0AE' }}>{c.alcaldia || ''}</span>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Leyenda FLOTANTE (bottom-left) — siempre visible, refleja la capa activa + su fuente. */}
        {capaMeta && (() => {
          const m = capaMeta; const st = m.stats || {};
          const isScore = m.scale === 'score';
          const grad = isScore
            ? 'linear-gradient(to right, #E5484D, #F0883E, #F5D90A, #8DCE4A, #2F9E44)'
            : 'linear-gradient(to right, #CFE3F2, #9FB6E6, #9079D8, #7C5CFF, #C63FAE)';
          const fmt = (v) => {
            if (v == null || isNaN(v)) return '—';
            if (m.scale === 'price' || m.scale === 'price_hi') return '$' + (Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v));
            if (m.unit === '%' || m.unit === '%/año') return (Math.round(v * 10) / 10) + '%';
            if (isScore) return Math.round(v);
            return Math.round(v * 100) / 100;
          };
          const src = m.fuente === 'sistema_ie' ? 'Índice DesarrollosMX'
            : m.fuente === 'colonia_valoracion' ? 'AVM / SHF DesarrollosMX'
            : m.fuente === 'colonia_catastro_byid' ? 'Catastro SIGCDMX' : 'Catastro oficial SIGCDMX';
          return (
            <div data-testid="mapa-legend" style={{
              position: 'absolute', left: 16, bottom: 22, zIndex: Z.DROPDOWN, width: 222,
              background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(16px)', border: '1px solid #ECECEF',
              borderRadius: 14, boxShadow: '0 8px 28px rgba(16,24,40,0.12)', padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
                <span style={{ fontSize: 15 }}>{m.emoji}</span>
                <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12.5, color: '#1E2230', letterSpacing: '-0.01em' }}>{m.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#9AA0AE', fontWeight: 600 }}>{m.unit}</span>
              </div>
              <div style={{ height: 9, borderRadius: 9999, background: grad }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 10.5, color: '#5A5F6E', marginTop: 6 }}>
                <span>{isScore ? '0' : fmt(st.min)}</span><span>{isScore ? '50' : fmt(st.p50)}</span><span>{isScore ? '100' : fmt(st.max)}</span>
              </div>
              <div style={{ fontSize: 9.5, color: '#9AA0AE', marginTop: 8, lineHeight: 1.35 }}>
                {src}{m.es_estimado ? ' · estimado' : m.es_estimado === false ? ' · dato oficial' : ''}
              </div>
            </div>
          );
        })()}

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

        {/* Backdrop para cerrar el selector al hacer click fuera */}
        {capaOpen && (
          <div onClick={() => setCapaOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: Z.DROPDOWN - 1 }} />
        )}

        {/* Controles flotantes glass arriba-derecha: SELECTOR DE CAPA ("¿qué pinto?") + toggle desarrollos */}
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: Z.DROPDOWN, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{
            display: 'flex', gap: 6, padding: 4,
            background: 'rgba(255,255,255,0.92)', border: '1px solid #ECECEC',
            backdropFilter: 'blur(18px)', boxShadow: '0 8px 28px rgba(16,24,40,0.12)', borderRadius: 9999,
          }}>
            <button onClick={() => setCapaOpen((o) => !o)} data-testid="capa-selector" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 9999,
              background: 'var(--grad)', color: '#fff', border: 'none', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer',
            }}>
              <span style={{ fontSize: 14 }}>{(capaMeta && capaMeta.emoji) || '💰'}</span>
              <span>{(capaMeta && capaMeta.label) || 'Valor del suelo'}</span>
              <span style={{ opacity: 0.85, fontSize: 10, transform: capaOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>▾</span>
            </button>
            <button onClick={() => setShowDevs((v) => !v)} data-testid="toggle-desarrollos" style={{
              padding: '7px 14px', borderRadius: 9999,
              background: showDevs ? 'rgba(31,160,106,0.14)' : 'transparent',
              color: showDevs ? '#1FA06A' : '#5A5F6E',
              border: 'none', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer',
            }}>{tc('Desarrollos')}</button>
          </div>

          {/* Dropdown de capas agrupado por categoría (surface de valor/AVM/plusvalía/gentrificación/FAR + 8 índices IE) */}
          {capaOpen && (
            <div data-testid="capa-menu" style={{
              width: 292, maxHeight: '68vh', overflowY: 'auto',
              background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(20px)',
              border: '1px solid #ECECEF', borderRadius: 16, boxShadow: '0 16px 48px rgba(16,24,40,0.18)', padding: 8,
            }}>
              {(() => {
                const order = []; const g = {};
                capas.forEach((c) => { if (!g[c.cat]) { g[c.cat] = []; order.push(c.cat); } g[c.cat].push(c); });
                return order.map((cat) => (
                  <div key={cat} style={{ marginBottom: 2 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#9AA0AE', padding: '9px 10px 4px' }}>{cat}</div>
                    {g[cat].map((c) => {
                      const on = activeCapa === c.key;
                      return (
                        <button key={c.key} onClick={() => { setActiveCapa(c.key); setCapaOpen(false); }} data-testid={`capa-${c.key}`} style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 11,
                          border: 'none', background: on ? 'rgba(124,92,255,0.10)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background .12s',
                        }}
                          onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = '#F5F5F9'; }}
                          onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
                          <span style={{ fontSize: 17, width: 22, textAlign: 'center', flexShrink: 0 }}>{c.emoji}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: '#1E2230' }}>{c.label}</span>
                            <span style={{ display: 'block', fontSize: 10.5, color: '#9AA0AE', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.help}</span>
                          </span>
                          {on && <span style={{ color: 'var(--theme)', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
              <div style={{ fontSize: 10, color: '#9AA0AE', padding: '9px 10px 4px', borderTop: '1px solid #F1F2F6', marginTop: 4, lineHeight: 1.4 }}>
                Cada capa muestra su fuente y si es estimada. Nada inventado.
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

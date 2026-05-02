/**
 * SiteSelectionMap — Mapbox plot of candidate zones for Site Selection AI.
 * Phase 4 Batch 7 · 4.22
 * Renders polygons coloured by feasibility_score and circle markers.
 */
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
const SOURCE = 'site_zones';
const FILL_LAYER = 'site_zones_fill';
const LINE_LAYER = 'site_zones_line';
const POINT_LAYER = 'site_zones_point';

export default function SiteSelectionMap({ zones = [], selectedId, onSelect, height = 480 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-99.17, 19.405],
      zoom: 10.6,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    return () => {
      try { map.remove(); } catch (e) { /* noop */ }
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zones?.length) return;

    const features = zones.map(z => ({
      type: 'Feature',
      properties: {
        colonia_id: z.colonia_id,
        colonia: z.colonia,
        feasibility: z.feasibility_score,
        roi: z.estimated_roi_5y,
      },
      geometry: z.polygon
        ? { type: 'Polygon', coordinates: [
            z.polygon[0]?.length === 2 && z.polygon[0][0] !== z.polygon.at(-1)?.[0]
              ? [...z.polygon, z.polygon[0]] : z.polygon,
          ] }
        : { type: 'Point', coordinates: z.center || [-99.17, 19.41] },
    }));
    const points = zones.map(z => ({
      type: 'Feature',
      properties: {
        colonia_id: z.colonia_id,
        colonia: z.colonia,
        feasibility: z.feasibility_score,
      },
      geometry: { type: 'Point', coordinates: z.center || [-99.17, 19.41] },
    }));
    const fc = { type: 'FeatureCollection', features: [...features, ...points] };

    const apply = () => {
      try {
        if (map.getSource(SOURCE)) {
          map.getSource(SOURCE).setData(fc);
        } else {
          map.addSource(SOURCE, { type: 'geojson', data: fc });
          map.addLayer({
            id: FILL_LAYER, type: 'fill', source: SOURCE,
            filter: ['==', '$type', 'Polygon'],
            paint: {
              'fill-color': [
                'interpolate', ['linear'], ['get', 'feasibility'],
                0,  'rgba(240,235,224,0.05)',
                40, 'rgba(99,102,241,0.32)',
                65, 'rgba(99,102,241,0.55)',
                85, 'rgba(236,72,153,0.65)',
                100,'rgba(236,72,153,0.85)',
              ],
              'fill-opacity': 0.78,
            },
          });
          map.addLayer({
            id: LINE_LAYER, type: 'line', source: SOURCE,
            filter: ['==', '$type', 'Polygon'],
            paint: { 'line-color': 'rgba(240,235,224,0.42)', 'line-width': 1.2 },
          });
          map.addLayer({
            id: POINT_LAYER, type: 'circle', source: SOURCE,
            filter: ['==', '$type', 'Point'],
            paint: {
              'circle-radius': 9,
              'circle-color': '#F0EBE0',
              'circle-stroke-color': '#06080F',
              'circle-stroke-width': 2,
              'circle-opacity': 0.95,
            },
          });
          map.on('mousemove', FILL_LAYER, (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const f = e.features[0]; if (!f) return;
            const p = f.properties || {};
            popupRef.current.setLngLat(e.lngLat).setHTML(`
              <div style="font-family:DM Sans;color:#06080F;padding:4px 4px 0;min-width:140px;">
                <div style="font-family:Outfit;font-weight:700;font-size:12px;">${p.colonia}</div>
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:2px;"><span>Feasibility</span><b>${p.feasibility}</b></div>
                <div style="display:flex;justify-content:space-between;font-size:11px;"><span>ROI 5y</span><b>${p.roi}%</b></div>
              </div>`).addTo(map);
          });
          map.on('mouseleave', FILL_LAYER, () => { map.getCanvas().style.cursor = ''; popupRef.current.remove(); });
          map.on('click', FILL_LAYER, (e) => {
            const f = e.features[0]; if (!f) return;
            if (onSelect) onSelect(f.properties.colonia_id);
          });
          map.on('click', POINT_LAYER, (e) => {
            const f = e.features[0]; if (!f) return;
            if (onSelect) onSelect(f.properties.colonia_id);
          });
        }
        // Fit bounds to all polygons
        const b = new mapboxgl.LngLatBounds();
        zones.forEach(z => (z.polygon || []).forEach(c => b.extend(c)));
        if (!b.isEmpty()) map.fitBounds(b, { padding: 40, maxZoom: 12.5, animate: false });
      } catch (e) { /* noop */ }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [zones, onSelect]);

  // Highlight selected polygon by changing the source line width via filter (fast path: ignore for v1).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const z = zones.find(zz => zz.colonia_id === selectedId);
    if (!z?.center) return;
    map.flyTo({ center: z.center, zoom: 13.2, speed: 1.4 });
  }, [selectedId, zones]);

  if (!TOKEN) {
    return (
      <div data-testid="site-map-token-missing" style={{
        height, borderRadius: 12, padding: 20, background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border)', color: 'var(--cream-3)',
        fontFamily: 'DM Sans', fontSize: 12.5,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      }}>Mapa indisponible — falta REACT_APP_MAPBOX_TOKEN</div>
    );
  }

  return (
    <div ref={containerRef} data-testid="site-selection-map"
         style={{ height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }} />
  );
}

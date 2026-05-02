/**
 * DemandHeatmapMap — Phase 4 Batch 6 · 4.17
 * Renders a Mapbox choropleth from /api/dev/analytics/demand-heatmap output.
 * - Fills polygon by demand_score (0–100) with a 5-stop ramp (cream → gradient).
 * - Hover/click popup with leads/appts/searches/score.
 * - Honors REACT_APP_MAPBOX_TOKEN; degrades to colored list if missing.
 */
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
const SOURCE_ID = 'dmx_demand';
const FILL_LAYER = 'dmx_demand_fill';
const LINE_LAYER = 'dmx_demand_line';

export default function DemandHeatmapMap({ geojson, height = 460, onSelectColonia }) {
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

  // Update source whenever geojson changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;
    const apply = () => {
      try {
        if (map.getSource(SOURCE_ID)) {
          map.getSource(SOURCE_ID).setData(geojson);
        } else {
          map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
          map.addLayer({
            id: FILL_LAYER,
            type: 'fill',
            source: SOURCE_ID,
            paint: {
              'fill-color': [
                'interpolate', ['linear'], ['get', 'demand_score'],
                0,   'rgba(240,235,224,0.05)',
                15,  'rgba(99,102,241,0.32)',
                40,  'rgba(99,102,241,0.55)',
                70,  'rgba(236,72,153,0.62)',
                100, 'rgba(236,72,153,0.85)',
              ],
              'fill-opacity': 0.85,
            },
          });
          map.addLayer({
            id: LINE_LAYER,
            type: 'line',
            source: SOURCE_ID,
            paint: {
              'line-color': 'rgba(240,235,224,0.42)',
              'line-width': 1.2,
            },
          });
          map.on('mousemove', FILL_LAYER, (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const f = e.features[0];
            if (!f) return;
            const p = f.properties || {};
            const lead = p.leads_count || 0;
            const apt = p.appointments_count || 0;
            const sc = p.searches_count;
            const html = `
              <div style="font-family:DM Sans;color:#06080F;padding:6px 4px 4px;min-width:170px;">
                <div style="font-family:Outfit;font-weight:700;font-size:13px;margin-bottom:4px;">${p.colonia}</div>
                <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${p.alcaldia || ''}</div>
                <div style="display:flex;justify-content:space-between;font-size:12px;"><span>Score</span><b>${p.demand_score}</b></div>
                <div style="display:flex;justify-content:space-between;font-size:12px;"><span>Leads</span><b>${lead}</b></div>
                <div style="display:flex;justify-content:space-between;font-size:12px;"><span>Citas</span><b>${apt}</b></div>
                ${sc != null ? `<div style="display:flex;justify-content:space-between;font-size:12px;"><span>Búsquedas</span><b>${sc}</b></div>` : ''}
              </div>`;
            popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
          });
          map.on('mouseleave', FILL_LAYER, () => {
            map.getCanvas().style.cursor = '';
            popupRef.current.remove();
          });
          map.on('click', FILL_LAYER, (e) => {
            const f = e.features[0];
            if (!f) return;
            const p = f.properties || {};
            if (onSelectColonia) onSelectColonia(p.colonia_id, p);
            // Sticky CTA popup → site-selection wizard prefill
            try { popupRef.current.remove(); } catch (er) { /* noop */ }
            const sticky = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, offset: 8, className: 'dmx-cta-popup' });
            const html = `
              <div style="font-family:DM Sans;color:#06080F;padding:8px 6px;min-width:200px;">
                <div style="font-family:Outfit;font-weight:700;font-size:13px;">${p.colonia}</div>
                <div style="font-size:11px;opacity:0.7;text-transform:uppercase;margin-bottom:8px;">${p.alcaldia || ''} · score ${p.demand_score}</div>
                <a data-testid="heatmap-cta-feasibility"
                   href="/desarrollador/site-selection?prefill_colonia=${encodeURIComponent(p.colonia)}&prefill_state=CDMX&from=heatmap"
                   style="display:inline-block;padding:6px 11px;border-radius:9999px;background:transparent;border:1px solid #06080F;color:#06080F;font-family:DM Sans;font-size:11.5px;font-weight:600;text-decoration:none;">
                  Ver feasibility para nuevo proyecto →
                </a>
              </div>`;
            sticky.setLngLat(e.lngLat).setHTML(html).addTo(map);
          });
        }
        // Fit bounds to all features
        if (geojson.features?.length) {
          const b = new mapboxgl.LngLatBounds();
          geojson.features.forEach(ft => {
            (ft.geometry?.coordinates?.[0] || []).forEach(c => b.extend(c));
          });
          if (!b.isEmpty()) map.fitBounds(b, { padding: 30, maxZoom: 12.5, animate: false });
        }
      } catch (e) { /* noop */ }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [geojson, onSelectColonia]);

  if (!TOKEN) {
    return (
      <div data-testid="demand-mapbox-token-missing" style={{
        height, borderRadius: 12, padding: 20, background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border)', color: 'var(--cream-3)',
        fontFamily: 'DM Sans', fontSize: 12.5,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      }}>
        Mapa indisponible — falta REACT_APP_MAPBOX_TOKEN
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="demand-heatmap-map"
      style={{ height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}
    />
  );
}

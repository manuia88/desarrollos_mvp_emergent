// W5.ASR.4 Parte 1 · CMAComparablesMap — Mapbox con marker subject + comparables.
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

// Coordenadas seed por colonia (centros aprox). Si la colonia no está aquí,
// fallback a CDMX centro.
const COLONIA_CENTERS = {
  polanco:           [-99.1939, 19.4330],
  'lomas-chapultepec': [-99.2124, 19.4190],
  pedregal:          [-99.1640, 19.3910],
  condesa:           [-99.1738, 19.4110],
  'roma-norte':      [-99.1616, 19.4180],
  'roma-sur':        [-99.1620, 19.4080],
  juarez:            [-99.1650, 19.4250],
  doctores:          [-99.1560, 19.4350],
  cuauhtemoc:        [-99.1560, 19.4350],
  coyoacan:          [-99.1620, 19.3500],
  'del-valle':       [-99.1700, 19.3900],
  narvarte:          [-99.1620, 19.3950],
  napoles:           [-99.1820, 19.3920],
  'santa-fe':        [-99.2570, 19.3580],
  tlalpan:           [-99.1700, 19.2950],
  xochimilco:        [-99.1030, 19.2570],
};

const CDMX_CENTER = [-99.1332, 19.4326];

function centerForSlug(slug) {
  return COLONIA_CENTERS[slug] || CDMX_CENTER;
}

export default function CMAComparablesMap({ cma, hoveredId, onMarkerHover }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current || !cma) return;
    mapboxgl.accessToken = TOKEN;
    const subjectCenter = centerForSlug(cma.subject_property?.colonia_slug);

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: subjectCenter,
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      // Subject marker (gradient · pink/indigo) más grande
      const subjEl = document.createElement('div');
      subjEl.setAttribute('data-testid', 'cma-map-subject-marker');
      subjEl.style.width = '24px';
      subjEl.style.height = '24px';
      subjEl.style.borderRadius = '9999px';
      subjEl.style.background = 'linear-gradient(135deg, #6366F1, #EC4899)';
      subjEl.style.border = '3px solid #fff';
      subjEl.style.boxShadow = '0 0 18px rgba(236,72,153,0.7)';
      subjEl.style.cursor = 'pointer';
      const subjPopup = new mapboxgl.Popup({ offset: 18 }).setHTML(
        `<div style="font-family: 'DM Sans'; font-size: 12px; color: #0D1118;">
          <strong>Sujeto · ${cma.subject_property?.colonia_name || ''}</strong><br>
          ${cma.subject_property?.m2 || '?'} m² · ${cma.subject_property?.recamaras || '?'} rec
        </div>`
      );
      const subjMarker = new mapboxgl.Marker({ element: subjEl })
        .setLngLat(subjectCenter)
        .setPopup(subjPopup)
        .addTo(map);
      markersRef.current.push({ id: 'subject', marker: subjMarker, el: subjEl });

      // Markers comparables
      const bounds = new mapboxgl.LngLatBounds().extend(subjectCenter);
      (cma.comparables || []).forEach((c, idx) => {
        const coord = centerForSlug(c.colonia_slug);
        // Pequeño offset aleatorio determinístico para evitar overlap
        const dx = (((idx * 37) % 13) - 6) * 0.0008;
        const dy = (((idx * 53) % 11) - 5) * 0.0008;
        const lngLat = [coord[0] + dx, coord[1] + dy];

        const el = document.createElement('div');
        const rowId = `${c.dev_id}-${c.prototype_name || idx}`;
        el.setAttribute('data-testid', `cma-map-comp-marker-${idx}`);
        el.dataset.rowId = rowId;
        el.style.width = '14px';
        el.style.height = '14px';
        el.style.borderRadius = '9999px';
        el.style.background = c.similarity_score >= 0.65 ? '#22C55E'
                            : c.similarity_score >= 0.45 ? '#F59E0B' : '#EF4444';
        el.style.border = '2px solid #fff';
        el.style.boxShadow = '0 0 6px rgba(0,0,0,0.5)';
        el.style.cursor = 'pointer';
        el.style.transition = 'transform 0.15s';

        const popup = new mapboxgl.Popup({ offset: 14 }).setHTML(
          `<div style="font-family: 'DM Sans'; font-size: 11.5px; color: #0D1118; min-width: 160px;">
            <strong>${c.name}</strong><br>
            ${c.m2}m² · ${c.recamaras} rec · ${c.banos} bañ<br>
            $${(c.price / 1_000_000).toFixed(2)}M MXN<br>
            <span style="color: #666;">$${Math.round(c.price_per_m2).toLocaleString('es-MX')}/m²</span>
          </div>`
        );
        const m = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).setPopup(popup).addTo(map);
        bounds.extend(lngLat);
        markersRef.current.push({ id: rowId, marker: m, el });

        el.addEventListener('mouseenter', () => onMarkerHover?.(rowId));
        el.addEventListener('mouseleave', () => onMarkerHover?.(null));
      });

      // Fit a todos los markers
      try {
        map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 600 });
      } catch (_) {
        /* fallback: keep initial center */
      }
    });

    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cma?.id]);

  // Highlight cuando se hace hover en una fila de la tabla
  useEffect(() => {
    markersRef.current.forEach(({ id, el }) => {
      if (id === 'subject') return;
      el.style.transform = id === hoveredId ? 'scale(1.6)' : 'scale(1)';
      el.style.zIndex = id === hoveredId ? '10' : '1';
    });
  }, [hoveredId]);

  if (!TOKEN) {
    return (
      <div
        data-testid="cma-map-no-token"
        style={{
          height: 420, borderRadius: 16,
          background: '#0D1118', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
        }}>
        Mapa no disponible (sin token Mapbox)
      </div>
    );
  }

  return (
    <div
      data-testid="cma-comparables-map"
      ref={containerRef}
      style={{
        height: 420,
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    />
  );
}

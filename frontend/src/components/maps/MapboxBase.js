/**
 * W4.18.2A — MapboxBase
 * Wrapper Mapbox GL JS reusable. Expone mapRef y onMapLoad callback.
 * Props: style, center, zoom, minZoom, maxZoom, onLoad, onMove, onClick
 */
import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || '';

const CDMX_BOUNDS = [
  [-99.45, 19.05],   // SW
  [-98.85, 19.80],   // NE
];

export default function MapboxBase({
  mapRef,
  style = 'mapbox://styles/mapbox/dark-v11',
  center = [-99.1332, 19.4326],
  zoom = 11,
  minZoom = 9,
  maxZoom = 17,
  onLoad,
  onMove,
  onClick,
  children,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // already initialized

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style,
      center,
      zoom,
      minZoom,
      maxZoom,
      maxBounds: CDMX_BOUNDS,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      mapRef.current = map;
      if (onLoad) onLoad(map);
    });

    if (onMove) {
      map.on('moveend', () => {
        const c = map.getCenter();
        const z = map.getZoom();
        onMove({ lat: c.lat, lng: c.lng, zoom: z });
      });
    }

    if (onClick) {
      map.on('click', onClick);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid="mapbox-container"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}

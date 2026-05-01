/**
 * MapboxPicker — Phase 4.5
 * Click-to-set lat/lng marker. Reuses REACT_APP_MAPBOX_TOKEN.
 * Props: lat, lng, zoom, onSave(lat, lng, zoom), readOnly
 */
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, CheckCircle } from '../icons';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

export default function MapboxPicker({ lat, lng, zoom = 13, onSave, readOnly = false, height = 340 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [coords, setCoords] = useState({ lat: lat || 19.4326, lng: lng || -99.1332 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [coords.lng, coords.lat],
      zoom: zoom,
    });
    mapRef.current = map;

    // Marker
    const el = document.createElement('div');
    el.style.cssText = 'width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#EC4899,#6366F1);border:2px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,0.5);cursor:pointer;';
    const marker = new mapboxgl.Marker({ element: el, draggable: !readOnly })
      .setLngLat([coords.lng, coords.lat])
      .addTo(map);
    markerRef.current = marker;

    if (!readOnly) {
      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        setCoords({ lat: lngLat.lat, lng: lngLat.lng });
        setSaved(false);
      });

      map.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        marker.setLngLat([lng, lat]);
        setCoords({ lat, lng });
        setSaved(false);
      });
    }

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line
  }, []);

  // Update marker when lat/lng props change externally
  useEffect(() => {
    if (lat && lng && markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
      setCoords({ lat, lng });
      mapRef.current?.flyTo({ center: [lng, lat], zoom });
    }
    // eslint-disable-next-line
  }, [lat, lng]);

  const handleSave = async () => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await onSave(coords.lat, coords.lng, mapRef.current?.getZoom() || zoom);
      setSaved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!TOKEN) {
    return (
      <div data-testid="mapbox-token-missing" style={{
        height, background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border)',
        borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <MapPin size={24} color="var(--cream-4)" />
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>Configura REACT_APP_MAPBOX_TOKEN para el mapa</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div ref={containerRef} style={{ height, width: '100%' }} />

      {/* Coords overlay */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, right: readOnly ? 12 : 160,
        background: 'rgba(13,17,24,0.86)', backdropFilter: 'blur(8px)',
        borderRadius: 8, padding: '6px 12px',
        fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--cream-2)',
      }}>
        {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
      </div>

      {/* Save button (only in edit mode) */}
      {!readOnly && (
        <button
          onClick={handleSave}
          disabled={saving}
          data-testid="mapbox-save-btn"
          style={{
            position: 'absolute', bottom: 12, right: 12,
            padding: '7px 16px', borderRadius: 9999,
            background: saved ? 'rgba(34,197,94,0.2)' : 'var(--grad)',
            border: saved ? '1px solid rgba(34,197,94,0.4)' : 'none',
            color: saved ? '#86efac' : '#fff',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1,
          }}
        >
          {saved ? <><CheckCircle size={13} /> Guardado</> : saving ? 'Guardando...' : <><MapPin size={12} /> Guardar ubicación</>}
        </button>
      )}

      {!readOnly && (
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(13,17,24,0.82)', backdropFilter: 'blur(6px)',
          borderRadius: 8, padding: '5px 10px',
          fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)',
        }}>
          Haz clic en el mapa o arrastra el marcador para posicionar
        </div>
      )}
    </div>
  );
}

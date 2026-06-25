/**
 * LugaresMap — mapa interactivo de lugares (maplibre-gl LAZY, estilo CARTO Positron sin token). EXTRAÍDO de ZonePageV2 para
 * reusarlo en la ficha SIN duplicar (un solo origen). Pins de la categoría activa + popup in-platform (nombre + ★, sin sacar al
 * cliente a Google). fitBounds al cambiar categoría; flyTo al lugar seleccionado. `home` opcional = pin del desarrollo (📍).
 */
import React, { useState, useRef, useEffect } from 'react';

export default function LugaresMap({ places, icon, center, selected, onResetView, home }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const mlRef = useRef(null);
  const markersRef = useRef({});
  const homeRef = useRef(null);
  const [ready, setReady] = useState(0);
  const pts = (places || []).filter((p) => p && p.loc && p.loc.latitude && p.loc.longitude);

  useEffect(() => {
    let cancelled = false;
    if (!ref.current || mapRef.current) return undefined;
    const homeCenter = home && home.loc ? [home.loc.longitude, home.loc.latitude] : null;
    import('maplibre-gl').then((mod) => {
      if (cancelled || !ref.current || mapRef.current) return;
      const maplibregl = mod.default || mod;
      mlRef.current = maplibregl;
      const map = new maplibregl.Map({ container: ref.current, style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', center: center || homeCenter || [-99.1665, 19.4101], zoom: 13, attributionControl: false });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => { if (!cancelled) { mapRef.current = map; setReady((r) => r + 1); } });
    }).catch(() => {});
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // pin del desarrollo (📍) — fijo mientras haya coords
  useEffect(() => {
    const map = mapRef.current; const maplibregl = mlRef.current;
    if (!map || !maplibregl || !home || !home.loc) return;
    if (homeRef.current) homeRef.current.remove();
    const el = document.createElement('div');
    el.textContent = '📍';
    el.style.cssText = 'font-size:30px;line-height:1;filter:drop-shadow(0 3px 5px rgba(0,0,0,.4));';
    const popup = new maplibregl.Popup({ offset: 20, closeButton: false }).setHTML(`<div style="font-family:'DM Sans',sans-serif;font-weight:800;font-size:12.5px;color:#3A3E55;">${String(home.label || 'Aquí').replace(/</g, '&lt;')}</div>`);
    homeRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([home.loc.longitude, home.loc.latitude]).setPopup(popup).addTo(map);
  }, [ready, home && home.loc && home.loc.latitude]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current; const maplibregl = mlRef.current;
    if (!map || !maplibregl) return;
    Object.values(markersRef.current).forEach((m) => m.remove()); markersRef.current = {};
    if (!pts.length) return;
    const bounds = new maplibregl.LngLatBounds();
    pts.forEach((p) => {
      const el = document.createElement('div');
      el.textContent = icon;
      el.style.cssText = 'font-size:21px;cursor:pointer;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));';
      const safe = String(p.name || '').replace(/</g, '&lt;');
      const rev = p.reviews ? ` · ${p.reviews > 999 ? `${Math.round(p.reviews / 1000)}k` : p.reviews} reseñas` : '';
      const html = `<div style="font-family:'DM Sans',sans-serif;max-width:190px;"><div style="font-weight:700;font-size:12.5px;color:#3A3E55;">${safe}</div>${p.rating ? `<div style="color:#0E7A53;font-weight:800;font-size:11.5px;margin-top:2px;">★${p.rating}<span style="color:#A2A6BC;font-weight:600;">${rev}</span></div>` : ''}</div>`;
      const popup = new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(html);
      const mk = new maplibregl.Marker({ element: el }).setLngLat([p.loc.longitude, p.loc.latitude]).setPopup(popup).addTo(map);
      markersRef.current[p.name] = mk;
      bounds.extend([p.loc.longitude, p.loc.latitude]);
    });
    if (home && home.loc) bounds.extend([home.loc.longitude, home.loc.latitude]);
    if (!bounds.isEmpty()) { try { map.fitBounds(bounds, { padding: 48, maxZoom: 15.5, duration: 450 }); } catch (e) { /* noop */ } }
  }, [places, icon, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current; const maplibregl = mlRef.current;
    if (!map || !maplibregl) return;
    try {
      if (selected && selected.loc) {
        map.flyTo({ center: [selected.loc.longitude, selected.loc.latitude], zoom: 16, duration: 600 });
        const mk = markersRef.current[selected.name];
        if (mk && mk.getPopup && !mk.getPopup().isOpen()) mk.togglePopup();
      } else {
        Object.values(markersRef.current).forEach((m) => { try { if (m.getPopup && m.getPopup().isOpen()) m.togglePopup(); } catch (e) { /* noop */ } });
        const bounds = new maplibregl.LngLatBounds();
        pts.forEach((p) => bounds.extend([p.loc.longitude, p.loc.latitude]));
        if (home && home.loc) bounds.extend([home.loc.longitude, home.loc.latitude]);
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 15.5, duration: 600 });
      }
    } catch (e) { /* noop */ }
  }, [selected, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pts.length && !(home && home.loc)) return null;
  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} className="zv2-map" style={{ width: '100%', height: 'clamp(300px,42vw,420px)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--card-border, rgba(16,18,28,0.1))', background: '#EAEAF2' }} />
      {selected && (
        <button type="button" onClick={() => onResetView && onResetView()} style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 5, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: '#fff', color: '#4F46E5', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12.5, boxShadow: '0 6px 18px rgba(16,18,28,0.18)' }}>🔍 Ver todo el mapa</button>
      )}
    </div>
  );
}

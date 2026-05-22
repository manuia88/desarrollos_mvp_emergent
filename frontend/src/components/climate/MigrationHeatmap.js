// W5.9 · MigrationHeatmap · Mapbox con colormap outflow/inflow + fallback lista
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTranslation } from 'react-i18next';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
const CDMX_CENTER = [-99.1332, 19.4326];
const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function clampNum(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function colorForNet(netScore) {
  // outflow fuerte → rojo · neutral → indigo · inflow fuerte → verde
  if (netScore <= -30) return '#EF4444';
  if (netScore <= 30) return INDIGO;
  return '#22C55E';
}

function radiusForMagnitude(out, inn) {
  const mag = Math.max(Math.abs(Number(out) || 0), Math.abs(Number(inn) || 0));
  // 0-100 → 8-22
  return Math.round(8 + (clampNum(mag, 0, 100) / 100) * 14);
}

export default function MigrationHeatmap({ zones = [], height = 480, onZoneClick }) {
  const { t } = useTranslation('common');
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [hovered, setHovered] = useState(null);

  const safeZones = useMemo(
    () => (Array.isArray(zones) ? zones.filter((z) => z && z.centroid && Number.isFinite(z.centroid.lat) && Number.isFinite(z.centroid.lng)) : []),
    [zones],
  );

  // Init mapa una sola vez
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return undefined;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: CDMX_CENTER,
      zoom: 10,
      attributionControl: false,
      interactive: true,
    });
    mapRef.current = map;
    return () => {
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
      markersRef.current = [];
    };
  }, []);

  // Update markers cuando cambian zones
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Limpiar markers previos
    markersRef.current.forEach((m) => { try { m.remove(); } catch { /* ignore */ } });
    markersRef.current = [];

    safeZones.forEach((z) => {
      const net = Number(z.net_score) || 0;
      const r = radiusForMagnitude(z.outflow_score, z.inflow_score);
      const color = colorForNet(net);
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('data-testid', `migration-marker-${z.zone_slug}`);
      el.setAttribute('aria-label', `${z.zone_name} · neto ${Math.round(net)}`);
      el.style.cssText = `
        width:${r * 2}px; height:${r * 2}px; border-radius:9999px;
        background:${color}; border:2px solid rgba(255,255,255,0.85);
        box-shadow: 0 0 18px ${color}88;
        cursor:pointer; opacity:0.92; padding:0; margin:0;
        transition: transform 280ms ${EASE};
      `;
      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.12)';
        setHovered(z);
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
        setHovered(null);
      });
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof onZoneClick === 'function') onZoneClick(z.zone_slug);
      });
      const m = new mapboxgl.Marker({ element: el })
        .setLngLat([z.centroid.lng, z.centroid.lat])
        .addTo(map);
      markersRef.current.push(m);
    });
  }, [safeZones, onZoneClick]);

  // Fallback sin token Mapbox: lista accesible con misma info
  if (!TOKEN) {
    return (
      <section
        data-testid="migration-heatmap-fallback"
        style={{
          background: CARD_BG, border: BORDER, borderRadius: 20, padding: 18,
          fontFamily: 'DM Sans, sans-serif', color: CREAM,
        }}
      >
        <p style={{ margin: '0 0 12px', color: MUTED, fontSize: 13 }}>
          {t('climateMigration.heatmap_empty', 'Mapa no disponible · listado de zonas:')}
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {safeZones.map((z) => (
            <li key={z.zone_slug}>
              <button
                type="button"
                data-testid={`migration-fallback-row-${z.zone_slug}`}
                onClick={() => onZoneClick && onZoneClick(z.zone_slug)}
                style={{
                  width: '100%', display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto auto',
                  gap: 10, alignItems: 'center',
                  padding: '10px 12px', borderRadius: 12,
                  background: 'rgba(240,235,224,0.04)',
                  border: '1px solid rgba(240,235,224,0.06)',
                  color: CREAM, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 9999,
                  background: colorForNet(Number(z.net_score) || 0),
                }} />
                <span style={{ textAlign: 'left', fontSize: 14, fontWeight: 600 }}>{z.zone_name}</span>
                <span style={{ fontSize: 11, color: MUTED }}>out {Math.round(z.outflow_score || 0)} · in {Math.round(z.inflow_score || 0)}</span>
                <span style={{ fontSize: 11, color: MUTED_2, fontVariantNumeric: 'tabular-nums' }}>net {Math.round(z.net_score || 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div
      data-testid="migration-heatmap"
      style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', border: BORDER, background: CARD_BG }}
    >
      <div ref={containerRef} style={{ width: '100%', height, background: '#06080F' }} />

      {/* Hover tooltip */}
      {hovered && (
        <div
          data-testid="migration-hover-tooltip"
          style={{
            position: 'absolute', top: 12, left: 12,
            padding: '10px 14px', borderRadius: 12,
            background: 'rgba(13,16,23,0.95)',
            border: BORDER,
            color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 12,
            maxWidth: 260, pointerEvents: 'none',
            backdropFilter: 'blur(20px)',
          }}
        >
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            {hovered.zone_name}
          </div>
          <div style={{ color: MUTED, fontSize: 11 }}>
            Out: <span style={{ color: '#EF4444' }}>{Math.round(hovered.outflow_score || 0)}</span> ·
            In: <span style={{ color: '#22C55E' }}>{Math.round(hovered.inflow_score || 0)}</span>
          </div>
          {Array.isArray(hovered.climate_drivers) && hovered.climate_drivers.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: MUTED_2 }}>
              {hovered.climate_drivers.slice(0, 2).join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div
        data-testid="migration-heatmap-legend"
        style={{
          position: 'absolute', bottom: 12, left: 12, right: 12,
          display: 'flex', flexWrap: 'wrap', gap: 8,
          padding: '8px 12px', borderRadius: 9999,
          background: 'rgba(13,16,23,0.85)',
          border: BORDER, backdropFilter: 'blur(20px)',
          color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 11,
          justifyContent: 'center', alignItems: 'center',
        }}
      >
        <LegendChip color="#EF4444" label={t('climateMigration.legend_outflow', 'Outflow')} />
        <LegendChip color={INDIGO} label={t('climateMigration.legend_neutral', 'Neutral')} />
        <LegendChip color="#22C55E" label={t('climateMigration.legend_inflow', 'Inflow')} />
      </div>
    </div>
  );
}

function LegendChip({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 9999, background: color }} />
      <span style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
    </span>
  );
}

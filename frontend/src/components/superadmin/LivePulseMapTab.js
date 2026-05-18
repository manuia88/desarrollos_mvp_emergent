/**
 * W5.5 Parte 2 — Sub-A · Tab Heatmap.
 *
 * Reusa la base Mapbox de MapaCDMX (W4.18.2) cargando el endpoint
 * /api/maps/layers/zone_score como capa de poligonos por colonia, y
 * colorea cada poligono por bucket de Live Pulse haciendo merge con
 * /api/live-pulse/zones. Click en zona → panel lateral derecho con
 * detalle de las 5 senales.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getZones } from '../../api/live_pulse';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || '';

const CDMX_CENTER = [-99.1665, 19.4275];
const API = process.env.REACT_APP_BACKEND_URL;

const BUCKET_COLORS = {
  cold:    'rgba(120,120,128,0.55)',
  warm:    'rgba(234,179,8,0.55)',
  hot:     'rgba(249,115,22,0.65)',
  surging: 'rgba(239,68,68,0.70)',
  unknown: 'rgba(255,255,255,0.10)',
};

function bucketOf(score) {
  if (score == null) return 'unknown';
  if (score <= 40) return 'cold';
  if (score <= 65) return 'warm';
  if (score <= 85) return 'hot';
  return 'surging';
}

export default function LivePulseMapTab({ onPickZone }) {
  const { t } = useTranslation('common');
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [pulseByZone, setPulseByZone] = useState({});
  const [selected, setSelected] = useState(null);
  const [zonesLoaded, setZonesLoaded] = useState(false);

  // Fetch pulses
  useEffect(() => {
    let cancel = false;
    (async () => {
      const r = await getZones({ limit: 100 });
      if (cancel) return;
      const map = {};
      (r.body?.zones || []).forEach((z) => { map[z.zone_slug] = z; });
      setPulseByZone(map);
      setZonesLoaded(true);
    })();
    return () => { cancel = true; };
  }, []);

  // Init Mapbox + polygons layer
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: CDMX_CENTER,
      zoom: 10.4,
      minZoom: 9,
      maxZoom: 16,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', async () => {
      mapRef.current = map;
      try {
        const resp = await fetch(`${API}/api/maps/layers/zone_score`, { credentials: 'include' });
        const data = await resp.json();
        const features = (data?.features || []).map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            pulse_bucket: 'unknown',
            pulse_score: null,
          },
        }));
        map.addSource('lp_zones', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.addLayer({
          id: 'lp_zones_fill',
          type: 'fill',
          source: 'lp_zones',
          paint: {
            'fill-color': [
              'match', ['get', 'pulse_bucket'],
              'cold',    BUCKET_COLORS.cold,
              'warm',    BUCKET_COLORS.warm,
              'hot',     BUCKET_COLORS.hot,
              'surging', BUCKET_COLORS.surging,
              BUCKET_COLORS.unknown,
            ],
            'fill-outline-color': 'rgba(124,47,255,0.45)',
          },
        });
        map.addLayer({
          id: 'lp_zones_line',
          type: 'line',
          source: 'lp_zones',
          paint: {
            'line-color': 'rgba(124,47,255,0.55)',
            'line-width': 1,
          },
        });

        map.on('click', 'lp_zones_fill', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const slug = f.properties.id;
          setSelected(slug);
          if (onPickZone) onPickZone(slug);
        });
        map.on('mouseenter', 'lp_zones_fill', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'lp_zones_fill', () => { map.getCanvas().style.cursor = ''; });
      } catch (err) {
        console.warn('[LivePulseMap] zone_score load failed:', err);
      }
    });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply pulse colors when both loaded
  useEffect(() => {
    if (!mapRef.current || !zonesLoaded) return;
    const map = mapRef.current;
    const src = map.getSource('lp_zones');
    if (!src) return;
    const data = src._data;
    if (!data) return;
    const next = {
      ...data,
      features: data.features.map((f) => {
        const slug = f.properties.id;
        const pulse = pulseByZone[slug];
        return {
          ...f,
          properties: {
            ...f.properties,
            pulse_bucket: pulse ? (pulse.bucket || bucketOf(pulse.score)) : 'unknown',
            pulse_score: pulse ? pulse.score : null,
          },
        };
      }),
    };
    src.setData(next);
  }, [pulseByZone, zonesLoaded]);

  const selectedPulse = selected ? pulseByZone[selected] : null;

  return (
    <div data-testid="lp-map-tab" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, height: 'calc(100vh - 320px)', minHeight: 480 }}>
      <div ref={containerRef} data-testid="lp-map-container" style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(124,47,255,0.25)' }} />
      <ZoneDetailPanel slug={selected} pulse={selectedPulse} t={t} />
    </div>
  );
}

function ZoneDetailPanel({ slug, pulse, t }) {
  if (!slug || !pulse) {
    return (
      <aside
        data-testid="lp-map-panel-empty"
        style={{
          background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(124,47,255,0.20)', borderRadius: 14, padding: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)', textAlign: 'center',
        }}>
        {t('live_pulse.heatmap_tab.no_zone_selected')}
      </aside>
    );
  }
  const signals = pulse.signals || {};
  return (
    <aside
      data-testid={`lp-map-panel-${slug}`}
      style={{
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(124,47,255,0.30)', borderRadius: 14, padding: 22,
        display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t('live_pulse.heatmap_tab.panel_title')}
          </div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream, #F0EBE0)', margin: '4px 0 0', textTransform: 'capitalize' }}>
            {slug}
          </h3>
        </div>
        <BucketBadge bucket={pulse.bucket || bucketOf(pulse.score)} t={t} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 42, color: 'rgba(124,47,255,0.95)', letterSpacing: '-0.02em' }}>{pulse.score}</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)' }}>/ 100</span>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
        {t('live_pulse.heatmap_tab.last_computed')}: {(pulse.computed_at || '').slice(0, 16).replace('T', ' ')}
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--cream, #F0EBE0)', marginBottom: 8 }}>
          {t('live_pulse.heatmap_tab.signals_breakdown')}
        </div>
        {Object.entries(signals).map(([k, v]) => (
          <SignalRow key={k} k={k} sig={v} t={t} />
        ))}
      </div>
    </aside>
  );
}

function SignalRow({ k, sig, t }) {
  const delta = sig?.delta_pct ?? 0;
  const positive = delta >= 0;
  return (
    <div data-testid={`lp-signal-row-${k}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontFamily: 'DM Sans', fontSize: 12 }}>
      <span style={{ color: 'rgba(240,235,224,0.75)' }}>{t(`live_pulse.signals.${k}`)}</span>
      <span style={{
        fontFamily: 'DM Mono', fontWeight: 600,
        color: positive ? 'rgba(132,204,22,0.95)' : 'rgba(239,68,68,0.95)',
      }}>{positive ? '+' : ''}{Number(delta).toFixed(1)}%</span>
    </div>
  );
}

function BucketBadge({ bucket, t }) {
  const colors = {
    cold:    { bg: 'rgba(120,120,128,0.20)', border: 'rgba(120,120,128,0.50)', fg: '#d4d4d8' },
    warm:    { bg: 'rgba(234,179,8,0.20)',   border: 'rgba(234,179,8,0.55)',   fg: '#fde68a' },
    hot:     { bg: 'rgba(249,115,22,0.22)',  border: 'rgba(249,115,22,0.55)',  fg: '#fed7aa' },
    surging: { bg: 'rgba(239,68,68,0.22)',   border: 'rgba(239,68,68,0.55)',   fg: '#fecaca' },
    unknown: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.15)', fg: 'rgba(240,235,224,0.55)' },
  }[bucket] || { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.15)', fg: 'rgba(240,235,224,0.55)' };
  return (
    <span data-testid={`lp-bucket-${bucket}`} style={{
      display: 'inline-flex', alignItems: 'center', padding: '4px 10px',
      borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
      background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}`,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{t(`live_pulse.buckets.${bucket}`, bucket)}</span>
  );
}

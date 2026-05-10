/**
 * W4.18.2A — MapaCDMX
 * Página pública /mapa — Mapa Cerebro Espacial DMX.
 *
 * Layout: full-screen Mapbox · sidebar 320px izquierdo · floating AtlaxContextualButton
 * Capas: devs (preventa) · brokers (usada) · catastro (heatmap) · zone_score (overlay) · risk (overlay)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import LayerToggle from '../../components/maps/LayerToggle';
import MapFilters from '../../components/maps/MapFilters';
import PropertyPopup from '../../components/maps/PropertyPopup';
import AtlaxContextualButton from '../../components/maps/AtlaxContextualButton';

// W4.18.2B — Cross-features
import FunnelInversoCard from '../../components/maps/FunnelInversoCard';
import MatchCatastroPreventa from '../../components/maps/MatchCatastroPreventa';
import DemandGapToggle from '../../components/maps/DemandGapToggle';
import SaveZoneModal from '../../components/maps/SaveZoneModal';
import BattleCardOverlay from '../../components/maps/BattleCardOverlay';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || '';

const API = process.env.REACT_APP_BACKEND_URL;
const CDMX_CENTER = [-99.1332, 19.4326];

// Score letter → color
const SCORE_COLOR = {
  A: '#22c55e', B: '#84cc16', C: '#eab308',
  D: '#f97316', E: '#ef4444', F: '#dc2626',
};

// ─── Fetch layer data ────────────────────────────────────────────────────────
async function fetchLayer(layerKey, bbox = null, filters = {}) {
  const params = new URLSearchParams();
  if (bbox) params.set('bbox', bbox);
  Object.entries(filters).forEach(([k, v]) => v != null && params.set(k, v));
  const resp = await fetch(`${API}/api/maps/layers/${layerKey}?${params}`, { credentials: 'include' });
  if (!resp.ok) throw new Error(`Layer ${layerKey} error ${resp.status}`);
  return resp.json();
}

export default function MapaCDMX({ user }) {
  const navigate = useNavigate();
  const { alcaldia, colonia } = useParams();

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);

  const [activeLayers, setActiveLayers]     = useState(new Set(['devs', 'brokers', 'catastro']));
  const [layerCounts, setLayerCounts]       = useState({});
  const [filters, setFilters]               = useState({});
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [mapState, setMapState]             = useState({ lat: 19.4326, lng: -99.1332, zoom: 11 });
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [loadingLayers, setLoadingLayers]   = useState(new Set());
  const [atlaxContext, setAtlaxContext]      = useState('');
  const [atlaxOpen, setAtlaxOpen]           = useState(false);
  const [activeTab, setActiveTab]           = useState('capas');

  // ─── W4.18.2B Cross-features state ───────────────────────────────────────
  const isAuth = !!user?.user_id;
  const [matchOpen, setMatchOpen]           = useState(false);
  const [matchAvailable, setMatchAvailable] = useState(false);
  const [demandGapActive, setDemandGapActive] = useState(false);
  const [savedZones, setSavedZones]         = useState([]);
  const [saveZoneOpen, setSaveZoneOpen]     = useState(false);
  const [pendingPolygon, setPendingPolygon] = useState(null);
  const [battleCardDevId, setBattleCardDevId] = useState(null);

  // Detecta si user tiene catastro_cuenta → habilita banner Match
  useEffect(() => {
    if (!isAuth) { setMatchAvailable(false); return; }
    fetch(`${API}/api/maps-cross/match-catastro/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user_property_meta && (d.recommendations || []).length > 0) setMatchAvailable(true);
      })
      .catch(() => {});
  }, [isAuth]);

  // Cargar zonas guardadas
  const reloadSavedZones = useCallback(() => {
    if (!isAuth) { setSavedZones([]); return; }
    fetch(`${API}/api/maps-cross/saved-zones`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setSavedZones(d?.zones || []))
      .catch(() => {});
  }, [isAuth]);
  useEffect(() => { reloadSavedZones(); }, [reloadSavedZones]);

  const handleSaveZoneTrigger = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    // Conservative: usar viewport actual como polygon rectangular
    const b = m.getBounds();
    const sw = b.getSouthWest(), ne = b.getNorthEast();
    const polygon = {
      type: 'Polygon',
      coordinates: [[
        [sw.lng, sw.lat], [ne.lng, sw.lat], [ne.lng, ne.lat], [sw.lng, ne.lat], [sw.lng, sw.lat],
      ]],
    };
    setPendingPolygon(polygon);
    setSaveZoneOpen(true);
  }, []);

  const handleDeleteZone = useCallback((zoneId) => {
    fetch(`${API}/api/maps-cross/saved-zones/${zoneId}`, { method: 'DELETE', credentials: 'include' })
      .then(() => reloadSavedZones());
  }, [reloadSavedZones]);

  // ─── Map init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: CDMX_CENTER,
      zoom: 11,
      minZoom: 9,
      maxZoom: 17,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      mapRef.current = map;
      initLayers(map);
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      setMapState({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    });

    map.on('click', handleMapClick);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line
  }, []);

  // ─── Init map layers ─────────────────────────────────────────────────────
  const initLayers = useCallback(async (map) => {
    await loadLayerData(map, 'devs', true);
    await loadLayerData(map, 'brokers', true);
    await loadLayerData(map, 'catastro', true);
    // Overlays off by default — add sources but invisible
    await loadLayerData(map, 'zone_score', false);
    await loadLayerData(map, 'risk', false);
  }, []);

  // ─── Load a single layer into Mapbox ─────────────────────────────────────
  const loadLayerData = useCallback(async (map, layerKey, visible) => {
    if (!map) return;
    setLoadingLayers(prev => new Set(prev).add(layerKey));

    try {
      const data = await fetchLayer(layerKey, null, layerKey === 'devs' || layerKey === 'brokers' ? filters : {});
      const features = data.features || [];
      const count = features.length;

      setLayerCounts(prev => ({ ...prev, [layerKey]: count }));

      const sourceId = `src_${layerKey}`;
      const layerId  = `lyr_${layerKey}`;
      const clusterId = `lyr_${layerKey}_cluster`;
      const countId   = `lyr_${layerKey}_count`;

      // Remove existing
      [layerId, clusterId, countId].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource(sourceId)) map.removeSource(sourceId);

      // Add source + layers
      if (layerKey === 'devs') {
        map.addSource(sourceId, {
          type: 'geojson', data: data,
          cluster: true, clusterMaxZoom: 13, clusterRadius: 40,
        });
        // Cluster circles
        map.addLayer({
          id: clusterId, type: 'circle', source: sourceId,
          filter: ['has', 'point_count'],
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: {
            'circle-color': '#6366F1',
            'circle-radius': ['step', ['get', 'point_count'], 16, 5, 22, 10, 28],
            'circle-opacity': 0.85,
            'circle-stroke-width': 2, 'circle-stroke-color': '#a5b4fc',
          },
        });
        // Cluster count
        map.addLayer({
          id: countId, type: 'symbol', source: sourceId,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 11,
            visibility: visible ? 'visible' : 'none',
          },
          paint: { 'text-color': '#fff' },
        });
        // Individual points
        map.addLayer({
          id: layerId, type: 'circle', source: sourceId,
          filter: ['!', ['has', 'point_count']],
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: {
            'circle-color': '#6366F1',
            'circle-radius': 8, 'circle-opacity': 0.9,
            'circle-stroke-width': 2, 'circle-stroke-color': '#e0e7ff',
          },
        });
      } else if (layerKey === 'brokers') {
        map.addSource(sourceId, {
          type: 'geojson', data: data,
          cluster: true, clusterMaxZoom: 13, clusterRadius: 40,
        });
        map.addLayer({
          id: clusterId, type: 'circle', source: sourceId,
          filter: ['has', 'point_count'],
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: {
            'circle-color': '#EC4899',
            'circle-radius': ['step', ['get', 'point_count'], 14, 5, 20, 10, 26],
            'circle-opacity': 0.8,
            'circle-stroke-width': 2, 'circle-stroke-color': '#fbcfe8',
          },
        });
        map.addLayer({
          id: countId, type: 'symbol', source: sourceId,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 11,
            visibility: visible ? 'visible' : 'none',
          },
          paint: { 'text-color': '#fff' },
        });
        map.addLayer({
          id: layerId, type: 'circle', source: sourceId,
          filter: ['!', ['has', 'point_count']],
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: {
            'circle-color': '#EC4899',
            'circle-radius': 7, 'circle-opacity': 0.85,
            'circle-stroke-width': 1.5, 'circle-stroke-color': '#fce7f3',
          },
        });
      } else if (layerKey === 'catastro') {
        map.addSource(sourceId, { type: 'geojson', data: data });
        // Heatmap por precio/m2
        map.addLayer({
          id: layerId, type: 'heatmap', source: sourceId,
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: {
            'heatmap-weight': [
              'interpolate', ['linear'], ['get', 'avg_price_m2'],
              0, 0, 80000, 1,
            ],
            'heatmap-intensity': 0.6,
            'heatmap-radius': 40,
            'heatmap-opacity': 0.3,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(99,102,241,0)',
              0.2, 'rgba(99,102,241,0.3)',
              0.6, 'rgba(236,72,153,0.4)',
              1, 'rgba(236,72,153,0.6)',
            ],
          },
        });
      } else if (layerKey === 'zone_score') {
        map.addSource(sourceId, { type: 'geojson', data: data });
        map.addLayer({
          id: layerId, type: 'fill', source: sourceId,
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: {
            'fill-opacity': 0.45,
            'fill-color': [
              'match', ['get', 'score_letter'],
              'A', '#22c55e', 'B', '#84cc16', 'C', '#eab308',
              'D', '#f97316', 'E', '#ef4444', 'F', '#dc2626',
              '#888',
            ],
          },
        });
      } else if (layerKey === 'risk') {
        map.addSource(sourceId, { type: 'geojson', data: data });
        map.addLayer({
          id: layerId, type: 'fill', source: sourceId,
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.4 },
        });
      }
    } catch (err) {
      console.warn(`[maps] layer ${layerKey} error:`, err);
    } finally {
      setLoadingLayers(prev => { const n = new Set(prev); n.delete(layerKey); return n; });
    }
  }, [filters]);

  // ─── Toggle layer visibility ──────────────────────────────────────────────
  const handleLayerToggle = useCallback((layerKey) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerKey)) {
        next.delete(layerKey);
        // Hide in map
        const map = mapRef.current;
        if (map) {
          [`lyr_${layerKey}`, `lyr_${layerKey}_cluster`, `lyr_${layerKey}_count`].forEach(id => {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
          });
        }
      } else {
        next.add(layerKey);
        const map = mapRef.current;
        if (map) {
          // If layer not loaded yet, load it; else show
          if (!map.getSource(`src_${layerKey}`)) {
            loadLayerData(map, layerKey, true);
          } else {
            [`lyr_${layerKey}`, `lyr_${layerKey}_cluster`, `lyr_${layerKey}_count`].forEach(id => {
              if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
            });
          }
        }
      }
      return next;
    });
  }, [loadLayerData]);

  // ─── Apply filters ────────────────────────────────────────────────────────
  const handleApplyFilters = useCallback((newFilters) => {
    setFilters(newFilters);
    const map = mapRef.current;
    if (!map) return;
    loadLayerData(map, 'devs', activeLayers.has('devs'));
    loadLayerData(map, 'brokers', activeLayers.has('brokers'));
  }, [activeLayers, loadLayerData]);

  // ─── Map click → select feature ──────────────────────────────────────────
  const handleMapClick = useCallback((e) => {
    const map = mapRef.current;
    if (!map) return;

    // Check clickable layers
    const clickableLayers = ['lyr_devs', 'lyr_brokers', 'lyr_catastro'];
    const features = map.queryRenderedFeatures(e.point, { layers: clickableLayers });

    if (features.length > 0) {
      const f = features[0];
      setSelectedFeature(f);
    } else {
      // Click on map background — try catastro aggregate nearest point
      // Check if there's a catastro point nearby
      const catFeatures = map.queryRenderedFeatures(
        [
          [e.point.x - 20, e.point.y - 20],
          [e.point.x + 20, e.point.y + 20],
        ],
        { layers: ['lyr_catastro'] }
      );
      if (catFeatures.length > 0) {
        setSelectedFeature(catFeatures[0]);
      } else {
        setSelectedFeature(null);
      }
    }
  }, []);

  // ─── Atlax context open ───────────────────────────────────────────────────
  const handleOpenAtlax = useCallback((context) => {
    setAtlaxContext(context);
    setAtlaxOpen(true);
  }, []);

  // ─── Mobile sidebar toggle ────────────────────────────────────────────────
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const TAB_STYLE = (t) => ({
    padding: '7px 14px', borderRadius: '9999px', border: 'none',
    background: activeTab === t ? 'rgba(99,102,241,0.2)' : 'transparent',
    color: activeTab === t ? '#a5b4fc' : 'rgba(240,235,224,0.45)',
    fontFamily: 'DM Sans', fontSize: 12, fontWeight: activeTab === t ? 700 : 500,
    cursor: 'pointer', transition: 'all 0.15s',
  });

  return (
    <div
      data-testid="mapa-cdmx"
      style={{ position: 'relative', width: '100vw', height: '100vh', background: '#06080F', overflow: 'hidden', display: 'flex' }}
    >
      {/* ── Sidebar ── */}
      <aside
        data-testid="mapa-sidebar"
        style={{
          width: sidebarOpen ? 300 : 0,
          minWidth: sidebarOpen ? 300 : 0,
          height: '100%',
          background: 'rgba(6,8,15,0.92)',
          backdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.3s ease, min-width 0.3s ease',
          overflow: 'hidden',
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        {sidebarOpen && (
          <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflow: 'auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '9999px',
                  background: 'linear-gradient(135deg,#6366F1,#EC4899)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}>
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                </div>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: '#F0EBE0', letterSpacing: '-0.02em' }}>
                  Mapa Cerebro Espacial
                </span>
              </div>
              <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.4)', margin: 0, lineHeight: 1.4 }}>
                Inteligencia geoespacial CDMX · {layerCounts.devs || 0} proyectos · {layerCounts.catastro || 0} colonias
              </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 9999, padding: 4 }}>
              <button style={TAB_STYLE('capas')} onClick={() => setActiveTab('capas')}>Capas</button>
              <button style={TAB_STYLE('filtros')} onClick={() => setActiveTab('filtros')}>Filtros</button>
            </div>

            {/* Content */}
            {activeTab === 'capas' ? (
              <>
                <LayerToggle
                  active={activeLayers}
                  counts={layerCounts}
                  onToggle={handleLayerToggle}
                />
                {/* W4.18.2B — Demand Gap pill (auth) + Save Zone btn */}
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <DemandGapToggle
                    active={demandGapActive}
                    onToggle={() => setDemandGapActive(p => !p)}
                    disabled={!isAuth}
                  />
                  {isAuth && (
                    <button
                      data-testid="save-zone-btn"
                      onClick={handleSaveZoneTrigger}
                      style={{
                        padding: '8px 14px', borderRadius: 9999,
                        background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.3)',
                        color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700,
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >+ Guardar zona (viewport actual)</button>
                  )}
                </div>
                {/* Saved zones list */}
                {isAuth && savedZones.length > 0 && (
                  <div data-testid="saved-zones-list" style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Mis zonas
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {savedZones.map(z => (
                        <div key={z.zone_id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          <div style={{ flex: 1, fontSize: 11.5, color: '#F0EBE0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {z.name}
                          </div>
                          <button
                            onClick={() => handleDeleteZone(z.zone_id)}
                            title="Eliminar zona"
                            style={{
                              width: 22, height: 22, borderRadius: '50%', border: 'none',
                              background: 'rgba(239,68,68,0.15)', color: '#fca5a5', cursor: 'pointer', fontSize: 12, lineHeight: 1,
                            }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <MapFilters onApply={handleApplyFilters} />
            )}

            {/* Loading indicator */}
            {loadingLayers.size > 0 && (
              <div style={{
                marginTop: 'auto', paddingTop: 12,
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.4)',
              }}>
                <div style={{
                  width: 12, height: 12, border: '2px solid rgba(99,102,241,0.3)',
                  borderTopColor: '#6366F1', borderRadius: '50%',
                  animation: 'mapa-spin 0.8s linear infinite',
                }} />
                Actualizando capas...
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Map container ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div
          ref={mapContainerRef}
          data-testid="mapbox-container"
          style={{ position: 'absolute', inset: 0 }}
        />

        {/* Sidebar toggle button */}
        <button
          data-testid="mapa-sidebar-toggle"
          onClick={() => setSidebarOpen(p => !p)}
          title={sidebarOpen ? 'Cerrar panel' : 'Abrir panel'}
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 20,
            width: 36, height: 36, borderRadius: '9999px',
            background: 'rgba(6,8,15,0.85)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#F0EBE0', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            {sidebarOpen
              ? <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
              : <path d="M9 18l6-6-6-6" />
            }
          </svg>
        </button>

        {/* Property popup */}
        {selectedFeature && (
          <PropertyPopup
            feature={selectedFeature}
            onClose={() => setSelectedFeature(null)}
            onAskAtlax={({ contextLabel }) => {
              handleOpenAtlax(`El usuario ha seleccionado "${contextLabel}" en el mapa.`);
            }}
          />
        )}

        {/* Atlax bubble overlay si está abierto */}
        {atlaxOpen && (
          <div
            data-testid="mapa-atlax-overlay"
            style={{
              position: 'absolute', bottom: 100, right: 32, zIndex: 300,
              width: 360, maxWidth: 'calc(100vw - 48px)',
            }}
          >
            {/* Simplified Atlax chat panel */}
            <div style={{
              background: 'rgba(6,8,15,0.95)', backdropFilter: 'blur(24px)',
              border: '1px solid rgba(99,102,241,0.35)', borderRadius: 18,
              padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: '#F0EBE0' }}>Atlax</span>
                <button
                  onClick={() => setAtlaxOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'rgba(240,235,224,0.5)', cursor: 'pointer', fontSize: 18 }}
                >
                  ×
                </button>
              </div>
              {atlaxContext && (
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.5)',
                  background: 'rgba(99,102,241,0.08)', borderRadius: 8, padding: '8px 10px', marginBottom: 10,
                  borderLeft: '3px solid #6366F1',
                }}>
                  {atlaxContext.slice(0, 150)}...
                </div>
              )}
              <button
                onClick={() => {
                  setAtlaxOpen(false);
                  // Navegar a /asistente con context
                  const encoded = encodeURIComponent(atlaxContext);
                  window.open(`/asistente?map_ctx=${encoded}`, '_blank');
                }}
                style={{
                  width: '100%', padding: '10px', borderRadius: '9999px',
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none',
                  color: '#fff', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Abrir chat con contexto del mapa
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Atlax contextual button ── */}
      <AtlaxContextualButton
        mapState={mapState}
        activeLayers={activeLayers}
        onOpenAtlax={handleOpenAtlax}
      />

      {/* ── W4.18.2B Cross-features modals/overlays ── */}
      <MatchCatastroPreventa
        open={matchOpen}
        onClose={() => setMatchOpen(false)}
      />
      <SaveZoneModal
        open={saveZoneOpen}
        polygon={pendingPolygon}
        onClose={() => setSaveZoneOpen(false)}
        onSaved={(z) => {
          setSaveZoneOpen(false);
          setSavedZones(prev => [z, ...prev]);
        }}
      />
      <BattleCardOverlay
        open={!!battleCardDevId}
        devId={battleCardDevId}
        onClose={() => setBattleCardDevId(null)}
      />

      <style>{`
        @keyframes mapa-spin { to { transform: rotate(360deg); } }
        .mapboxgl-ctrl-bottom-left { bottom: 8px !important; left: 8px !important; }
        .mapboxgl-ctrl-top-right { top: 60px !important; right: 12px !important; }
      `}</style>
    </div>
  );
}

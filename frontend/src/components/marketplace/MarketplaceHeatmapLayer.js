/**
 * MarketplaceHeatmapLayer — Phase 4 Batch 24
 * Agrega capa heatmap al mapa Mapbox del Marketplace.
 * Props:
 *   mapInstance  — instancia mapboxgl.Map
 *   onColoniaClick(colonia_id) — callback al hacer click en colonia
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchHeatmapLayer } from '../../api/marketplace';

const LAYER_OPTIONS = [
  { key: 'price',    label: 'Precio / m²' },
  { key: 'demand',   label: 'Demanda' },
  { key: 'momentum', label: 'Momentum' },
];

const SOURCE_ID = 'dmx-heatmap-src';
const LAYER_ID  = 'dmx-heatmap-layer';
const CLICK_LAYER_ID = 'dmx-click-layer';

function zoomToLevel(z) {
  if (z < 6) return 1;
  if (z < 9) return 2;
  if (z < 12) return 3;
  return 4;
}

export default function MarketplaceHeatmapLayer({ mapInstance, onColoniaClick }) {
  const { t } = useTranslation('common');
  const [activeLayer, setActiveLayer] = useState('price');
  const [meta, setMeta] = useState({ value_min: 0, value_max: 100 });
  const [zoomLevel, setZoomLevel] = useState(3);
  const [legendOpen, setLegendOpen] = useState(true);
  const layerRef = useRef('price');
  const zoomRef = useRef(3);
  const loadedRef = useRef(false);

  // Cargar datos y actualizar source
  const loadHeatmap = useCallback(async (layer, zl) => {
    if (!mapInstance) return;
    try {
      const data = await fetchHeatmapLayer(layer, zl);
      setMeta(data.meta || {});

      if (mapInstance.getSource(SOURCE_ID)) {
        mapInstance.getSource(SOURCE_ID).setData(data);
      } else {
        mapInstance.addSource(SOURCE_ID, { type: 'geojson', data });
      }

      if (!mapInstance.getLayer(LAYER_ID)) {
        mapInstance.addLayer({
          id: LAYER_ID,
          type: 'heatmap',
          source: SOURCE_ID,
          maxzoom: 22,
          paint: {
            'heatmap-weight': [
              'interpolate', ['linear'], ['get', 'weight'],
              0, 0, 1, 1,
            ],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 12, 1.4],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0,   'rgba(6,8,15,0)',
              0.15,'rgba(var(--theme-rgb),0.35)',
              0.4, 'rgba(139,92,246,0.55)',
              0.7, 'rgba(var(--theme-rgb),0.75)',
              1,   'rgba(244,63,94,0.9)',
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 20, 8, 50, 12, 80],
            'heatmap-opacity': 0.82,
          },
        });
      }

      // Capa invisible para detectar clicks sobre features (circle)
      if (!mapInstance.getLayer(CLICK_LAYER_ID)) {
        mapInstance.addLayer({
          id: CLICK_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': 18,
            'circle-opacity': 0,
            'circle-color': 'transparent',
          },
        });
        mapInstance.on('click', CLICK_LAYER_ID, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const id = f.properties?.id;
          if (id && onColoniaClick) onColoniaClick(id);
        });
        mapInstance.on('mouseenter', CLICK_LAYER_ID, () => {
          mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', CLICK_LAYER_ID, () => {
          mapInstance.getCanvas().style.cursor = '';
        });
      }
    } catch (err) {
      console.warn('[HeatmapLayer] load error:', err);
    }
  }, [mapInstance, onColoniaClick]);

  // Init cuando mapInstance está listo
  useEffect(() => {
    if (!mapInstance || loadedRef.current) return;

    const onLoad = () => {
      loadedRef.current = true;
      loadHeatmap(layerRef.current, zoomRef.current);
    };

    if (mapInstance.loaded()) {
      loadedRef.current = true;
      loadHeatmap(layerRef.current, zoomRef.current);
    } else {
      mapInstance.once('load', onLoad);
    }

    // Zoom change → auto-switch nivel
    const onZoom = () => {
      const z = mapInstance.getZoom();
      const newLevel = zoomToLevel(z);
      if (newLevel !== zoomRef.current) {
        zoomRef.current = newLevel;
        setZoomLevel(newLevel);
        loadHeatmap(layerRef.current, newLevel);
      }
    };
    mapInstance.on('zoomend', onZoom);

    return () => {
      mapInstance.off('zoomend', onZoom);
      mapInstance.off('load', onLoad);
    };
  }, [mapInstance, loadHeatmap]);

  // Cambio de capa activa
  const handleLayerChange = (key) => {
    setActiveLayer(key);
    layerRef.current = key;
    loadHeatmap(key, zoomRef.current);
  };

  const formatValue = (v) => {
    if (activeLayer === 'price') return `$${Math.round(v / 1000)}k`;
    if (activeLayer === 'demand') return String(Math.round(v));
    return `${Math.round(v > 20 ? v - 20 : 0)}%`;
  };

  return (
    <>
      {/* ── Layer toggles top-left ── */}
      <div
        data-testid="heatmap-layer-toggles"
        style={{
          position: 'absolute', top: 16, left: 16, zIndex: 20,
          display: 'flex', gap: 6, padding: 4,
          background: 'rgba(6,8,15,0.90)',
          border: '1px solid rgba(240,235,224,0.15)',
          backdropFilter: 'blur(24px)',
          borderRadius: 9999,
          overflowX: 'auto',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        {LAYER_OPTIONS.map(({ key, label }) => {
          const active = activeLayer === key;
          return (
            <button
              key={key}
              data-testid={`heatmap-toggle-${key}`}
              onClick={() => handleLayerChange(key)}
              style={{
                padding: '7px 14px',
                borderRadius: 9999,
                border: 'none',
                background: active
                  ? 'linear-gradient(90deg, var(--theme), var(--theme-3))'
                  : 'transparent',
                color: active ? '#fff' : 'rgba(240,235,224,0.65)',
                fontFamily: 'DM Sans',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Legend bottom-right ── */}
      <div
        data-testid="heatmap-legend"
        style={{
          position: 'absolute', bottom: 24, right: 16, zIndex: 20,
          padding: legendOpen ? '12px 14px' : '8px 12px',
          background: 'rgba(6,8,15,0.90)',
          border: '1px solid rgba(240,235,224,0.15)',
          backdropFilter: 'blur(24px)',
          borderRadius: 14,
          minWidth: 160,
          transition: 'all 0.3s',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: legendOpen ? 10 : 0,
        }}>
          <span style={{
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
            color: 'rgba(240,235,224,0.85)', textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {LAYER_OPTIONS.find(l => l.key === activeLayer)?.label}
          </span>
          <button
            onClick={() => setLegendOpen(o => !o)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(240,235,224,0.5)', fontSize: 10, padding: 0,
              marginLeft: 8,
            }}
          >
            {legendOpen ? '−' : '+'}
          </button>
        </div>
        {legendOpen && (
          <>
            <div style={{
              width: '100%', height: 8, borderRadius: 9999,
              background: 'linear-gradient(90deg,var(--theme),#8B5CF6,var(--theme-3),#F43F5E)',
              marginBottom: 6,
            }} />
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontFamily: 'DM Sans', fontSize: 10,
              color: 'rgba(240,235,224,0.55)',
            }}>
              <span>{formatValue(meta.value_min ?? 0)}</span>
              <span>{formatValue(((meta.value_min ?? 0) + (meta.value_max ?? 100)) / 2)}</span>
              <span>{formatValue(meta.value_max ?? 100)}</span>
            </div>
            <div style={{
              marginTop: 8, fontFamily: 'DM Sans', fontSize: 10,
              color: 'rgba(240,235,224,0.4)',
            }}>
              Zoom nivel: Z{zoomLevel} · {meta.zoom_unit || 'colonia'}
            </div>
          </>
        )}
      </div>
    </>
  );
}

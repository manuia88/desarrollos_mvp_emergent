/**
 * Phase 4 Batch 18 Sub-B — VistaPlantaInteractiva
 *
 * Full interactive floor plan SVG viewer replacing the basic VistaDePlanta.
 * Features:
 *   - Floor selector tabs (or dropdown on mobile)
 *   - SVG canvas (1000×800 viewBox) with zoom/pan + mouse wheel
 *   - Unit rects color-coded by status; hover tooltip; click → drawer
 *   - Filter chips: status (multi) + prototipo (multi) + price range
 *   - Edit mode (dev_admin): drag-to-move + SE resize + upload background
 *   - Density-aware text (B18-A): compact=num only, comfortable=num+price, spacious=num+price+tipo
 *   - Mobile (≤768px): pinch-zoom + bottom sheet drawer
 *   - SmartEmptyState when no units or no floor_layouts
 *
 * Edge case (documented): units without saved position → auto-grid placement
 * (8 cols, 80×60 per unit, see backend _auto_pos()).
 */
import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { FilterChipsBar } from '../shared/FilterChipsBar';
import { EntityDrawer } from '../shared/EntityDrawer';
import UnitDrawerContent from './UnitDrawerContent';
import { SmartEmptyState } from '../shared/SmartEmptyState';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useDensity } from '../../hooks/useDensity';
import {
  ZoomIn, ZoomOut, Maximize2, Edit3, Upload, X,
} from 'lucide-react';
import {
  getProjectFloors,
  getProjectFloorDetail,
  putFloorLayout,
  patchUnitPosition,
} from '../../api/developer';

// Max background image size (frontend mirror of backend cap; B18.5)
const MAX_BG_BYTES = 500 * 1024;

// ─── Status color config ────────────────────────────────────────────────────
const STATUS_CFG = {
  disponible: { label: 'Disponible', color: '#22c55e', bg: 'rgba(34,197,94,0.22)', border: '#22c55e' },
  apartado:   { label: 'Apartado',   color: '#f59e0b', bg: 'rgba(245,158,11,0.22)', border: '#f59e0b' },
  reservado:  { label: 'Reservado',  color: '#60a5fa', bg: 'rgba(96,165,250,0.22)', border: '#60a5fa' },
  vendido:    { label: 'Vendido',    color: '#ef4444', bg: 'rgba(239,68,68,0.22)',  border: '#ef4444' },
  bloqueado:  { label: 'Bloqueado',  color: 'rgba(240,235,224,0.3)', bg: 'rgba(240,235,224,0.07)', border: 'rgba(240,235,224,0.2)' },
};

const fmtM = (v) => v == null ? null : `$${(v / 1_000_000).toFixed(1)}M`;

// ─── UnitRect SVG primitive ─────────────────────────────────────────────────
function UnitRect({ unit, editMode, onSelect, onHover, onDragStart, onResizeStart, density }) {
  const cfg = STATUS_CFG[unit.status] || STATUS_CFG.disponible;
  const { x, y, width, height } = unit.position;
  const [hovered, setHovered] = useState(false);

  const showPrice = (density === 'comfortable' && width >= 80) || density === 'spacious';
  const showTipo  = density === 'spacious' && width >= 100;

  const handleMouseEnter = (e) => {
    setHovered(true);
    onHover?.({ unit, clientX: e.clientX, clientY: e.clientY });
  };
  const handleMouseLeave = () => {
    setHovered(false);
    onHover?.(null);
  };
  const handleMouseMove = (e) => {
    if (hovered) onHover?.({ unit, clientX: e.clientX, clientY: e.clientY });
  };

  const HANDLE_SZ = 8;

  return (
    <g
      data-testid={`plant-unit-${unit.unit_number}`}
      style={{ cursor: editMode ? 'move' : 'pointer' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onClick={editMode ? undefined : () => onSelect?.(unit)}
    >
      {/* Main rect */}
      <rect
        x={x} y={y} width={width} height={height}
        rx={5}
        fill={cfg.bg}
        stroke={hovered ? cfg.color : `${cfg.border}80`}
        strokeWidth={hovered ? 2.5 : 1.5}
        style={{
          transition: 'stroke 0.15s, stroke-width 0.15s, opacity 0.15s',
          opacity: hovered && !editMode ? 1 : 0.92,
        }}
        onMouseDown={editMode ? (e) => { e.stopPropagation(); onDragStart?.(e, unit.id, 'move'); } : undefined}
      />

      {/* Text: unit number */}
      <text
        x={x + width / 2} y={y + height / 2 - (showPrice ? 7 : 0)}
        textAnchor="middle" dominantBaseline="central"
        fontSize={density === 'compact' ? 9 : density === 'spacious' ? 11 : 10}
        fontWeight={700}
        fontFamily="DM Mono, monospace"
        fill={cfg.color}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {unit.unit_number}
      </text>

      {/* Price (comfortable+spacious) */}
      {showPrice && fmtM(unit.price) && (
        <text
          x={x + width / 2} y={y + height / 2 + 9}
          textAnchor="middle" dominantBaseline="central"
          fontSize={density === 'spacious' ? 9 : 8}
          fontFamily="DM Sans, sans-serif"
          fill={`${cfg.color}cc`}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {fmtM(unit.price)}
        </text>
      )}

      {/* Tipo (spacious only) */}
      {showTipo && unit.prototype && (
        <text
          x={x + width / 2} y={y + height - 8}
          textAnchor="middle" dominantBaseline="central"
          fontSize={7.5}
          fontFamily="DM Sans, sans-serif"
          fill={`${cfg.color}80`}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {unit.prototype}
        </text>
      )}

      {/* Edit mode: SE resize handle */}
      {editMode && (
        <rect
          x={x + width - HANDLE_SZ / 2}
          y={y + height - HANDLE_SZ / 2}
          width={HANDLE_SZ} height={HANDLE_SZ}
          rx={2}
          fill={cfg.color}
          stroke="#0b0e18"
          strokeWidth={1}
          style={{ cursor: 'se-resize' }}
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, unit.id); }}
        />
      )}
    </g>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function Tooltip({ data }) {
  if (!data) return null;
  const cfg = STATUS_CFG[data.unit.status] || STATUS_CFG.disponible;
  return (
    <div
      data-testid="floor-unit-tooltip"
      style={{
        position: 'fixed',
        left: data.clientX + 14,
        top: data.clientY - 12,
        background: 'rgba(6,8,15,0.96)',
        border: '1px solid rgba(240,235,224,0.18)',
        borderRadius: 10, padding: '10px 14px',
        zIndex: 9999, pointerEvents: 'none',
        backdropFilter: 'blur(12px)',
        minWidth: 160, maxWidth: 220,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--cream)', marginBottom: 4 }}>
        Unidad {data.unit.unit_number}
      </div>
      {[
        ['Tipo', data.unit.prototype],
        ['m² total', data.unit.area_total ? `${data.unit.area_total} m²` : null],
        ['Recámaras', data.unit.bedrooms],
        ['Precio', fmtM(data.unit.price)],
      ].filter(([, v]) => v != null).map(([l, v]) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
          <span style={{ color: 'var(--cream-3)' }}>{l}</span>
          <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{v}</span>
        </div>
      ))}
      <div style={{ marginTop: 6 }}>
        <span style={{
          background: cfg.bg, color: cfg.color,
          fontSize: 10, fontWeight: 700, padding: '2px 8px',
          borderRadius: 99, letterSpacing: '0.03em',
        }}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function VistaPlantaInteractiva({ devId, user, units: propUnits }) {
  const [floors, setFloors] = useState([]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [floorData, setFloorData] = useState(null);   // { layout, units }
  const [displayUnits, setDisplayUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingFloors, setLoadingFloors] = useState(true);

  // Filter state
  const [statusFilter, setStatusFilter] = useState([]);
  const [prototipoFilter, setPrototipoFilter] = useState([]);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  // View state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);  // for drawer

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [dragState, setDragState] = useState(null);   // { unitId, type, startSVG, startBounds }
  const [savingPositions, setSavingPositions] = useState(false);
  const [bgUploadRef] = useState(() => React.createRef());
  const [uploadingBg, setUploadingBg] = useState(false);

  // Pan drag state
  const [panDrag, setPanDrag] = useState(null);

  // Touch/pinch state
  const lastPinchDist = useRef(null);
  const lastPinchPan = useRef(null);

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const { density } = useDensity();
  const isMobileViewport = useIsMobile(768);

  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';

  // ─── Load floors ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!devId) return;
    setLoadingFloors(true);
    getProjectFloors(devId)
      .then(data => {
        const fl = data.floors || [];
        setFloors(fl);
        if (fl.length > 0) setSelectedFloor(fl[0].floor_number);
      })
      .catch(err => {
        console.error('[VistaPlanta] floors load:', err);
        setFloors([]);
      })
      .finally(() => setLoadingFloors(false));
  }, [devId]);

  // ─── Load floor detail on floor change ──────────────────────────────────
  useEffect(() => {
    if (!devId || selectedFloor == null) return;
    setLoading(true);
    getProjectFloorDetail(devId, selectedFloor)
      .then(data => {
        setFloorData(data);
        setDisplayUnits(data.units.map(u => ({ ...u })));
      })
      .catch(err => {
        console.error('[VistaPlanta] floor detail:', err);
        setFloorData(null);
        setDisplayUnits([]);
      })
      .finally(() => setLoading(false));
  }, [devId, selectedFloor]);

  // ─── SVG coordinate conversion ──────────────────────────────────────────
  const screenToSVG = useCallback((clientX, clientY) => {
    const svgEl = svgRef.current;
    if (!svgEl) return { x: 0, y: 0 };
    const rect = svgEl.getBoundingClientRect();
    const vbW = 1000 / zoom;
    const vbH = 800 / zoom;
    return {
      x: panOffset.x + (clientX - rect.left) * (vbW / rect.width),
      y: panOffset.y + (clientY - rect.top) * (vbH / rect.height),
    };
  }, [zoom, panOffset]);

  // ─── Drag start ─────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e, unitId, type) => {
    if (!editMode) return;
    const svgPt = screenToSVG(e.clientX, e.clientY);
    const unit = displayUnits.find(u => u.id === unitId);
    if (!unit) return;
    setDragState({
      unitId,
      type,   // 'move' | 'resize-se'
      startSVG: svgPt,
      startBounds: { ...unit.position },
    });
  }, [editMode, screenToSVG, displayUnits]);

  const handleResizeStart = useCallback((e, unitId) => {
    handleDragStart(e, unitId, 'resize-se');
  }, [handleDragStart]);

  // ─── Mouse move ─────────────────────────────────────────────────────────
  const handleSVGMouseMove = useCallback((e) => {
    // Drag unit
    if (dragState && editMode) {
      const svgPt = screenToSVG(e.clientX, e.clientY);
      const dx = svgPt.x - dragState.startSVG.x;
      const dy = svgPt.y - dragState.startSVG.y;
      setDisplayUnits(prev => prev.map(u => {
        if (u.id !== dragState.unitId) return u;
        const b = dragState.startBounds;
        if (dragState.type === 'move') {
          return { ...u, position: { ...b, x: Math.max(0, b.x + dx), y: Math.max(0, b.y + dy) } };
        } else if (dragState.type === 'resize-se') {
          return { ...u, position: { ...b, width: Math.max(30, b.width + dx), height: Math.max(25, b.height + dy) } };
        }
        return u;
      }));
      return;
    }
    // Pan background
    if (panDrag) {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const vbW = 1000 / zoom;
      const vbH = 800 / zoom;
      const dx = (e.clientX - panDrag.startX) * (vbW / rect.width);
      const dy = (e.clientY - panDrag.startY) * (vbH / rect.height);
      setPanOffset({
        x: panDrag.startPan.x - dx,
        y: panDrag.startPan.y - dy,
      });
    }
  }, [dragState, editMode, panDrag, zoom, screenToSVG]);

  // ─── Mouse up ────────────────────────────────────────────────────────────
  const handleSVGMouseUp = useCallback(async () => {
    if (dragState && editMode) {
      const unit = displayUnits.find(u => u.id === dragState.unitId);
      if (unit) {
        setSavingPositions(true);
        try {
          await patchUnitPosition(dragState.unitId, {
            ...unit.position,
            floor_number: selectedFloor,
            project_id: devId,
          });
          // Mark as no longer auto-positioned
          setDisplayUnits(prev => prev.map(u =>
            u.id === dragState.unitId ? { ...u, is_auto_positioned: false } : u
          ));
        } catch (err) {
          console.error('[VistaPlanta] position save error:', err);
        } finally {
          setSavingPositions(false);
        }
      }
      setDragState(null);
    }
    setPanDrag(null);
  }, [dragState, editMode, displayUnits, selectedFloor]);

  // ─── Mouse down on SVG background (pan) ─────────────────────────────────
  const handleSVGMouseDown = useCallback((e) => {
    if (dragState || editMode) return;
    if (e.target === svgRef.current || e.target.dataset.pannable) {
      setPanDrag({ startX: e.clientX, startY: e.clientY, startPan: { ...panOffset } });
    }
  }, [dragState, editMode, panOffset]);

  // ─── Mouse wheel zoom ─────────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(z => Math.min(5, Math.max(0.3, z * factor)));
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
    // displayUnits.length is included so the listener attaches once the SVG mounts
    // (initial render returns a fallback DIV when displayUnits is empty).
  }, [handleWheel, displayUnits.length]);

  // ─── Touch pinch-zoom ────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      lastPinchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastPinchPan.current = { ...panOffset };
    }
  }, [panOffset]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && lastPinchDist.current != null) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / lastPinchDist.current;
      setZoom(z => Math.min(5, Math.max(0.3, z * factor)));
      lastPinchDist.current = dist;
    } else if (e.touches.length === 1 && lastPinchPan.current) {
      // single finger pan
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
  }, []);

  // ─── Zoom controls ───────────────────────────────────────────────────────
  const zoomIn   = () => setZoom(z => Math.min(5, z * 1.25));
  const zoomOut  = () => setZoom(z => Math.max(0.3, z / 1.25));
  const fitView  = () => { setZoom(1); setPanOffset({ x: 0, y: 0 }); };

  // ─── Background upload ───────────────────────────────────────────────────
  const handleBgUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFloor) return;
    setUploadingBg(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        try {
          await putFloorLayout(devId, selectedFloor, { svg_background_url: dataUrl });
          setFloorData(prev => prev ? {
            ...prev,
            layout: { ...prev.layout, svg_background_url: dataUrl }
          } : prev);
        } catch (err) {
          console.error('[VistaPlanta] bg upload:', err);
        } finally {
          setUploadingBg(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (_) {
      setUploadingBg(false);
    }
  };

  // ─── Filtering logic ─────────────────────────────────────────────────────
  const allPrototipos = useMemo(
    () => [...new Set(displayUnits.map(u => u.prototype).filter(Boolean))].sort(),
    [displayUnits]
  );

  const isFiltered = (unit) => {
    if (statusFilter.length > 0 && !statusFilter.includes(unit.status)) return false;
    if (prototipoFilter.length > 0 && !prototipoFilter.includes(unit.prototype)) return false;
    if (priceMin && unit.price < Number(priceMin)) return false;
    if (priceMax && unit.price > Number(priceMax)) return false;
    return true;
  };

  const handleFilterChange = (key, value) => {
    if (key === 'status') {
      setStatusFilter(prev => {
        if (!value) return [];
        return prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value];
      });
    } else if (key === 'prototipo') {
      setPrototipoFilter(prev => {
        if (!value) return [];
        return prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value];
      });
    }
  };

  // Status counts for chips
  const statusCounts = useMemo(() => {
    const c = {};
    displayUnits.forEach(u => { c[u.status] = (c[u.status] || 0) + 1; });
    return c;
  }, [displayUnits]);

  // Prototipo counts
  const protoCounts = useMemo(() => {
    const c = {};
    displayUnits.forEach(u => { if (u.prototype) c[u.prototype] = (c[u.prototype] || 0) + 1; });
    return c;
  }, [displayUnits]);

  // SVG viewBox
  const vbX = panOffset.x.toFixed(1);
  const vbY = panOffset.y.toFixed(1);
  const vbW = (1000 / zoom).toFixed(1);
  const vbH = (800 / zoom).toFixed(1);
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  // Floor summary counts from floors array
  const currentFloorMeta = floors.find(f => f.floor_number === selectedFloor);

  // ─── Render: loading ─────────────────────────────────────────────────────
  if (loadingFloors) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--cream-3)' }}>
        Cargando pisos…
      </div>
    );
  }

  // ─── Render: no floors ───────────────────────────────────────────────────
  if (floors.length === 0) {
    return (
      <SmartEmptyState
        contextKey="floor_plan_no_layout"
        headline="Crea tu primer layout"
        description="Sube un plano arquitectónico o agrega unidades manualmente para comenzar."
        ctaLabel={isAdmin ? 'Activar modo Editar' : undefined}
        onCta={isAdmin ? () => setEditMode(true) : undefined}
      />
    );
  }

  const bgUrl = floorData?.layout?.svg_background_url;
  const mobile = isMobileViewport;

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Header row ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>

        {/* Floor tabs (desktop) / dropdown (mobile) */}
        {mobile ? (
          <select
            data-testid="floor-selector-mobile"
            value={selectedFloor ?? ''}
            onChange={e => setSelectedFloor(Number(e.target.value))}
            style={{
              background: 'rgba(240,235,224,0.08)', color: 'var(--cream)',
              border: '1px solid rgba(240,235,224,0.16)', borderRadius: 8,
              padding: '6px 10px', fontSize: 13, fontFamily: 'DM Sans,sans-serif',
            }}
          >
            {floors.map(f => (
              <option key={f.floor_number} value={f.floor_number}>
                Piso {f.floor_number} ({f.unit_count} uds)
              </option>
            ))}
          </select>
        ) : (
          <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(240,235,224,0.12)', borderRadius: 8, overflow: 'hidden' }}>
            {floors.map(f => (
              <button
                key={f.floor_number}
                data-testid={`floor-tab-${f.floor_number}`}
                onClick={() => setSelectedFloor(f.floor_number)}
                style={{
                  padding: '5px 12px',
                  background: selectedFloor === f.floor_number ? 'rgba(99,102,241,0.2)' : 'transparent',
                  color: selectedFloor === f.floor_number ? '#a5b4fc' : 'var(--cream-3)',
                  border: 'none',
                  borderRight: '1px solid rgba(240,235,224,0.08)',
                  fontSize: 11.5, fontWeight: selectedFloor === f.floor_number ? 700 : 400,
                  cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                  transition: 'all 0.12s',
                  minWidth: 56,
                }}
              >
                <div>P{f.floor_number}</div>
                <div style={{ fontSize: 9, opacity: 0.7 }}>{f.unit_count}</div>
              </button>
            ))}
          </div>
        )}

        {/* Status legend chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 6 }}>
          {Object.entries(STATUS_CFG).map(([k, v]) => (
            statusCounts[k] ? (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: v.bg, border: `1.5px solid ${v.color}` }} />
                <span style={{ color: 'var(--cream-3)' }}>{v.label}</span>
                <span style={{ color: 'var(--cream-2)', fontWeight: 600 }}>{statusCounts[k]}</span>
              </div>
            ) : null
          ))}
        </div>

        {/* Admin: edit mode toggle */}
        {isAdmin && (
          <button
            data-testid="floor-edit-toggle-btn"
            onClick={() => setEditMode(e => !e)}
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 5,
              background: editMode ? 'rgba(99,102,241,0.2)' : 'rgba(240,235,224,0.06)',
              border: `1px solid ${editMode ? 'rgba(99,102,241,0.4)' : 'rgba(240,235,224,0.14)'}`,
              color: editMode ? '#a5b4fc' : 'var(--cream-3)',
              borderRadius: 8, padding: '5px 12px', fontSize: 11.5, cursor: 'pointer',
              fontFamily: 'DM Sans,sans-serif',
            }}
          >
            <Edit3 size={12} /> {editMode ? 'Modo edición ON' : 'Editar layout'}
          </button>
        )}
      </div>

      {/* ── Filter chips (B17) ─────────────────────────────────────────────── */}
      <FilterChipsBar
        filters_config={[
          {
            key: 'status',
            label: 'Estado',
            options: Object.entries(STATUS_CFG)
              .filter(([k]) => statusCounts[k])
              .map(([k, v]) => ({ value: k, label: v.label, count: statusCounts[k] || 0 })),
          },
          {
            key: 'prototipo',
            label: 'Tipo',
            options: allPrototipos.map(p => ({ value: p, label: p, count: protoCounts[p] || 0 })),
          },
        ]}
        current_state={{ status: statusFilter[0] || null, prototipo: prototipoFilter[0] || null }}
        on_change={handleFilterChange}
        sync_url={false}
      />

      {/* Price range inputs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--cream-3)', flexShrink: 0 }}>Precio:</span>
        <input
          data-testid="price-min-input"
          type="number" placeholder="Mín $"
          value={priceMin} onChange={e => setPriceMin(e.target.value)}
          style={{
            width: 90, background: 'rgba(240,235,224,0.06)',
            border: '1px solid rgba(240,235,224,0.14)', borderRadius: 6,
            padding: '4px 8px', color: 'var(--cream)', fontSize: 11, outline: 'none',
          }}
        />
        <span style={{ color: 'var(--cream-3)', fontSize: 11 }}>–</span>
        <input
          data-testid="price-max-input"
          type="number" placeholder="Máx $"
          value={priceMax} onChange={e => setPriceMax(e.target.value)}
          style={{
            width: 90, background: 'rgba(240,235,224,0.06)',
            border: '1px solid rgba(240,235,224,0.14)', borderRadius: 6,
            padding: '4px 8px', color: 'var(--cream)', fontSize: 11, outline: 'none',
          }}
        />
        {(priceMin || priceMax) && (
          <button onClick={() => { setPriceMin(''); setPriceMax(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', fontSize: 10 }}>
            <X size={11} />
          </button>
        )}
      </div>

      {/* ── Edit mode toolbar ─────────────────────────────────────────────── */}
      {editMode && isAdmin && (
        <div style={{
          display: 'flex', gap: 8, padding: '8px 12px',
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)',
          borderRadius: 8, alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600 }}>Modo edición</span>
          <span style={{ fontSize: 10.5, color: 'var(--cream-3)' }}>Arrastra unidades para reposicionar</span>

          {/* Upload background */}
          <label
            data-testid="bg-upload-label"
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(240,235,224,0.08)',
              border: '1px solid rgba(240,235,224,0.18)',
              color: 'var(--cream-2)', borderRadius: 7,
              padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            }}
          >
            <Upload size={11} />
            {uploadingBg ? 'Subiendo…' : 'Subir plano'}
            <input
              ref={bgUploadRef}
              type="file" accept=".svg,.png,.jpg,.jpeg,.webp"
              onChange={handleBgUpload}
              style={{ display: 'none' }}
              data-testid="bg-upload-input"
            />
          </label>

          {savingPositions && (
            <span style={{ fontSize: 10, color: 'var(--cream-3)', fontStyle: 'italic' }}>
              Guardando…
            </span>
          )}
        </div>
      )}

      {/* ── SVG Canvas ────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(240,235,224,0.1)' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(6,8,15,0.7)', zIndex: 10, borderRadius: 12,
          }}>
            <span style={{ color: 'var(--cream-3)', fontSize: 13 }}>Cargando piso {selectedFloor}…</span>
          </div>
        )}

        {displayUnits.length === 0 && !loading && (
          <div style={{ padding: '40px 24px' }}>
            <SmartEmptyState
              contextKey="floor_plan_empty_floor"
              headline="Piso sin unidades configuradas"
              description={isAdmin ? 'Activa modo Editar para arrastrar y configurar posiciones.' : 'Este piso no tiene unidades posicionadas.'}
            />
          </div>
        )}

        {displayUnits.length > 0 && (
          <svg
            ref={svgRef}
            data-testid="floor-plan-svg"
            viewBox={viewBox}
            style={{
              width: '100%',
              aspectRatio: '1000 / 800',
              background: 'rgba(6,8,15,0.85)',
              cursor: editMode ? 'default' : (panDrag ? 'grabbing' : 'grab'),
              display: 'block',
              userSelect: 'none',
              touchAction: 'none',
            }}
            onMouseDown={handleSVGMouseDown}
            onMouseMove={handleSVGMouseMove}
            onMouseUp={handleSVGMouseUp}
            onMouseLeave={handleSVGMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Background architectural plan */}
            {bgUrl && (
              <image
                href={bgUrl}
                x="0" y="0"
                width="1000" height="800"
                preserveAspectRatio="xMidYMid meet"
                opacity={0.35}
              />
            )}

            {/* Floor label */}
            <text
              x={12} y={22}
              fontSize={14} fontWeight={700}
              fontFamily="Outfit,sans-serif"
              fill="rgba(240,235,224,0.3)"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              PISO {selectedFloor}
            </text>

            {/* Grid lines (light) */}
            {Array.from({ length: 11 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={800}
                stroke="rgba(240,235,224,0.03)" strokeWidth={1} />
            ))}
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 100} x2={1000} y2={i * 100}
                stroke="rgba(240,235,224,0.03)" strokeWidth={1} />
            ))}

            {/* Units */}
            {displayUnits.map((unit) => {
              const passes = isFiltered(unit);
              return (
                <g
                  key={unit.id}
                  style={{ opacity: passes ? 1 : 0.25, transition: 'opacity 0.18s' }}
                >
                  <UnitRect
                    unit={unit}
                    editMode={editMode}
                    density={density}
                    onSelect={setSelectedUnit}
                    onHover={setTooltip}
                    onDragStart={handleDragStart}
                    onResizeStart={handleResizeStart}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {/* Zoom controls */}
        <div style={{
          position: 'absolute', bottom: 12, right: 12,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {[
            { icon: <ZoomIn size={14} />, action: zoomIn, tip: 'Acercar', testid: 'zoom-in-btn' },
            { icon: <ZoomOut size={14} />, action: zoomOut, tip: 'Alejar', testid: 'zoom-out-btn' },
            { icon: <Maximize2 size={14} />, action: fitView, tip: 'Ajustar', testid: 'zoom-fit-btn' },
          ].map(({ icon, action, tip, testid }) => (
            <button
              key={testid}
              data-testid={testid}
              onClick={action}
              title={tip}
              style={{
                width: 30, height: 30, borderRadius: 7,
                background: 'rgba(6,8,15,0.88)',
                border: '1px solid rgba(240,235,224,0.16)',
                color: 'var(--cream-2)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(4px)',
              }}
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Zoom level indicator */}
        <div style={{
          position: 'absolute', bottom: 12, left: 12,
          fontSize: 10, color: 'rgba(240,235,224,0.3)',
          fontFamily: 'DM Mono,monospace',
          background: 'rgba(6,8,15,0.7)', padding: '3px 7px', borderRadius: 5,
        }}>
          {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* ── Tooltip ──────────────────────────────────────────────────────── */}
      <Tooltip data={tooltip} />

      {/* ── Unit Drawer (desktop) / Bottom Sheet (mobile) ─────────────── */}
      {!mobile ? (
        <EntityDrawer
          isOpen={!!selectedUnit}
          onClose={() => setSelectedUnit(null)}
          title={selectedUnit ? `Unidad ${selectedUnit.unit_number}` : ''}
          entity_type="unit_detail_b11"
          user={user}
          width={560}
          body={selectedUnit ? (
            <UnitDrawerContent
              unit={selectedUnit}
              devId={devId}
              user={user}
              onUnitUpdated={() => {
                window.dispatchEvent(new CustomEvent('dmx:unit-updated', { detail: { devId } }));
                setSelectedUnit(null);
              }}
            />
          ) : null}
        />
      ) : (
        selectedUnit && (
          <div
            data-testid="floor-unit-bottom-sheet"
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2000,
              background: '#0b0e18',
              borderTop: '1px solid rgba(240,235,224,0.15)',
              borderRadius: '14px 14px 0 0',
              maxHeight: '85vh', overflowY: 'auto',
              boxShadow: '0 -16px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 18px', borderBottom: '1px solid rgba(240,235,224,0.08)',
            }}>
              <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
                Unidad {selectedUnit.unit_number}
              </span>
              <button
                onClick={() => setSelectedUnit(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <UnitDrawerContent
                unit={selectedUnit}
                devId={devId}
                user={user}
                onUnitUpdated={() => {
                  window.dispatchEvent(new CustomEvent('dmx:unit-updated', { detail: { devId } }));
                  setSelectedUnit(null);
                }}
              />
            </div>
          </div>
        )
      )}
    </div>
  );
}

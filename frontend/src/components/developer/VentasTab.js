/**
 * Phase 4 Batch 10 — Sub-chunk C
 * VentasTab — 3 sub-tabs: Inventario completo | Por prototipo | Vista de planta
 * URL sync: ?subtab=inventario|prototipos|planta
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EntityDrawer } from '../shared/EntityDrawer';
import UnitDrawerContent from './UnitDrawerContent';
import VistaPlantaInteractiva from './VistaPlantaInteractiva';
import usePreferences from '../../hooks/usePreferences';
import { listInventory, patchUnitFields, patchUnitFieldsBulk, getPaymentSchemes } from '../../api/developer';
import { appliedPrice } from '../../utils/paymentSchemes';
import { titleCase } from '../../utils/titleCase';
import PaymentQuoter from './PaymentQuoter';
import { Search, Upload, Building } from '../../components/icons';
import { Z } from '../../styles/zIndex';

// Nomenclatura del founder (imagen): tipos de cajón + color por tipo.
const PARKING_TYPE_LABELS = {
  individual: 'Individual',
  bateria_propia: 'Batería propia',
  bateria_vecino: 'Batería vecino',
  eleva_autos: 'Eleva-autos',
};
const PARKING_TYPE_COLOR = {
  individual: '#22c55e',
  bateria_propia: '#d4a72c',
  bateria_vecino: '#e0463d',
  eleva_autos: 'var(--theme-3)',
};

// Precio completo, sin abreviar (founder: "deben ser $5,454,290").
const fmtFull = (v) => (v || v === 0) ? `$${Number(v).toLocaleString('es-MX')}` : '—';
// m² con fallbacks de nombre de campo.
const m2priv = (u) => u.m2_privative ?? u.m2_priv ?? u.area_privative ?? null;
const m2balc = (u) => u.m2_balcony ?? u.m2_balcon ?? null;
const m2terr = (u) => u.m2_terrace ?? null;
const m2roof = (u) => u.m2_roof_garden ?? u.m2_roof ?? null;
const m2tot = (u) => u.m2_total ?? u.area_total ?? null;
const fm2 = (v) => (v || v === 0) ? `${v} m²` : '—';
// Desglose tipo "80+6bal" / "105+12ter".
const totalBreakdown = (u) => {
  const p = m2priv(u);
  if (!p) return null;
  let s = `${p}`;
  if (m2balc(u) > 0) s += `+${m2balc(u)}bal`;
  if (m2terr(u) > 0) s += `+${m2terr(u)}ter`;
  if (m2roof(u) > 0) s += `+${m2roof(u)}rg`;
  return s;
};

// Opciones legibles en TEMA CLARO (fondo blanco + texto oscuro).
const cellOptStyle = { background: '#fff', color: 'var(--cream)' };
// Editor inline (input/select) en celdas — tema claro.
const editInp = {
  background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.28)', borderRadius: 6,
  color: 'var(--cream)', fontSize: 12, padding: '3px 6px', boxSizing: 'border-box',
};
const bulkCtl = {
  background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)',
  borderRadius: 8, color: 'var(--cream)', fontSize: 12, padding: '6px 9px', fontWeight: 500,
};
const bulkCtlFull = { ...bulkCtl, width: '100%', boxSizing: 'border-box' };
// Campo de filtro con etiqueta arriba.
function FilterField({ label, children, w = 120 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: w }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{label}</span>
      {children}
    </div>
  );
}
// Grupo de filtros (sección con título) — para que NO se vea encimado.
function FilterGroup({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--theme)' }}>{title}</span>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>{children}</div>
    </div>
  );
}

// Botón-dropdown cohesivo (degradado inline cuando está activo/abierto).
function DropdownButton({ id, label, value, openId, setOpenId, active, children, width = 360, testid }) {
  const open = openId === id;
  const filled = active || open;
  return (
    <div data-dd-root style={{ position: 'relative', display: 'inline-block' }}>
      <button data-testid={testid} onClick={() => setOpenId(open ? null : id)}
        onMouseEnter={e => { if (!filled) e.currentTarget.style.boxShadow = '0 4px 16px rgba(var(--theme-rgb),0.22)'; }}
        onMouseLeave={e => { if (!filled) e.currentTarget.style.boxShadow = '0 1px 4px rgba(var(--theme-rgb),0.10)'; }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          // Degradado inline siempre: suave en reposo · full al activar/abrir.
          background: filled ? 'var(--grad)' : 'linear-gradient(135deg, rgba(var(--theme-rgb),0.16), rgba(var(--theme-rgb),0.05))',
          color: filled ? '#fff' : 'var(--cream)',
          border: filled ? 'none' : '1px solid rgba(var(--theme-rgb),0.28)',
          borderRadius: 9999, padding: '8px 16px', fontSize: 12.5, fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap',
          boxShadow: filled ? '0 4px 16px rgba(var(--theme-rgb),0.32)' : '0 1px 4px rgba(var(--theme-rgb),0.10)',
          transition: 'all 0.14s',
        }}>
        <span>{label}</span>
        {value != null && value !== '' && (
          <span style={{ opacity: filled ? 0.95 : 0.78, fontWeight: 600, paddingLeft: 8, marginLeft: 1, borderLeft: `1px solid ${filled ? 'rgba(255,255,255,0.4)' : 'rgba(var(--theme-rgb),0.3)'}` }}>{value}</span>
        )}
        <span style={{ fontSize: 9, opacity: 0.85 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: Z.DROPDOWN + 1,
          width, maxWidth: '90vw', maxHeight: '72vh', overflowY: 'auto',
          background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.16)', borderRadius: 14,
          padding: '14px 16px', boxShadow: '0 20px 54px rgba(0,0,0,0.2)',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Guarda un campo de la unidad (optimista + fallback a recargar).
function savePatch(devId, u, fields, onPatched) {
  onPatched(u.id, fields);
  patchUnitFields({ dev_id: devId, unit_id: u.id, ...fields }).catch(() =>
    window.dispatchEvent(new CustomEvent('dmx:unit-updated', { detail: { devId } })));
}

// Celda EDITABLE click-to-edit: muestra el valor; al hacer click se vuelve campo;
// al terminar guarda y parpadea un ✓ verde. types: num | text | select | bodega.
function EditableCell({ u, field, type = 'num', devId, onPatched, options, display, width = 70 }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [v, setV] = useState('');
  const cur = type === 'bodega' ? (u.bodega ? 'si' : (u.bodega === false ? 'no' : '')) : (u[field] ?? '');

  const start = (e) => { e.stopPropagation(); setV(cur); setEditing(true); };
  const finish = (val) => {
    setEditing(false);
    let fieldVal, changed;
    if (type === 'num') {
      if (val === '' || val == null) return;
      fieldVal = Math.max(0, +val); changed = fieldVal !== (u[field] ?? null);
    } else if (type === 'bodega') {
      if (val === '') return;
      fieldVal = val === 'si'; changed = fieldVal !== !!u.bodega;
    } else { // text / select
      fieldVal = type === 'text' ? (val || '').trim() : val;
      if (type === 'select' && fieldVal === '') return;
      changed = fieldVal !== (u[field] ?? (type === 'text' ? '' : null));
    }
    if (!changed) return;
    savePatch(devId, u, { [field]: fieldVal }, onPatched);
    setSaved(true); setTimeout(() => setSaved(false), 1400);
  };

  if (!editing) {
    return (
      <span data-testid={`edit-${field}-${u.unit_number}`} onClick={start}
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 5px', borderRadius: 5, minWidth: 22, transition: 'background 0.1s' }}
        title="Click para editar"
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.10)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {display ? display(u) : (u[field] ?? '—')}
        {saved && <span style={{ color: '#16a34a', fontWeight: 900 }}>✓</span>}
      </span>
    );
  }
  if (type === 'select' || type === 'bodega') {
    const opts = type === 'bodega' ? [{ value: 'si', label: 'Sí (incluida)' }, { value: 'no', label: 'No' }] : options;
    return (
      <select autoFocus value={v} onClick={e => e.stopPropagation()}
        onChange={e => { setV(e.target.value); finish(e.target.value); }}
        onBlur={() => setEditing(false)} style={{ ...editInp, width: 'auto' }}>
        <option value="" style={cellOptStyle}>—</option>
        {opts.map(o => <option key={o.value} value={o.value} style={cellOptStyle}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input autoFocus type={type === 'num' ? 'number' : 'text'} min={0} value={v}
      onClick={e => e.stopPropagation()} onChange={e => setV(e.target.value)}
      onBlur={() => finish(v)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={{ ...editInp, width }} />
  );
}

// Celdas "Adicionales": Tipo de cajón (a color) · Bodega · Vista. Click-to-edit.
function ExtraCells({ u, devId, onPatched, editMode }) {
  const ptColor = PARKING_TYPE_COLOR[u.parking_type] || 'var(--cream-2)';
  const tipoDisplay = (uu) => <span style={{ color: PARKING_TYPE_COLOR[uu.parking_type] || 'var(--cream-2)', fontWeight: 700, fontSize: 12 }}>{PARKING_TYPE_LABELS[uu.parking_type] || '—'}</span>;
  const bodegaDisplay = (uu) => <span style={{ color: uu.bodega ? '#16a34a' : 'var(--cream-3)', fontSize: 12, fontWeight: 700 }}>{uu.bodega ? '✓ Incl.' : '—'}</span>;
  const vistaDisplay = (uu) => <span style={{ color: 'var(--cream-2)', fontSize: 12 }}>{uu.vista === 'interior' ? 'Interior' : uu.vista === 'exterior' ? 'Exterior' : '—'}</span>;
  const PARKING_OPTS = Object.entries(PARKING_TYPE_LABELS).map(([value, label]) => ({ value, label }));

  if (!editMode) {
    return (
      <>
        <td style={{ padding: '8px 12px', borderLeft: '1px solid rgba(var(--cream-rgb),0.06)' }}>
          <span style={{ color: ptColor, fontWeight: 700, fontSize: 12 }}>{PARKING_TYPE_LABELS[u.parking_type] || '—'}</span>
        </td>
        <td style={{ padding: '8px 12px' }}>{bodegaDisplay(u)}</td>
        <td style={{ padding: '8px 12px' }}>{vistaDisplay(u)}</td>
      </>
    );
  }
  return (
    <>
      <td style={{ padding: '8px 12px', borderLeft: '1px solid rgba(var(--cream-rgb),0.06)' }}>
        <EditableCell u={u} field="parking_type" type="select" devId={devId} onPatched={onPatched} options={PARKING_OPTS} display={tipoDisplay} />
      </td>
      <td style={{ padding: '8px 12px' }}>
        <EditableCell u={u} field="bodega" type="bodega" devId={devId} onPatched={onPatched} display={bodegaDisplay} />
      </td>
      <td style={{ padding: '8px 12px' }}>
        <EditableCell u={u} field="vista" type="select" devId={devId} onPatched={onPatched}
          options={[{ value: 'interior', label: 'Interior' }, { value: 'exterior', label: 'Exterior' }]} display={vistaDisplay} />
      </td>
    </>
  );
}

// Estados (4) con colores DISCRETOS (tinte claro + texto oscuro · tema claro).
const STATUS_CONFIG = {
  disponible: { label: 'Disponible', color: '#15803d', bg: 'rgba(34,197,94,0.15)', bd: 'rgba(34,197,94,0.4)' },
  reservado:  { label: 'Reservado',  color: '#1d4ed8', bg: 'rgba(59,130,246,0.15)', bd: 'rgba(59,130,246,0.4)' },
  vendido:    { label: 'Vendido',    color: '#b91c1c', bg: 'rgba(224,70,61,0.15)', bd: 'rgba(224,70,61,0.4)' },
  bloqueado:  { label: 'Bloqueado',  color: '#475569', bg: 'rgba(100,116,139,0.18)', bd: 'rgba(100,116,139,0.45)' },
  apartado:   { label: 'Reservado',  color: '#1d4ed8', bg: 'rgba(59,130,246,0.15)', bd: 'rgba(59,130,246,0.4)' }, // legacy → reservado
};
const STATUS_OPTIONS = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'reservado', label: 'Reservado' },
  { value: 'vendido', label: 'Vendido' },
  { value: 'bloqueado', label: 'Bloqueado' },
];

const fmtMXN = (v) => v == null ? '—' : `$${(v / 1_000_000).toFixed(2)}M`;
const PAGE_SIZE = 30;

const SUB_TABS = [
  { key: 'inventario', label: 'Inventario completo' },
  { key: 'prototipos', label: 'Por prototipo' },
  { key: 'planta', label: 'Vista de planta' },
];

function StatusChip({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.disponible;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.bd}`,
      fontSize: 10.5, fontWeight: 800, padding: '3px 10px',
      borderRadius: 7, letterSpacing: '0.02em',
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Inventario Completo ────────────────────────────────────────────────────
function InventarioCompleto({ units, devId, user, onBulkUpload, onUnitPatched, priceAdjustPct = 0, schemes = [], selScheme = 'lista', setSelScheme = () => {}, onOpenQuoter = () => {} }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [drawerUnit, setDrawerUnit] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [bulkField, setBulkField] = useState('parking_spots');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [onlyEmpty, setOnlyEmpty] = useState(false);        // aplicar solo a las que les falta el dato
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [protoFil, setProtoFil] = useState('');
  const [levelFil, setLevelFil] = useState('');
  const [recFil, setRecFil] = useState('');
  const [banosFil, setBanosFil] = useState('');
  const [spotsFil, setSpotsFil] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [m2Fil, setM2Fil] = useState('');
  const [vistaFil, setVistaFil] = useState('');
  const [cajonFil, setCajonFil] = useState('');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);  // 'scheme' | 'status' | 'filtros' | null
  const { pref } = usePreferences();
  const density_mode = pref('density_mode', 'compacto');
  const [searchParams, setSearchParams] = useSearchParams();

  // Sync status filter to URL
  useEffect(() => {
    const urlStatus = searchParams.get('status_filter');
    if (urlStatus && urlStatus !== statusFilter) setStatusFilter(urlStatus);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cierra los dropdowns al hacer click fuera; clic en otro dropdown cambia directo (sin backdrop).
  useEffect(() => {
    if (!openDropdown) return undefined;
    const onDown = (e) => { if (!e.target.closest('[data-dd-root]')) setOpenDropdown(null); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openDropdown]);

  const handleFilterChange = (key, value) => {
    if (key === 'status') {
      setStatusFilter(value || null);
      const next = new URLSearchParams(searchParams);
      if (value) next.set('status_filter', value); else next.delete('status_filter');
      setSearchParams(next, { replace: true });
      setPage(1);
    }
  };

  // Counts
  const counts = {};
  units.forEach(u => { const s = u.status || 'disponible'; counts[s] = (counts[s] || 0) + 1; });

  // Opciones de filtro (de todo el inventario)
  const allProtos = [...new Set(units.map(u => u.prototype).filter(Boolean))].sort();
  const allLevels = [...new Set(units.map(u => u.level).filter(v => v != null))].sort((a, b) => a - b);
  const allRecs = [...new Set(units.map(u => u.bedrooms).filter(v => v != null))].sort((a, b) => a - b);
  const allBanos = [...new Set(units.map(u => u.bathrooms).filter(v => v != null))].sort((a, b) => a - b);
  const allSpots = [...new Set(units.map(u => u.parking_spots).filter(v => v != null))].sort((a, b) => a - b);
  const allM2 = [...new Set(units.map(u => m2tot(u)).filter(v => v != null))].sort((a, b) => a - b);
  const unitIncompleta = (u) => !u.parking_type || u.bodega == null || !u.vista || !m2priv(u);

  // Filtros (sirven para acotar y editar inventario)
  const filtered = units.filter(u => {
    const matchSearch = !search || u.unit_number?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || u.status === statusFilter;
    const matchProto = !protoFil || u.prototype === protoFil;
    const matchLevel = !levelFil || String(u.level) === String(levelFil);
    const matchRec = !recFil || String(u.bedrooms) === String(recFil);
    const matchBanos = !banosFil || String(u.bathrooms) === String(banosFil);
    const matchSpots = !spotsFil || String(u.parking_spots) === String(spotsFil);
    const price = u.price || 0;
    const matchPriceMin = priceMin === '' || price >= +priceMin;
    const matchPriceMax = priceMax === '' || price <= +priceMax;
    const matchM2 = !m2Fil || String(m2tot(u)) === String(m2Fil);
    const matchVista = !vistaFil || u.vista === vistaFil;
    const matchCajon = !cajonFil || u.parking_type === cajonFil;
    const matchIncomplete = !incompleteOnly || unitIncompleta(u);
    return matchSearch && matchStatus && matchProto && matchLevel && matchRec && matchBanos && matchSpots
      && matchPriceMin && matchPriceMax && matchM2 && matchVista && matchCajon && matchIncomplete;
  });
  const anyFilter = protoFil || levelFil || recFil || banosFil || spotsFil || priceMin || priceMax || m2Fil || vistaFil || cajonFil || incompleteOnly || statusFilter || search;

  // Controles de filtro combinables (se usan arriba para navegar y dentro del panel
  // de edición para acotar a qué unidades se aplica el llenado masivo).
  const clearFilters = () => { setProtoFil(''); setLevelFil(''); setRecFil(''); setBanosFil(''); setSpotsFil(''); setPriceMin(''); setPriceMax(''); setM2Fil(''); setVistaFil(''); setCajonFil(''); setIncompleteOnly(false); setSearch(''); handleFilterChange('status', null); setPage(1); };
  const renderFilters = () => (
    <div>
      <div style={{ display: 'flex', gap: 28, rowGap: 16, flexWrap: 'wrap' }}>
        <FilterGroup title="Tipología">
          <FilterField label="Prototipo" w={120}>
            <select value={protoFil} onChange={e => { setProtoFil(e.target.value); setPage(1); }} style={bulkCtlFull}>
              <option value="" style={cellOptStyle}>Todos</option>
              {allProtos.map(p => <option key={p} value={p} style={cellOptStyle}>Tipo {p}</option>)}
            </select>
          </FilterField>
          <FilterField label="Nivel" w={100}>
            <select value={levelFil} onChange={e => { setLevelFil(e.target.value); setPage(1); }} style={bulkCtlFull}>
              <option value="" style={cellOptStyle}>Todos</option>
              {allLevels.map(l => <option key={l} value={l} style={cellOptStyle}>Nivel {l}</option>)}
            </select>
          </FilterField>
        </FilterGroup>

        <FilterGroup title="Distribución">
          <FilterField label="Recámaras" w={110}>
            <select value={recFil} onChange={e => { setRecFil(e.target.value); setPage(1); }} style={bulkCtlFull}>
              <option value="" style={cellOptStyle}>Todas</option>
              {allRecs.map(r => <option key={r} value={r} style={cellOptStyle}>{r} rec</option>)}
            </select>
          </FilterField>
          <FilterField label="Baños" w={100}>
            <select value={banosFil} onChange={e => { setBanosFil(e.target.value); setPage(1); }} style={bulkCtlFull}>
              <option value="" style={cellOptStyle}>Todos</option>
              {allBanos.map(b => <option key={b} value={b} style={cellOptStyle}>{b} baños</option>)}
            </select>
          </FilterField>
          <FilterField label="Cajones" w={110}>
            <select value={spotsFil} onChange={e => { setSpotsFil(e.target.value); setPage(1); }} style={bulkCtlFull}>
              <option value="" style={cellOptStyle}>Todos</option>
              {allSpots.map(s => <option key={s} value={s} style={cellOptStyle}>{s} cajones</option>)}
            </select>
          </FilterField>
        </FilterGroup>

        <FilterGroup title="Áreas y atributos">
          <FilterField label="m² totales" w={110}>
            <select value={m2Fil} onChange={e => { setM2Fil(e.target.value); setPage(1); }} style={bulkCtlFull}>
              <option value="" style={cellOptStyle}>Todos</option>
              {allM2.map(m => <option key={m} value={m} style={cellOptStyle}>{m} m²</option>)}
            </select>
          </FilterField>
          <FilterField label="Vista" w={110}>
            <select value={vistaFil} onChange={e => { setVistaFil(e.target.value); setPage(1); }} style={bulkCtlFull}>
              <option value="" style={cellOptStyle}>Todas</option>
              <option value="interior" style={cellOptStyle}>Interior</option>
              <option value="exterior" style={cellOptStyle}>Exterior</option>
            </select>
          </FilterField>
          <FilterField label="Tipo de cajón" w={130}>
            <select value={cajonFil} onChange={e => { setCajonFil(e.target.value); setPage(1); }} style={bulkCtlFull}>
              <option value="" style={cellOptStyle}>Todos</option>
              {Object.entries(PARKING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k} style={cellOptStyle}>{v}</option>)}
            </select>
          </FilterField>
        </FilterGroup>

        <FilterGroup title="Comercial">
          <FilterField label="Estado" w={120}>
            <select value={statusFilter || ''} onChange={e => handleFilterChange('status', e.target.value || null)} style={bulkCtlFull}>
              <option value="" style={cellOptStyle}>Todos</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value} style={cellOptStyle}>{o.label}</option>)}
            </select>
          </FilterField>
          <FilterField label="Precio (rango)" w={170}>
            <div style={{ display: 'flex', gap: 5 }}>
              <input type="number" value={priceMin} onChange={e => { setPriceMin(e.target.value); setPage(1); }} placeholder="mín" style={{ ...bulkCtlFull }} />
              <input type="number" value={priceMax} onChange={e => { setPriceMax(e.target.value); setPage(1); }} placeholder="máx" style={{ ...bulkCtlFull }} />
            </div>
          </FilterField>
        </FilterGroup>

        <FilterGroup title="Datos">
          <FilterField label="Completitud" w={150}>
            <button onClick={() => { setIncompleteOnly(v => !v); setPage(1); }}
              title="Unidades a las que les falta tipo de cajón, bodega, vista o m²"
              style={{ ...bulkCtlFull, cursor: 'pointer', textAlign: 'left',
                background: incompleteOnly ? 'rgba(245,158,11,0.2)' : '#fff',
                color: incompleteOnly ? '#b45309' : 'var(--cream-2)',
                border: incompleteOnly ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(var(--cream-rgb),0.26)' }}>
              ⚠ Solo incompletas
            </button>
          </FilterField>
        </FilterGroup>
      </div>
      {anyFilter && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(var(--cream-rgb),0.1)' }}>
          <button onClick={clearFilters}
            style={{ background: 'none', border: 'none', color: 'var(--theme)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  );

  // Cuántos filtros están activos (para el badge del botón).
  const activeFilterCount = [protoFil, levelFil, recFil, banosFil, spotsFil, m2Fil, vistaFil, cajonFil, statusFilter, priceMin, priceMax].filter(Boolean).length + (incompleteOnly ? 1 : 0);

  // Etiqueta corta de la forma de pago seleccionada (para el botón).
  const selSchemeLabel = selScheme === 'lista'
    ? 'Lista'
    : (() => { const s = schemes.find(x => x.id === selScheme); return s ? `Eng ${s.firma_pct}%${s.descuento_pct > 0 ? ` · −${s.descuento_pct}%` : ''}` : 'Lista'; })();
  const statusLabel = statusFilter ? (STATUS_CONFIG[statusFilter]?.label || statusFilter) : 'Todos';

  // ── Botones-dropdown del control bar ──────────────────────────────────────
  const formaPagoDropdown = () => (
    <DropdownButton id="scheme" testid="dd-scheme" label="Forma de pago" value={selSchemeLabel}
      openId={openDropdown} setOpenId={setOpenDropdown} active={selScheme !== 'lista'} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[{ id: 'lista', nombre: 'Lista', descuento_pct: 0 }, ...schemes].map(s => {
          const on = selScheme === s.id;
          return (
            <button key={s.id} onClick={() => { setSelScheme(s.id); setOpenDropdown(null); }}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left',
                background: on ? 'rgba(var(--theme-rgb),0.10)' : 'transparent',
                border: `1px solid ${on ? 'rgba(var(--theme-rgb),0.35)' : 'rgba(var(--cream-rgb),0.12)'}`,
                borderRadius: 9, padding: '9px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--cream)',
              }}>
              <span style={{ fontWeight: on ? 800 : 600 }}>
                {s.id === 'lista' ? 'Lista (precio base)' : `Eng: ${s.firma_pct}% / Mens: ${s.mensualidades_pct}% / Escritura: ${s.escritura_pct}%`}
              </span>
              {s.descuento_pct > 0 && <span style={{ color: '#15803d', fontWeight: 800 }}>−{s.descuento_pct}%</span>}
            </button>
          );
        })}
        <button onClick={() => { setOpenDropdown(null); onOpenQuoter(); }}
          style={{ marginTop: 4, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.3)', color: 'var(--theme)', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          🧮 Cotizador a la medida…
        </button>
      </div>
    </DropdownButton>
  );

  const estadoDropdown = () => (
    <DropdownButton id="status" testid="dd-status" label="Estado" width={240}
      value={statusFilter ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_CONFIG[statusFilter]?.color || '#fff', boxShadow: '0 0 0 2px rgba(255,255,255,0.5)' }} />
          {statusLabel}
        </span>
      ) : 'Todos'}
      openId={openDropdown} setOpenId={setOpenDropdown} active={!!statusFilter}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[{ value: '', label: 'Todos' }, ...STATUS_OPTIONS].map(o => {
          const on = (statusFilter || '') === o.value;
          const cfg = o.value ? STATUS_CONFIG[o.value] : null;
          return (
            <button key={o.value || 'all'} onClick={() => { handleFilterChange('status', o.value || null); setOpenDropdown(null); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: on ? 'rgba(var(--theme-rgb),0.10)' : 'transparent', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 12.5, fontWeight: on ? 800 : 500, color: cfg ? cfg.color : 'var(--cream)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg ? cfg.color : 'rgba(var(--cream-rgb),0.3)' }} />
                {o.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>{o.value ? (counts[o.value] || 0) : filtered.length}</span>
            </button>
          );
        })}
      </div>
    </DropdownButton>
  );

  const filtrosDropdown = () => (
    <DropdownButton id="filtros" testid="filters-toggle" label="⚙ Filtros"
      value={activeFilterCount > 0 ? activeFilterCount : ''} openId={openDropdown} setOpenId={setOpenDropdown}
      active={activeFilterCount > 0} width={'min(840px, 90vw)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>Filtrar inventario</span>
        <button onClick={() => setOpenDropdown(null)} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>
      {renderFilters()}
    </DropdownButton>
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const rowHeight = density_mode === 'compacto' ? 40 : 56;

  // Todos los campos que se pueden llenar masivamente.
  const BULK_FIELDS = [
    { key: 'm2_privative', label: 'M² privativos', type: 'num' },
    { key: 'm2_balcony', label: 'M² balcón', type: 'num' },
    { key: 'm2_terrace', label: 'M² terraza', type: 'num' },
    { key: 'm2_roof_garden', label: 'M² roof garden', type: 'num' },
    { key: 'm2_total', label: 'M² totales', type: 'num' },
    { key: 'bedrooms', label: 'Recámaras', type: 'num' },
    { key: 'bathrooms', label: 'Baños', type: 'num' },
    { key: 'parking_spots', label: 'Cajones (número)', type: 'num' },
    { key: 'parking_type', label: 'Tipo de cajón', type: 'parking' },
    { key: 'bodega', label: 'Bodega', type: 'bodega' },
    { key: 'vista', label: 'Vista', type: 'vista' },
    { key: 'price', label: 'Precio', type: 'num' },
    { key: 'status', label: 'Estado', type: 'status' },
  ];
  const bulkFieldDef = BULK_FIELDS.find(f => f.key === bulkField) || BULK_FIELDS[0];

  // ¿Está vacío este campo en la unidad? (para "solo las vacías")
  const fieldIsEmpty = (u, key) => {
    if (key === 'parking_type') return !u.parking_type;
    if (key === 'bodega') return u.bodega == null;
    if (key === 'vista') return !u.vista;
    if (key === 'status') return !u.status;
    return u[key] == null;  // numéricos
  };

  // Selección con casillas
  const toggleSelect = (id) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allFilteredSelected = filtered.length > 0 && filtered.every(u => selectedIds.has(u.id));
  const toggleSelectAll = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (allFilteredSelected) filtered.forEach(u => n.delete(u.id));
    else filtered.forEach(u => n.add(u.id));
    return n;
  });
  const selectedCount = filtered.filter(u => selectedIds.has(u.id)).length;

  // Ámbito = (las marcadas si hay, si no, todas las filtradas) → opcionalmente solo las vacías.
  const baseSet = selectedCount > 0 ? filtered.filter(u => selectedIds.has(u.id)) : filtered;
  const scopedUnits = onlyEmpty ? baseSet.filter(u => fieldIsEmpty(u, bulkField)) : baseSet;

  // Llenado masivo: aplica el campo+valor a las unidades del ámbito de un click.
  const applyBulk = async () => {
    if (bulkValue === '' || !scopedUnits.length) return;
    const ids = scopedUnits.map(u => u.id);
    const fields = {};
    if (bulkFieldDef.type === 'bodega') fields.bodega = bulkValue === 'si';
    else if (bulkFieldDef.type === 'num') fields[bulkField] = Math.max(0, +bulkValue);
    else fields[bulkField] = bulkValue;  // parking_type / vista / status
    setBulkBusy(true);
    try {
      await patchUnitFieldsBulk({ dev_id: devId, unit_ids: ids, ...fields });
      ids.forEach(id => onUnitPatched(id, fields));  // optimista
      setBulkValue('');
    } catch (e) {
      window.dispatchEvent(new CustomEvent('dmx:unit-updated', { detail: { devId } }));
    } finally { setBulkBusy(false); }
  };

  // Reload inventory on unit update callback
  const handleUnitUpdated = () => {
    // Parent VentasTab manages loading; emit a window event so it can refresh.
    window.dispatchEvent(new CustomEvent('dmx:unit-updated', { detail: { devId } }));
  };

  const drawerSections = drawerUnit ? [
    {
      id: 'general',
      title: 'Información general',
      defaultOpen: true,
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            ['Número', drawerUnit.unit_number],
            ['Prototipo', drawerUnit.prototype],
            ['Nivel', drawerUnit.level],
            ['m² total', `${drawerUnit.area_total ?? '—'} m²`],
            ['Recámaras', drawerUnit.bedrooms ?? '—'],
            ['Estado', <StatusChip key="s" status={drawerUnit.status} />],
            ['Precio', fmtMXN(drawerUnit.price)],
            ['Orientación', drawerUnit.orientation ?? '—'],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 13, color: 'var(--cream)' }}>{v}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'notes',
      title: 'Observaciones',
      defaultOpen: false,
      content: <p style={{ margin: 0, color: 'var(--cream-3)', fontSize: 12 }}>Drawer enriquecido disponible en B11.</p>,
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--cream-3)' }} />
          <input
            data-testid="unit-search-input"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar unidad…"
            style={{
              width: '100%', background: 'rgba(var(--cream-rgb),0.09)',
              border: '1px solid rgba(var(--cream-rgb),0.2)', borderRadius: 8,
              padding: '6px 10px 6px 30px', color: 'var(--cream)', fontSize: 13,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Bulk upload */}
        <button
          data-testid="bulk-upload-btn"
          onClick={onBulkUpload}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(var(--cream-rgb),0.10)', color: 'var(--cream)',
            border: '1px solid rgba(var(--cream-rgb),0.22)', borderRadius: 8,
            padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Upload size={13} /> Bulk Upload
        </button>

        <span style={{ fontSize: 12, color: 'var(--cream-3)', marginLeft: 'auto' }}>
          {filtered.length > PAGE_SIZE
            ? `Mostrando ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} de ${filtered.length}`
            : `${filtered.length} unidades`}
        </span>

        {/* Editar — prominente, arriba a la derecha de la tabla (founder) */}
        <button
          data-testid="edit-mode-toggle"
          onClick={() => setEditMode(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--grad)', color: '#fff', border: 'none',
            borderRadius: 9999, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            boxShadow: editMode ? '0 0 0 3px rgba(var(--theme-rgb),0.25)' : '0 4px 14px rgba(var(--theme-rgb),0.3)',
          }}
        >
          {editMode ? '✓ Editando inventario' : '✎ Editar inventario'}
        </button>
      </div>

      {/* Control bar — Forma de pago · Estado · Filtros (botones-dropdown con degradado) */}
      {!editMode && (
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
          {schemes.length > 0 && formaPagoDropdown()}
          {estadoDropdown()}
          {filtrosDropdown()}
          {(anyFilter || statusFilter) && (
            <button onClick={() => { clearFilters(); handleFilterChange('status', null); }}
              style={{ background: 'none', border: 'none', color: 'var(--cream-3)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', padding: '4px 2px' }}>
              Limpiar todo
            </button>
          )}
        </div>
      )}

      {/* Panel de edición en bloque: 1) ¿a cuáles? (combina filtros) → 2) qué llenar → aplicar */}
      {editMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '16px 18px', background: 'rgba(var(--theme-rgb),0.05)', border: '1px solid rgba(var(--theme-rgb),0.22)', borderRadius: 12 }}>
          {/* Paso 1: a cuáles (criterios combinables, dentro de un dropdown) */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--theme)', marginBottom: 10 }}>
              1 · ¿A Cuáles? — Combina los Criterios que Quieras
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {filtrosDropdown()}
              <span style={{ fontSize: 12, color: 'var(--cream-2)' }}>
                Quedan <strong style={{ color: 'var(--theme)' }}>{filtered.length}</strong> unidades
                {activeFilterCount > 0 ? ' con tus filtros.' : ' (sin filtro = todas).'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 6 }}>
              Ej: Prototipo A + 3 recámaras + 100 m² → modificas exacto ese grupo (sin tocar los de 150 m²).
            </div>
          </div>

          {/* Paso 2: qué llenar */}
          <div style={{ borderTop: '1px solid rgba(var(--theme-rgb),0.18)', marginTop: 16, paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--theme)', marginBottom: 10 }}>
              2 · Llena en Bloque (o Edita Celda por Celda con Click)
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>Llenar:</span>
            <select value={bulkField} onChange={e => { setBulkField(e.target.value); setBulkValue(''); }} style={bulkCtl}>
              {BULK_FIELDS.map(f => <option key={f.key} value={f.key} style={cellOptStyle}>{f.label}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--cream-3)' }}>con</span>
            {bulkFieldDef.type === 'num' && (
              <input type="number" min={0} value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="valor" style={{ ...bulkCtl, width: 120 }} />
            )}
            {bulkFieldDef.type === 'parking' && (
              <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} style={bulkCtl}>
                <option value="" style={cellOptStyle}>Elige…</option>
                {Object.entries(PARKING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k} style={cellOptStyle}>{v}</option>)}
              </select>
            )}
            {bulkFieldDef.type === 'bodega' && (
              <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} style={bulkCtl}>
                <option value="" style={cellOptStyle}>Elige…</option>
                <option value="si" style={cellOptStyle}>Sí (incluida)</option>
                <option value="no" style={cellOptStyle}>No</option>
              </select>
            )}
            {bulkFieldDef.type === 'vista' && (
              <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} style={bulkCtl}>
                <option value="" style={cellOptStyle}>Elige…</option>
                <option value="interior" style={cellOptStyle}>Interior</option>
                <option value="exterior" style={cellOptStyle}>Exterior</option>
              </select>
            )}
            {bulkFieldDef.type === 'status' && (
              <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} style={bulkCtl}>
                <option value="" style={cellOptStyle}>Elige…</option>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value} style={cellOptStyle}>{o.label}</option>)}
              </select>
            )}
          </div>
          {/* Fila 2: a qué unidades + aplicar (lógica simple y clara) */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cream-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyEmpty} onChange={e => setOnlyEmpty(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--theme)', colorScheme: 'light', width: 15, height: 15 }} />
              Solo a las que les falta el dato
            </label>
            <button data-testid="bulk-apply" onClick={applyBulk} disabled={bulkValue === '' || bulkBusy || !scopedUnits.length}
              style={{ background: (bulkValue === '' || bulkBusy || !scopedUnits.length) ? 'rgba(148,163,184,0.25)' : 'var(--grad)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: (bulkValue === '' || bulkBusy || !scopedUnits.length) ? 'not-allowed' : 'pointer' }}>
              {bulkBusy ? 'Aplicando…' : `Aplicar a ${scopedUnits.length} ${selectedCount > 0 ? 'seleccionadas' : 'filtradas'}`}
            </button>
            <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>
              {selectedCount > 0
                ? `${selectedCount} marcadas.`
                : 'Marca las casillas (columna ID) para elegir unidades; sin marcar, se aplica a todas las filtradas.'}
            </span>
              {selectedCount > 0 && (
                <button onClick={() => setSelectedIds(new Set())} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
                  Quitar selección
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(var(--cream-rgb),0.1)' }}>
        <table className="density-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
          <thead>
            {(() => {
              // TEMA CLARO (.portal-asesor): bandas pastel + texto OSCURO saturado = legible.
              // Cohesivo: datos en familia fría; color con significado en Adicionales (editable) y Precio (dinero).
              const CATS = [
                { label: 'Unidad', span: 3, rgb: '100,116,139', fg: '#334155' },        // slate
                { label: 'M² desglosados', span: 5, rgb: '56,150,230', fg: '#1e40af' },  // azul
                { label: 'Características', span: 3, rgb: '139,92,246', fg: '#5b21b6' },   // violeta
                { label: 'Adicionales', span: 3, rgb: '99,102,241', fg: '#3730a3' },      // índigo (editable)
                { label: 'Precio', span: 2, rgb: '34,197,94', fg: '#15803d' },            // verde (dinero)
                { label: '', span: 1, rgb: null, fg: 'transparent' },
              ];
              const labels = ['ID', 'PROTO.', 'NIVEL', 'M² PRIV.', 'BALCÓN', 'TERRAZA', 'RG PRIV.', 'M² TOTALES', 'REC.', 'BAÑOS', 'CAJONES', 'TIPO CAJÓN', 'BODEGA', 'VISTA', 'PRECIO', 'ESTADO', ''];
              const colCats = [];
              CATS.forEach((c, ci) => { for (let k = 0; k < c.span; k++) colCats.push({ ...c, first: k === 0, ci }); });
              return (
                <>
                  <tr>
                    {CATS.map((g, i) => (
                      <th key={i} colSpan={g.span} style={{
                        padding: g.label ? '7px 12px' : 0, textAlign: 'center',
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
                        color: g.fg, background: g.rgb ? `rgba(${g.rgb},0.34)` : 'transparent',
                        borderBottom: g.rgb ? `2px solid rgba(${g.rgb},0.8)` : '1px solid rgba(var(--cream-rgb),0.12)',
                        borderLeft: (i > 0 && g.rgb) ? '1px solid rgba(var(--cream-rgb),0.18)' : 'none',
                      }}>
                        {g.label}
                      </th>
                    ))}
                  </tr>
                  <tr style={{ position: 'sticky', top: 0, zIndex: Z.BASE }}>
                    {labels.map((h, idx) => {
                      const c = colCats[idx] || {};
                      return (
                        <th key={idx} style={{
                          padding: density_mode === 'compacto' ? '8px 12px' : '10px 14px',
                          textAlign: 'left', fontSize: 10.5, fontWeight: 700,
                          color: c.rgb ? c.fg : 'var(--cream-2)',      // oscuro saturado = legible en claro
                          background: c.rgb ? `rgba(${c.rgb},0.11)` : 'rgba(var(--cream-rgb),0.04)',
                          borderBottom: c.rgb ? `2px solid rgba(${c.rgb},0.45)` : '1px solid rgba(var(--cream-rgb),0.1)',
                          whiteSpace: 'nowrap',
                          borderLeft: (c.first && c.ci > 0 && c.rgb) ? `1px solid rgba(${c.rgb},0.3)` : 'none',
                        }}>
                          {idx === 0 && editMode ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                              <input type="checkbox" data-testid="select-all" checked={allFilteredSelected}
                                onChange={toggleSelectAll} title="Seleccionar todas las filtradas"
                                style={{ cursor: 'pointer', accentColor: 'var(--theme)', colorScheme: 'light', width: 15, height: 15 }} />
                              {h}
                            </span>
                          ) : h}
                        </th>
                      );
                    })}
                  </tr>
                </>
              );
            })()}
          </thead>
          <tbody>
            {paged.map((u, i) => (
              <tr
                key={u.id || i}
                data-testid={`unit-row-${u.unit_number}`}
                style={{
                  minHeight: rowHeight,
                  borderBottom: i < paged.length - 1 ? '1px solid rgba(var(--cream-rgb),0.06)' : 'none',
                  cursor: 'pointer', transition: 'background 0.14s, box-shadow 0.14s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.06)';
                  e.currentTarget.style.boxShadow = 'inset 3px 0 0 var(--theme-3), 0 1px 14px rgba(var(--theme-rgb),0.18)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onClick={() => setDrawerUnit(u)}
              >
                {/* UNIDAD */}
                <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap' }}>
                  {editMode ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" data-testid={`select-${u.unit_number}`}
                        checked={selectedIds.has(u.id)}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleSelect(u.id)}
                        style={{ cursor: 'pointer', accentColor: 'var(--theme)', colorScheme: 'light', width: 15, height: 15 }} />
                      {u.unit_number}
                    </span>
                  ) : u.unit_number}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  {editMode
                    ? <EditableCell u={u} field="prototype" type="text" devId={devId} onPatched={onUnitPatched} width={52}
                        display={uu => <span style={{ display: 'inline-block', padding: '1px 9px', borderRadius: 6, background: 'rgba(var(--cream-rgb),0.08)', color: 'var(--cream-2)', fontSize: 11, fontWeight: 700 }}>{uu.prototype || '—'}</span>} />
                    : <span style={{ display: 'inline-block', padding: '1px 9px', borderRadius: 6, background: 'rgba(var(--cream-rgb),0.08)', color: 'var(--cream-2)', fontSize: 11, fontWeight: 700 }}>{u.prototype || '—'}</span>}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cream-2)' }}>
                  {editMode ? <EditableCell u={u} field="level" type="num" devId={devId} onPatched={onUnitPatched} width={46} /> : (u.level ?? '—')}
                </td>
                {/* M² DESGLOSADOS */}
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cream-2)', whiteSpace: 'nowrap', borderLeft: '1px solid rgba(var(--cream-rgb),0.06)' }}>{editMode ? <EditableCell u={u} field="m2_privative" type="num" devId={devId} onPatched={onUnitPatched} display={uu => fm2(m2priv(uu))} /> : fm2(m2priv(u))}</td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cream-2)', whiteSpace: 'nowrap' }}>{editMode ? <EditableCell u={u} field="m2_balcony" type="num" devId={devId} onPatched={onUnitPatched} display={uu => fm2(m2balc(uu))} /> : fm2(m2balc(u))}</td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cream-2)', whiteSpace: 'nowrap' }}>{editMode ? <EditableCell u={u} field="m2_terrace" type="num" devId={devId} onPatched={onUnitPatched} display={uu => fm2(m2terr(uu))} /> : fm2(m2terr(u))}</td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cream-2)', whiteSpace: 'nowrap' }}>{editMode ? <EditableCell u={u} field="m2_roof_garden" type="num" devId={devId} onPatched={onUnitPatched} display={uu => fm2(m2roof(uu))} /> : fm2(m2roof(u))}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  {editMode
                    ? <EditableCell u={u} field="m2_total" type="num" devId={devId} onPatched={onUnitPatched} display={uu => <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{fm2(m2tot(uu))}</span>} />
                    : (<>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream)' }}>{fm2(m2tot(u))}</div>
                        {totalBreakdown(u) && <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>{totalBreakdown(u)}</div>}
                      </>)}
                </td>
                {/* CARACTERÍSTICAS */}
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cream-2)', borderLeft: '1px solid rgba(var(--cream-rgb),0.06)' }}>{editMode ? <EditableCell u={u} field="bedrooms" type="num" devId={devId} onPatched={onUnitPatched} width={46} /> : (u.bedrooms ?? '—')}</td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cream-2)' }}>{editMode ? <EditableCell u={u} field="bathrooms" type="num" devId={devId} onPatched={onUnitPatched} width={46} /> : (u.bathrooms ?? '—')}</td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cream-2)' }}>{editMode ? <EditableCell u={u} field="parking_spots" type="num" devId={devId} onPatched={onUnitPatched} width={46} /> : (u.parking_spots ?? '—')}</td>
                {/* ADICIONALES (tipo cajón · bodega · vista) */}
                <ExtraCells u={u} devId={devId} onPatched={onUnitPatched} editMode={editMode} />
                {/* PRECIO */}
                <td style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--cream)', fontWeight: 700, whiteSpace: 'nowrap', borderLeft: '1px solid rgba(var(--cream-rgb),0.06)' }}>
                  {editMode
                    ? <EditableCell u={u} field="price" type="num" devId={devId} onPatched={onUnitPatched} width={110} display={uu => <span style={{ fontWeight: 700 }}>{fmtFull(uu.price)}</span>} />
                    : (priceAdjustPct > 0 ? (
                        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.15 }}>
                          <span style={{ color: 'var(--theme-3)' }}>{fmtFull(appliedPrice(u.price, priceAdjustPct))}</span>
                          <span style={{ fontSize: 10, color: 'var(--cream-3)', textDecoration: 'line-through' }}>{fmtFull(u.price)}</span>
                        </span>
                      ) : fmtFull(u.price))}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  {editMode
                    ? <EditableCell u={u} field="status" type="select" devId={devId} onPatched={onUnitPatched}
                        options={STATUS_OPTIONS} display={uu => <StatusChip status={uu.status} />} />
                    : <StatusChip status={u.status} />}
                </td>
                {/* Acciones: Cotizar + Info */}
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button
                      data-testid={`row-cotizar-${u.id}`}
                      onClick={e => { e.stopPropagation(); onOpenQuoter(u.id); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--grad)', border: 'none', color: '#fff', borderRadius: 9999, padding: '3px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      title="Cotizar esta unidad"
                    >
                      💲 Cotizar
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDrawerUnit(u); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(var(--cream-rgb),0.06)', border: '1px solid rgba(var(--cream-rgb),0.16)', color: 'var(--cream-2)', borderRadius: 9999, padding: '3px 11px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      title="Ver detalle"
                    >
                      + Info
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={17} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>
                  No hay unidades con los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ background: 'rgba(var(--cream-rgb),0.08)', color: 'var(--cream)', border: '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: page === 1 ? 'default' : 'pointer' }}>
            ← Anterior
          </button>
          <span style={{ fontSize: 12, color: 'var(--cream-2)' }}>
            Página {page} de {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ background: 'rgba(var(--cream-rgb),0.08)', color: 'var(--cream)', border: '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer' }}>
            Siguiente →
          </button>
        </div>
      )}

      {/* Drawer */}
      <EntityDrawer
        isOpen={!!drawerUnit}
        onClose={() => setDrawerUnit(null)}
        title={drawerUnit ? `Unidad ${drawerUnit.unit_number}` : ''}
        entity_type="unit_detail_b11"
        user={user}
        width={560}
        portalClassName="theme-light-scope"
        body={drawerUnit ? (
          <UnitDrawerContent
            unit={drawerUnit}
            devId={devId}
            user={user}
            onUnitUpdated={handleUnitUpdated}
          />
        ) : null}
      />
    </div>
  );
}

// ─── Por Prototipo ──────────────────────────────────────────────────────────
function PorPrototipo({ units, onFilterInventario }) {
  const protos = {};
  units.forEach(u => {
    const k = u.prototype || 'Sin prototipo';
    if (!protos[k]) protos[k] = { name: k, units: [], prices: [] };
    protos[k].units.push(u);
    if (u.price) protos[k].prices.push(u.price);
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
      {Object.values(protos).map(p => {
        const disp = p.units.filter(u => u.status === 'disponible').length;
        const minPrice = p.prices.length ? Math.min(...p.prices) : null;
        return (
          <div
            key={p.name}
            data-testid={`proto-card-${p.name}`}
            onClick={() => onFilterInventario(p.name)}
            style={{
              background: 'rgba(var(--cream-rgb),0.04)',
              border: '1px solid rgba(var(--cream-rgb),0.12)',
              borderRadius: 12, padding: 18, cursor: 'pointer',
              transition: 'border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(var(--cream-rgb),0.28)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(var(--cream-rgb),0.12)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {/* Placeholder thumbnail */}
            <div style={{
              height: 80, borderRadius: 8, marginBottom: 12,
              background: 'rgba(var(--cream-rgb),0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Building size={28} color="rgba(var(--cream-rgb),0.18)" />
            </div>

            <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
              Tipo {p.name}
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--cream-3)' }}>Total</span>
                <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{p.units.length} uds</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--cream-3)' }}>Disponibles</span>
                <span style={{ color: '#22c55e', fontWeight: 600 }}>{disp}</span>
              </div>
              {minPrice && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--cream-3)' }}>Desde</span>
                  <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{fmtMXN(minPrice)}</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--cream-3)', textAlign: 'center', opacity: 0.7 }}>
              Click para ver en inventario →
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Vista de Planta ────────────────────────────────────────────────────────
function VistaDePlanta({ units, user, devId }) {
  const [levelFilter, setLevelFilter] = useState('todos');
  const [tooltip, setTooltip] = useState(null);
  const [drawerUnit, setDrawerUnit] = useState(null);

  const levels = [...new Set(units.map(u => u.level ?? 'N/A'))].sort((a, b) => {
    if (a === 'N/A') return 1;
    if (b === 'N/A') return -1;
    return Number(a) - Number(b);
  });

  const filteredUnits = levelFilter === 'todos' ? units : units.filter(u => String(u.level) === String(levelFilter));
  const unitsByLevel = {};
  filteredUnits.forEach(u => {
    const lv = String(u.level ?? 'N/A');
    if (!unitsByLevel[lv]) unitsByLevel[lv] = [];
    unitsByLevel[lv].push(u);
  });

  return (
    <div>
      {/* Level filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--cream-3)' }}>Nivel:</span>
        {['todos', ...levels].map(lv => (
          <button
            key={lv}
            data-testid={`level-filter-${lv}`}
            onClick={() => setLevelFilter(lv)}
            style={{
              background: levelFilter === String(lv) ? 'var(--cream)' : 'rgba(var(--cream-rgb),0.06)',
              color: levelFilter === String(lv) ? 'var(--navy)' : 'var(--cream-2)',
              border: levelFilter === String(lv) ? 'none' : '1px solid rgba(var(--cream-rgb),0.1)',
              borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            }}
          >
            {lv === 'todos' ? 'Todos' : `Nivel ${lv}`}
          </button>
        ))}
      </div>

      {/* Plant grids */}
      {Object.entries(unitsByLevel).map(([lv, lvUnits]) => (
        <div key={lv} style={{ marginBottom: 20 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--cream-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Nivel {lv}
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {lvUnits.map((u, i) => {
              const cfg = STATUS_CONFIG[u.status] || STATUS_CONFIG.disponible;
              return (
                <div
                  key={u.id || i}
                  data-testid={`plant-unit-${u.unit_number}`}
                  style={{
                    width: 48, height: 40, borderRadius: 6,
                    background: cfg.bg,
                    border: `1.5px solid ${cfg.color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', position: 'relative',
                    transition: 'transform 0.1s, border-color 0.1s',
                    fontSize: 9, fontWeight: 700, color: cfg.color,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.borderColor = cfg.color;
                    setTooltip({ unit: u, x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.borderColor = `${cfg.color}40`;
                    setTooltip(null);
                  }}
                  onClick={() => setDrawerUnit(u)}
                >
                  {u.unit_number}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Color legend */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 16,
        padding: '10px 14px', background: 'rgba(var(--cream-rgb),0.04)',
        borderRadius: 8, border: '1px solid rgba(var(--cream-rgb),0.08)',
      }}>
        {STATUS_OPTIONS.map(o => { const v = STATUS_CONFIG[o.value]; return (
          <div key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: v.bg, border: `1.5px solid ${v.bd}` }} />
            <span style={{ fontSize: 11, color: 'var(--cream-2)' }}>{v.label}</span>
          </div>
        ); })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 8,
          background: 'rgba(var(--bg-rgb),0.95)', border: '1px solid rgba(var(--cream-rgb),0.18)',
          borderRadius: 8, padding: '8px 12px', zIndex: Z.MODAL_CRITICAL, pointerEvents: 'none',
          backdropFilter: 'blur(8px)', minWidth: 140,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>Unidad {tooltip.unit.unit_number}</div>
          <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>{fmtMXN(tooltip.unit.price)}</div>
          <div style={{ fontSize: 11, marginTop: 2 }}>
            <StatusChip status={tooltip.unit.status} />
          </div>
        </div>
      )}

      {/* Drawer */}
      <EntityDrawer
        isOpen={!!drawerUnit}
        onClose={() => setDrawerUnit(null)}
        title={drawerUnit ? `Unidad ${drawerUnit.unit_number}` : ''}
        entity_type="unit_detail_b11"
        user={user}
        width={560}
        portalClassName="theme-light-scope"
        body={drawerUnit ? (
          <UnitDrawerContent
            unit={drawerUnit}
            devId={devId}
            user={user}
            onUnitUpdated={() => window.dispatchEvent(new CustomEvent('dmx:unit-updated', { detail: { devId } }))}
          />
        ) : null}
      />
    </div>
  );
}

// ─── Main VentasTab ─────────────────────────────────────────────────────────
export default function VentasTab({ devId, user, onBulkUpload }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [protoFilter, setProtoFilter] = useState(null);
  const [schemes, setSchemes] = useState([]);
  const [selScheme, setSelScheme] = useState('lista');
  const [quoterOpen, setQuoterOpen] = useState(false);
  const [quoterScope, setQuoterScope] = useState('proyecto');
  const [quoterUnitId, setQuoterUnitId] = useState(null);
  const openQuoter = (unitId) => {
    setQuoterUnitId(unitId || null);
    setQuoterScope(unitId ? 'unidad' : 'proyecto');
    setQuoterOpen(true);
  };

  const activeSubTab = searchParams.get('subtab') || 'inventario';

  useEffect(() => {
    getPaymentSchemes(devId).then(d => setSchemes(d.schemes || [])).catch(() => setSchemes([]));
  }, [devId]);

  const activeDescuento = (selScheme === 'lista' || selScheme === 'cotizador')
    ? 0 : (schemes.find(s => s.id === selScheme)?.descuento_pct || 0);

  const setSubTab = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('subtab', key);
    // Clean proto filter on tab change
    if (key !== 'inventario') next.delete('status_filter');
    setSearchParams(next, { replace: true });
    setProtoFilter(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listInventory(devId);
      const dev = Array.isArray(data) ? data.find(d => d.id === devId) || data[0] : data;
      setUnits(dev?.units || []);
    } catch (e) {
      console.error('VentasTab load error:', e);
    } finally {
      setLoading(false);
    }
  }, [devId]);

  useEffect(() => { load(); }, [load]);

  // Edición optimista de los "Adicionales" sin recargar toda la tabla.
  const applyUnitPatch = useCallback((unitId, fields) => {
    setUnits(prev => prev.map(u => (u.id === unitId ? { ...u, ...fields } : u)));
  }, []);

  const handleFilterInventario = (protoName) => {
    setProtoFilter(protoName);
    const next = new URLSearchParams(searchParams);
    next.set('subtab', 'inventario');
    setSearchParams(next, { replace: true });
  };

  const filteredUnits = protoFilter
    ? units.filter(u => u.prototype === protoFilter)
    : units;

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 20,
        border: '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 10, overflow: 'hidden',
      }}>
        {SUB_TABS.map(st => {
          const on = activeSubTab === st.key;
          return (
            <button
              key={st.key}
              data-testid={`subtab-${st.key}`}
              onClick={() => setSubTab(st.key)}
              style={{
                flex: 1, padding: '9px 14px',
                background: on ? 'var(--grad)' : 'transparent',
                color: on ? '#fff' : 'var(--cream-3)',
                border: 'none', borderRight: '1px solid rgba(var(--cream-rgb),0.1)',
                fontSize: 12, fontWeight: on ? 700 : 500,
                cursor: 'pointer', transition: 'all 0.14s', fontFamily: 'DM Sans,sans-serif',
                boxShadow: on ? 'inset 0 -2px 0 rgba(255,255,255,0.25)' : 'none',
              }}
              onMouseEnter={e => { if (!on) { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.10)'; e.currentTarget.style.color = 'var(--cream)'; } }}
              onMouseLeave={e => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--cream-3)'; } }}
            >
              {titleCase(st.label)}
            </button>
          );
        })}
      </div>

      {/* Proto filter active badge */}
      {protoFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--cream-2)' }}>
            Filtrado por prototipo: <strong>{protoFilter}</strong>
          </span>
          <button onClick={() => setProtoFilter(null)} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', fontSize: 11 }}>
            × Limpiar filtro
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--cream-3)', fontSize: 13 }}>Cargando unidades…</div>
      ) : (
        <>
          {activeSubTab === 'inventario' && (
            <InventarioCompleto units={filteredUnits} devId={devId} user={user} onBulkUpload={onBulkUpload} onUnitPatched={applyUnitPatch} priceAdjustPct={activeDescuento}
              schemes={schemes} selScheme={selScheme} setSelScheme={setSelScheme} onOpenQuoter={openQuoter} />
          )}
          {activeSubTab === 'prototipos' && (
            <PorPrototipo units={units} onFilterInventario={handleFilterInventario} />
          )}
          {activeSubTab === 'planta' && (
            <VistaPlantaInteractiva units={units} user={user} devId={devId} />
          )}
        </>
      )}

      {quoterOpen && (
        <PaymentQuoter devId={devId} schemes={schemes} units={units}
          initialScope={quoterScope} initialUnitId={quoterUnitId}
          onSchemesSaved={() => getPaymentSchemes(devId).then(d => setSchemes(d.schemes || [])).catch(() => {})}
          onClose={() => setQuoterOpen(false)} />
      )}
    </div>
  );
}

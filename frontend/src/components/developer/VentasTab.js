/**
 * Phase 4 Batch 10 — Sub-chunk C
 * VentasTab — 3 sub-tabs: Inventario completo | Por prototipo | Vista de planta
 * URL sync: ?subtab=inventario|prototipos|planta
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FilterChipsBar } from '../shared/FilterChipsBar';
import FilterPresetsBar from '../shared/FilterPresetsBar';
import { EntityDrawer } from '../shared/EntityDrawer';
import UnitDrawerContent from './UnitDrawerContent';
import usePreferences from '../../hooks/usePreferences';
import { listInventory } from '../../api/developer';
import { Search, Upload, Eye, Building, Bed, Ruler } from '../../components/icons';

const STATUS_CONFIG = {
  disponible:  { label: 'Disponible',  color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  apartado:    { label: 'Apartado',    color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  reservado:   { label: 'Reservado',   color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  vendido:     { label: 'Vendido',     color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  bloqueado:   { label: 'Bloqueado',   color: 'rgba(240,235,224,0.3)', bg: 'rgba(240,235,224,0.06)' },
};

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
      background: cfg.bg, color: cfg.color,
      fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 10, letterSpacing: '0.03em',
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Inventario Completo ────────────────────────────────────────────────────
function InventarioCompleto({ units, devId, user, onBulkUpload }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [drawerUnit, setDrawerUnit] = useState(null);
  const { pref, setPref } = usePreferences();
  const density_mode = pref('density_mode', 'compacto');
  const [searchParams, setSearchParams] = useSearchParams();

  // Sync status filter to URL
  useEffect(() => {
    const urlStatus = searchParams.get('status_filter');
    if (urlStatus && urlStatus !== statusFilter) setStatusFilter(urlStatus);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Filter
  const filtered = units.filter(u => {
    const matchSearch = !search || u.unit_number?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || u.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const rowHeight = density_mode === 'compacto' ? 40 : 56;

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
              width: '100%', background: 'rgba(240,235,224,0.06)',
              border: '1px solid rgba(240,235,224,0.14)', borderRadius: 8,
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
            background: 'rgba(240,235,224,0.08)', color: 'var(--cream)',
            border: '1px solid rgba(240,235,224,0.16)', borderRadius: 8,
            padding: '6px 12px', fontSize: 12, cursor: 'pointer',
          }}
        >
          <Upload size={13} /> Bulk Upload
        </button>

        {/* Density */}
        <div style={{ display: 'flex', background: 'rgba(240,235,224,0.06)', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(240,235,224,0.1)' }}>
          {['compacto', 'expandido'].map(m => (
            <button
              key={m}
              data-testid={`density-${m}`}
              onClick={() => setPref('density_mode', m)}
              style={{
                background: density_mode === m ? 'rgba(240,235,224,0.14)' : 'transparent',
                color: density_mode === m ? 'var(--cream)' : 'var(--cream-3)',
                border: 'none', padding: '5px 10px', fontSize: 11, cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {m === 'compacto' ? 'Compacto' : 'Expandido'}
            </button>
          ))}
        </div>

        <span style={{ fontSize: 12, color: 'var(--cream-3)', marginLeft: 'auto' }}>
          {filtered.length > PAGE_SIZE
            ? `Mostrando ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} de ${filtered.length}`
            : `${filtered.length} unidades`}
        </span>
      </div>

      {/* Status filter chips */}
      <FilterChipsBar
        filters_config={[{
          key: 'status',
          label: 'Estado',
          options: Object.entries(STATUS_CONFIG).map(([k, v]) => ({
            value: k, label: v.label, count: counts[k] || 0,
          })),
        }]}
        current_state={{ status: statusFilter }}
        on_change={handleFilterChange}
        sync_url={true}
      />

      {/* Batch 17 — filter presets */}
      <div style={{ marginTop: 6 }}>
        <FilterPresetsBar
          route="/desarrollador/proyectos/ventas"
          currentFilters={{ status: statusFilter }}
          onLoadPreset={(f) => handleFilterChange('status', f.status || null)}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(240,235,224,0.1)' }}>
        <table className="density-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr style={{ background: 'rgba(240,235,224,0.06)', position: 'sticky', top: 0, zIndex: 1 }}>
              {['Unidad', 'Prototipo', 'Nivel', 'm² total', 'Rec.', 'Precio', 'Estado', 'Acciones'].map(h => (
                <th key={h} style={{
                  padding: density_mode === 'compacto' ? '8px 12px' : '10px 14px',
                  textAlign: 'left', fontSize: 10, fontWeight: 600,
                  color: 'var(--cream-3)', borderBottom: '1px solid rgba(240,235,224,0.1)',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((u, i) => (
              <tr
                key={u.id || i}
                data-testid={`unit-row-${u.unit_number}`}
                style={{
                  height: rowHeight,
                  borderBottom: i < paged.length - 1 ? '1px solid rgba(240,235,224,0.06)' : 'none',
                  cursor: 'pointer', transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,235,224,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => setDrawerUnit(u)}
              >
                <td style={{ padding: '0 12px', fontSize: 13, fontWeight: 600, color: 'var(--cream)', whiteSpace: 'nowrap' }}>
                  {u.unit_number}
                </td>
                <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--cream-2)', whiteSpace: 'nowrap' }}>
                  {u.prototype}
                </td>
                <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--cream-2)' }}>
                  {u.level ?? '—'}
                </td>
                <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--cream-2)', whiteSpace: 'nowrap' }}>
                  {u.area_total ? `${u.area_total}m²` : '—'}
                </td>
                <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--cream-2)' }}>
                  {u.bedrooms ?? '—'}
                </td>
                <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--cream)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {fmtMXN(u.price)}
                </td>
                <td style={{ padding: '0 12px' }}>
                  <StatusChip status={u.status} />
                </td>
                <td style={{ padding: '0 12px' }}>
                  <button
                    onClick={e => { e.stopPropagation(); setDrawerUnit(u); }}
                    style={{ background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', padding: 4 }}
                    title="Ver detalle"
                  >
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>
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
            style={{ background: 'rgba(240,235,224,0.08)', color: 'var(--cream)', border: '1px solid rgba(240,235,224,0.12)', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: page === 1 ? 'default' : 'pointer' }}>
            ← Anterior
          </button>
          <span style={{ fontSize: 12, color: 'var(--cream-2)' }}>
            Página {page} de {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ background: 'rgba(240,235,224,0.08)', color: 'var(--cream)', border: '1px solid rgba(240,235,224,0.12)', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer' }}>
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
              background: 'rgba(240,235,224,0.04)',
              border: '1px solid rgba(240,235,224,0.12)',
              borderRadius: 12, padding: 18, cursor: 'pointer',
              transition: 'border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(240,235,224,0.28)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(240,235,224,0.12)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {/* Placeholder thumbnail */}
            <div style={{
              height: 80, borderRadius: 8, marginBottom: 12,
              background: 'rgba(240,235,224,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Building size={28} color="rgba(240,235,224,0.18)" />
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
              background: levelFilter === String(lv) ? 'var(--cream)' : 'rgba(240,235,224,0.06)',
              color: levelFilter === String(lv) ? 'var(--navy)' : 'var(--cream-2)',
              border: levelFilter === String(lv) ? 'none' : '1px solid rgba(240,235,224,0.1)',
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
        padding: '10px 14px', background: 'rgba(240,235,224,0.04)',
        borderRadius: 8, border: '1px solid rgba(240,235,224,0.08)',
      }}>
        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: v.bg, border: `1.5px solid ${v.color}` }} />
            <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>{v.label}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 8,
          background: 'rgba(6,8,15,0.95)', border: '1px solid rgba(240,235,224,0.18)',
          borderRadius: 8, padding: '8px 12px', zIndex: 9999, pointerEvents: 'none',
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

  const activeSubTab = searchParams.get('subtab') || 'inventario';

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
        border: '1px solid rgba(240,235,224,0.12)', borderRadius: 10, overflow: 'hidden',
      }}>
        {SUB_TABS.map(st => (
          <button
            key={st.key}
            data-testid={`subtab-${st.key}`}
            onClick={() => setSubTab(st.key)}
            style={{
              flex: 1, padding: '9px 14px',
              background: activeSubTab === st.key ? 'rgba(240,235,224,0.10)' : 'transparent',
              color: activeSubTab === st.key ? 'var(--cream)' : 'var(--cream-3)',
              border: 'none', borderRight: '1px solid rgba(240,235,224,0.1)',
              fontSize: 12, fontWeight: activeSubTab === st.key ? 700 : 400,
              cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'DM Sans,sans-serif',
            }}
          >
            {st.label}
          </button>
        ))}
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
            <InventarioCompleto units={filteredUnits} devId={devId} user={user} onBulkUpload={onBulkUpload} />
          )}
          {activeSubTab === 'prototipos' && (
            <PorPrototipo units={units} onFilterInventario={handleFilterInventario} />
          )}
          {activeSubTab === 'planta' && (
            <VistaDePlanta units={units} user={user} devId={devId} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * AuditLogPage — Phase F0.1
 * /superadmin/audit-log
 * Filtros: date range + entity_type + actor + action + paginación
 * Drawer: before/after JSON diff con highlighting
 */
import React, { useState, useEffect, useCallback } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { fetchAuditLog, fetchAuditStats } from '../../api/audit';
import { RefreshCw, ClipboardList, ChevronLeft, ChevronRight, X, Shield } from '../../components/icons';

const ENTITY_TYPES = ['operacion', 'contacto', 'unit', 'document', 'sync_overlay', 'proyecto', 'role'];
const ACTIONS = ['create', 'update', 'delete', 'revert'];

const ACTION_STYLE = {
  create:  { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e', label: 'CREAR' },
  update:  { bg: 'rgba(99,102,241,0.12)', color: '#6366F1', label: 'EDITAR' },
  delete:  { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', label: 'ELIMINAR' },
  revert:  { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'REVERTIR' },
};

const ROLE_STYLE = {
  superadmin:      { color: '#EC4899' },
  developer_admin: { color: '#6366F1' },
  advisor:         { color: '#22c55e' },
  asesor_admin:    { color: '#f59e0b' },
  buyer:           { color: '#94a3b8' },
};

function fmtTs(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

function ActionBadge({ action }) {
  const s = ACTION_STYLE[action] || { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: action };
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}33`, borderRadius: 6, padding: '2px 8px', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {s.label}
    </span>
  );
}

function RoleBadge({ role }) {
  const s = ROLE_STYLE[role] || { color: '#94a3b8' };
  return (
    <span style={{ color: s.color, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {role}
    </span>
  );
}

function DiffDrawer({ entry, onClose }) {
  if (!entry) return null;

  const renderJson = (obj, isAfter) => {
    if (!obj) return <span style={{ color: 'var(--cream-4)', fontStyle: 'italic' }}>vacío</span>;
    const diffKeys = entry.diff_keys || [];
    return (
      <pre style={{ margin: 0, fontFamily: 'DM Mono, monospace', fontSize: 11.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {JSON.stringify(obj, null, 2).split('\n').map((line, i) => {
          const keyMatch = line.match(/^\s+"([^"]+)":/);
          const key = keyMatch ? keyMatch[1] : null;
          const isChanged = key && diffKeys.includes(key);
          return (
            <span key={i} style={{
              display: 'block',
              background: isChanged ? (isAfter ? 'rgba(34,197,94,0.09)' : 'rgba(239,68,68,0.09)') : 'transparent',
              borderLeft: isChanged ? `2px solid ${isAfter ? '#22c55e' : '#ef4444'}` : '2px solid transparent',
              paddingLeft: isChanged ? 6 : 8,
              color: isChanged ? (isAfter ? '#86efac' : '#fca5a5') : 'var(--cream-3)',
            }}>
              {line}
            </span>
          );
        })}
      </pre>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(6,8,15,0.65)' }} />
      <div data-testid="audit-diff-drawer" style={{
        position: 'relative', zIndex: 1, width: 600, maxWidth: '100vw',
        background: '#0D1118', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        padding: 28, gap: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', letterSpacing: '-0.01em' }}>
              Detalle de mutación
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 3 }}>
              {entry.entity_type} · {entry.entity_id || '—'} · <ActionBadge action={entry.action} />
            </div>
          </div>
          <button onClick={onClose} data-testid="drawer-close-btn" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            ['Actor', entry.actor?.name || entry.actor?.user_id || '—'],
            ['Rol', <RoleBadge key="role" role={entry.actor?.role} />],
            ['Tenant', entry.actor?.tenant_id || '—'],
            ['Fecha', fmtTs(entry.ts)],
            ['IP', entry.ip || '—'],
            ['Ruta', entry.route || '—'],
          ].map(([label, val]) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Diff keys */}
        {entry.diff_keys?.length > 0 && (
          <div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Campos modificados</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {entry.diff_keys.map(k => (
                <span key={k} style={{ background: 'rgba(99,102,241,0.13)', color: '#a5b4fc', borderRadius: 5, padding: '2px 9px', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Before / After diff */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Antes</div>
            <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.14)', borderRadius: 8, padding: '10px 12px', minHeight: 60 }}>
              {renderJson(entry.before, false)}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#86efac', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Después</div>
            <div style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.14)', borderRadius: 8, padding: '10px 12px', minHeight: 60 }}>
              {renderJson(entry.after, true)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuditLogPage({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  // Filters
  const [filters, setFilters] = useState({ entity_type: '', action: '', actor_user_id: '', from: '', to: '' });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLog({ ...filters, page, limit: 25 });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchAuditStats().then(setStats).catch(() => {});
  }, []);

  function handleFilter(k, v) {
    setFilters(f => ({ ...f, [k]: v }));
    setPage(1);
  }

  function clearFilters() {
    setFilters({ entity_type: '', action: '', actor_user_id: '', from: '', to: '' });
    setPage(1);
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ClipboardList size={17} color="#fff" />
            </div>
            <div>
              <h1 data-testid="audit-log-h1" style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em', margin: 0 }}>
                Audit Log
              </h1>
              <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', margin: 0, marginTop: 2 }}>
                Trazabilidad global de mutaciones de datos
              </p>
            </div>
          </div>
          <button onClick={load} data-testid="audit-refresh-btn" disabled={loading} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px',
            background: 'rgba(99,102,241,0.13)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)',
            opacity: loading ? 0.6 : 1,
          }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar
          </button>
        </div>

        {/* Stats strip */}
        {stats && (
          <div data-testid="audit-stats-strip" style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
            <StatCard label="Eventos 24h" value={stats.total_24h} color="#6366F1" />
            {Object.entries(stats.by_action || {}).map(([a, c]) => (
              <StatCard key={a} label={ACTION_STYLE[a]?.label || a} value={c} color={ACTION_STYLE[a]?.color || '#94a3b8'} />
            ))}
          </div>
        )}

        {/* Filters */}
        <div data-testid="audit-filters" style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 18,
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <select data-testid="filter-entity-type" value={filters.entity_type} onChange={e => handleFilter('entity_type', e.target.value)}
            style={selectStyle}>
            <option value="">Todos los tipos</option>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select data-testid="filter-action" value={filters.action} onChange={e => handleFilter('action', e.target.value)}
            style={selectStyle}>
            <option value="">Toda acción</option>
            {ACTIONS.map(a => <option key={a} value={a}>{ACTION_STYLE[a]?.label || a}</option>)}
          </select>
          <input data-testid="filter-actor-id" type="text" placeholder="ID de actor…" value={filters.actor_user_id}
            onChange={e => handleFilter('actor_user_id', e.target.value)}
            style={{ ...selectStyle, width: 190 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)' }}>Desde</label>
            <input data-testid="filter-from" type="date" value={filters.from} onChange={e => handleFilter('from', e.target.value ? e.target.value + 'T00:00:00Z' : '')}
              style={selectStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)' }}>Hasta</label>
            <input data-testid="filter-to" type="date" value={filters.to} onChange={e => handleFilter('to', e.target.value ? e.target.value + 'T23:59:59Z' : '')}
              style={selectStyle} />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} data-testid="clear-filters-btn" style={{ ...selectStyle, background: 'rgba(239,68,68,0.09)', borderColor: 'rgba(239,68,68,0.25)', color: '#f87171', cursor: 'pointer' }}>
              Limpiar filtros
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-4)' }}>
            {total} registro{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div data-testid="audit-log-table" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Fecha', 'Actor', 'Rol', 'Acción', 'Entidad', 'Campos', 'IP'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ padding: '28px 16px', textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
                  Cargando...
                </td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <Shield size={28} color="var(--cream-4)" />
                    <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)' }}>No hay registros de auditoría</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-4)' }}>
                      Los eventos aparecen después de las primeras mutaciones
                    </div>
                  </div>
                </td></tr>
              )}
              {!loading && items.map((item, i) => (
                <tr key={item.id || i}
                  data-testid={`audit-row-${i}`}
                  onClick={() => setSelected(item)}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={tdStyle}>{fmtTs(item.ts)}</td>
                  <td style={tdStyle}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', fontWeight: 500 }}>{item.actor?.name || '—'}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-4)' }}>{item.actor?.user_id?.slice(0, 14) || ''}</div>
                  </td>
                  <td style={tdStyle}><RoleBadge role={item.actor?.role} /></td>
                  <td style={tdStyle}><ActionBadge action={item.action} /></td>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: '#a5b4fc' }}>{item.entity_type}</span>
                    {item.entity_id && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-4)', marginTop: 2 }}>{item.entity_id.slice(0, 18)}</div>}
                  </td>
                  <td style={tdStyle}>
                    {(item.diff_keys || []).slice(0, 3).map(k => (
                      <span key={k} style={{ display: 'inline-block', marginRight: 4, background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', borderRadius: 4, padding: '1px 6px', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>{k}</span>
                    ))}
                    {(item.diff_keys || []).length > 3 && <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-4)' }}>+{item.diff_keys.length - 3}</span>}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-4)' }}>{item.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div data-testid="audit-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 18 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={pageBtnStyle(page <= 1)}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
              Página {page} de {pages}
            </span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} style={pageBtnStyle(page >= pages)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {selected && <DiffDrawer entry={selected} onClose={() => setSelected(null)} />}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </SuperadminLayout>
  );
}

// ─── Sub-components & styles ──────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}28`, borderRadius: 10, padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color, letterSpacing: '-0.03em' }}>{value}</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
    </div>
  );
}

const selectStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '6px 11px', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12.5,
  outline: 'none', cursor: 'pointer',
};

const tdStyle = {
  padding: '11px 16px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', verticalAlign: 'middle',
};

const pageBtnStyle = (disabled) => ({
  background: disabled ? 'transparent' : 'rgba(99,102,241,0.1)',
  border: '1px solid rgba(99,102,241,0.25)',
  borderRadius: 8, padding: '6px 10px', cursor: disabled ? 'default' : 'pointer',
  color: disabled ? 'var(--cream-4)' : '#a5b4fc', opacity: disabled ? 0.4 : 1,
  display: 'inline-flex', alignItems: 'center',
});

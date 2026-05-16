// W2.2 SA3 — Superadmin Audit Log Viewer
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import AuditEntryDrawer from '../../components/superadmin/AuditEntryDrawer';
import {
  Shield, Activity, AlertOctagon, Edit3, Eye, RefreshCw, Download, Filter,
  Search, ChevronDown, X,
} from 'lucide-react';
import {
  listEntries, distinctActors, distinctEntityTypes, getStats, exportUrl,
} from '../../api/superadminAudit';
import { Z } from '../../styles/zIndex';

const PAGE = 50;

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return `hace ${sec}s`;
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

function KpiCard({ Icon, label, value, accent }) {
  return (
    <div style={{ flex: '1 1 200px', padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <Icon size={11} color={accent} />
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: accent || 'var(--cream)' }}>{value}</div>
    </div>
  );
}

const SEVERITY_CFG = {
  critical: { color: '#F87171', bg: 'rgba(239,68,68,0.12)' },
  warning:  { color: '#FACC15', bg: 'rgba(250,204,21,0.12)' },
  info:     { color: 'var(--theme)', bg: 'rgba(var(--theme-rgb),0.12)' },
};

function SeverityPill({ severity }) {
  const cfg = SEVERITY_CFG[severity] || SEVERITY_CFG.info;
  return (
    <span style={{
      padding: '1px 8px', borderRadius: 9999, fontSize: 9.5,
      background: cfg.bg, color: cfg.color, fontFamily: 'DM Sans', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>{severity || 'info'}</span>
  );
}

function ExportModal({ filters, currentTotal, onClose }) {
  const [format, setFormat] = useState('csv');

  const blocked = currentTotal > 10000;

  const download = () => {
    const url = process.env.REACT_APP_BACKEND_URL + '/api/superadmin/audit/export?format=' + format;
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([k, v]) => { if (v != null && v !== '' && v !== 'all') params.set(k, v); });
    const finalUrl = `${url}&${params.toString()}`;
    // Trigger download — backend uses cookie auth; simple anchor click
    const a = document.createElement('a');
    a.href = finalUrl;
    a.rel = 'noopener';
    a.click();
    onClose();
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div data-testid="export-modal" style={{
        width: '100%', maxWidth: 460, background: 'rgba(13,17,28,0.97)',
        border: '1px solid rgba(var(--theme-rgb),0.30)', borderRadius: 14,
        padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Download size={14} color="var(--theme)" />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0, flex: 1 }}>
            Exportar registros
          </h3>
          <button onClick={onClose} style={{ padding: 5, borderRadius: 9999, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.55)' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['csv', 'CSV'], ['json', 'JSON']].map(([k, l]) => (
            <button key={k} onClick={() => setFormat(k)} data-testid={`export-format-${k}`}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 9999,
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
                border: format === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.10)',
                background: format === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
                color: format === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
              }}>{l}</button>
          ))}
        </div>
        <div style={{
          padding: '11px 14px', borderRadius: 10,
          background: blocked ? 'rgba(239,68,68,0.08)' : 'rgba(var(--theme-rgb),0.06)',
          border: `1px solid ${blocked ? 'rgba(239,68,68,0.30)' : 'rgba(var(--theme-rgb),0.22)'}`,
        }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: blocked ? '#F87171' : 'rgba(240,235,224,0.65)' }}>
            {blocked
              ? `${currentTotal} registros excede el máximo de 10,000. Filtra más estrictamente antes de exportar.`
              : `${currentTotal} registros serán exportados con los filtros actuales.`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button data-testid="export-confirm" onClick={download} disabled={blocked}
            style={{ padding: '8px 18px', borderRadius: 9999, background: blocked ? 'rgba(239,68,68,0.20)' : 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: blocked ? '#F87171' : '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: blocked ? 'not-allowed' : 'pointer' }}>
            Descargar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuperadminAuditLog({ user, onLogout }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawerId, setDrawerId] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [actors, setActors] = useState([]);
  const [entityTypesList, setEntityTypesList] = useState([]);
  const [toast, setToast] = useState('');

  const [filters, setFilters] = useState(() => ({
    severity: searchParams.get('severity') || 'all',
    action: searchParams.get('action') || 'all',
    q: searchParams.get('q') || '',
    actor_user_id: searchParams.get('actor_user_id') || '',
    entity_type: searchParams.get('entity_type') || '',
    entity_id: searchParams.get('entity_id') || '',
    tenant_id: searchParams.get('tenant_id') || '',
    from_ts: searchParams.get('from_ts') || '',
    to_ts: searchParams.get('to_ts') || '',
  }));

  const debounceRef = useRef();

  const buildQuery = useCallback((extra = {}) => {
    const out = {};
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'all') out[k] = v; });
    return { ...out, ...extra };
  }, [filters]);

  const load = useCallback(async (resetSkip = true) => {
    setLoading(true);
    try {
      const newSkip = resetSkip ? 0 : skip;
      const r = await listEntries({ ...buildQuery(), limit: PAGE, skip: newSkip });
      if (resetSkip) {
        setItems(r.items || []);
        setSkip(0);
      } else {
        setItems(prev => [...prev, ...(r.items || [])]);
      }
      setTotal(r.total || 0);
    } catch (e) { setToast(e.message || 'Error'); }
    finally { setLoading(false); }
  }, [buildQuery, skip]);

  // Reload when filters change (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { load(true); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line
  }, [filters.severity, filters.action, filters.q, filters.actor_user_id,
      filters.entity_type, filters.entity_id, filters.tenant_id,
      filters.from_ts, filters.to_ts]);

  // Sync filters → URL
  useEffect(() => {
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'all') next.set(k, v); });
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line
  }, [filters]);

  // Initial load + stats + autocomplete
  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    distinctActors().then(r => setActors(r.items || [])).catch(() => {});
    distinctEntityTypes().then(r => setEntityTypesList(r.items || [])).catch(() => {});
  }, []);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); } }, [toast]);

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const clearAll = () => setFilters({
    severity: 'all', action: 'all', q: '', actor_user_id: '',
    entity_type: '', entity_id: '', tenant_id: '', from_ts: '', to_ts: '',
  });

  const loadMore = async () => {
    const newSkip = skip + PAGE;
    setSkip(newSkip);
    setLoading(true);
    try {
      const r = await listEntries({ ...buildQuery(), limit: PAGE, skip: newSkip });
      setItems(prev => [...prev, ...(r.items || [])]);
    } catch (e) { setToast(e.message || 'Error'); }
    finally { setLoading(false); }
  };

  const SEVERITY_CHIPS = [['all', 'Todos'], ['critical', 'Critical'], ['warning', 'Warning'], ['info', 'Info']];
  const ACTION_CHIPS = [['all', 'Todas'], ['mutations', 'Solo mutaciones']];

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && v !== 'all').length;

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-audit-log">
        {toast && (
          <div data-testid="audit-toast" style={{ position: 'fixed', top: 76, right: 20, zIndex: Z.TOAST, padding: '11px 18px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.35)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>
            {toast}
          </div>
        )}

        <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Shield size={20} color="var(--theme)" />
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
                Auditoría
              </h1>
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240, 235, 224, 0.72)', margin: 0 }}>
              Timeline ejecutivo cross-org · drill-down before/after · export legal/compliance.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button data-testid="audit-refresh" onClick={() => load(true)} disabled={loading}
              style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: loading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refrescar
            </button>
            <button data-testid="audit-export-btn" onClick={() => setShowExport(true)}
              style={{ padding: '8px 16px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Download size={11} /> Exportar
            </button>
          </div>
        </div>

        {/* KPIs */}
        {stats && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
            <KpiCard Icon={Activity} label="Total 24h" value={stats.total_24h} accent="var(--theme)" />
            <KpiCard Icon={AlertOctagon} label="Critical" value={stats.critical_24h} accent={stats.critical_24h > 0 ? '#F87171' : 'rgba(240,235,224,0.55)'} />
            <KpiCard Icon={Edit3} label="Mutations" value={stats.mutations_24h} accent="#FACC15" />
            <KpiCard Icon={Eye} label="Reads" value={stats.reads_24h} accent="#4ADE80" />
          </div>
        )}

        {/* Filters row 1 — severity + action */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 4 }}>Severidad</span>
          {SEVERITY_CHIPS.map(([k, l]) => (
            <button key={k} data-testid={`sev-chip-${k}`} onClick={() => setFilter('severity', k)}
              style={{ padding: '5px 12px', borderRadius: 9999, fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: filters.severity === k ? '1px solid rgba(var(--theme-rgb),0.45)' : '1px solid rgba(255,255,255,0.08)', background: filters.severity === k ? 'rgba(var(--theme-rgb),0.10)' : 'transparent', color: filters.severity === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)' }}>
              {l}
            </button>
          ))}
          <span style={{ marginLeft: 12, fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 4 }}>Acción</span>
          {ACTION_CHIPS.map(([k, l]) => (
            <button key={k} data-testid={`act-chip-${k}`} onClick={() => setFilter('action', k)}
              style={{ padding: '5px 12px', borderRadius: 9999, fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: filters.action === k ? '1px solid rgba(var(--theme-rgb),0.45)' : '1px solid rgba(255,255,255,0.08)', background: filters.action === k ? 'rgba(var(--theme-rgb),0.10)' : 'transparent', color: filters.action === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Search + advanced toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 280px' }}>
            <Search size={12} color="rgba(240, 235, 224, 0.68)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input data-testid="audit-search" value={filters.q} onChange={e => setFilter('q', e.target.value)}
              placeholder="Buscar en action / entity_type / entity_id…"
              style={{ width: '100%', padding: '8px 13px 8px 34px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none' }} />
          </div>
          <button data-testid="audit-advanced-toggle" onClick={() => setShowAdvanced(s => !s)}
            style={{ padding: '8px 14px', borderRadius: 9999, background: showAdvanced ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Filter size={11} /> Más filtros{activeFilterCount > 0 && ` (${activeFilterCount})`}
            <ChevronDown size={10} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 180ms' }} />
          </button>
          {activeFilterCount > 0 && (
            <button data-testid="audit-clear-filters" onClick={clearAll}
              style={{ padding: '6px 12px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(239,68,68,0.30)', color: '#F87171', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <X size={11} /> Limpiar
            </button>
          )}
        </div>

        {showAdvanced && (
          <div data-testid="audit-advanced-panel" style={{
            padding: '14px 16px', borderRadius: 12, marginBottom: 14,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(var(--theme-rgb),0.20)',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10,
          }}>
            <AutocompleteField label="Actor" value={filters.actor_user_id}
              options={actors.map(a => ({ value: a.user_id, label: `${a.user_id} (${a.role || '—'}) · ${a.count}` }))}
              onChange={v => setFilter('actor_user_id', v)} testId="filter-actor" />
            <AutocompleteField label="Entity type" value={filters.entity_type}
              options={entityTypesList.map(t => ({ value: t.entity_type, label: `${t.entity_type} · ${t.count}` }))}
              onChange={v => setFilter('entity_type', v)} testId="filter-entity-type" />
            <TextField label="Entity ID" value={filters.entity_id}
              onChange={v => setFilter('entity_id', v)} testId="filter-entity-id" mono />
            <TextField label="Tenant" value={filters.tenant_id}
              onChange={v => setFilter('tenant_id', v)} testId="filter-tenant" mono />
            <DateField label="Desde" value={filters.from_ts}
              onChange={v => setFilter('from_ts', v)} testId="filter-from" />
            <DateField label="Hasta" value={filters.to_ts}
              onChange={v => setFilter('to_ts', v)} testId="filter-to" />
          </div>
        )}

        {/* Results count */}
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240, 235, 224, 0.72)', marginBottom: 10 }}>
          {total} {total === 1 ? 'registro' : 'registros'} · mostrando {items.length}
        </div>

        {/* List */}
        {loading && items.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans' }}>
            Cargando registros…
          </div>
        ) : items.length === 0 ? (
          <div data-testid="audit-empty" style={{ padding: 50, textAlign: 'center', borderRadius: 14, background: 'rgba(240,235,224,0.03)', border: '1px dashed rgba(240,235,224,0.14)', fontFamily: 'DM Sans' }}>
            <Shield size={32} color="rgba(240,235,224,0.18)" style={{ marginBottom: 8 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>
              Sin registros que coincidan
            </div>
            <div style={{ fontSize: 12, color: 'rgba(240, 235, 224, 0.72)' }}>Ajusta los filtros o limpia para ver más.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {items.map(it => (
              <div key={it.id} data-testid={`audit-row-${it.id}`}
                onClick={() => setDrawerId(it.id)}
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  cursor: 'pointer',
                  transition: 'background 180ms, transform 180ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span title={it.ts} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', minWidth: 70 }}>
                    {fmtRel(it.ts)}
                  </span>
                  <SeverityPill severity={it.severity || 'info'} />
                  <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700, background: 'rgba(var(--theme-rgb),0.10)', color: 'var(--theme)', border: '1px solid rgba(var(--theme-rgb),0.22)' }}>
                    {it.action}
                  </span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream)' }}>
                    {it.entity_type}
                  </span>
                  {it.entity_id && (
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                      {it.entity_id}
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 120, fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.72)', textAlign: 'right' }}>
                    {it.actor?.user_id || '—'} <span style={{ opacity: 0.6 }}>· {it.actor?.role || '—'}</span>
                  </div>
                </div>
                {(it.diff_keys || []).length > 0 && (
                  <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {it.diff_keys.slice(0, 6).map(k => (
                      <span key={k} style={{ padding: '1px 6px', borderRadius: 9999, fontSize: 9.5, fontFamily: 'DM Mono, monospace', background: 'rgba(250,204,21,0.08)', color: '#FACC15' }}>{k}</span>
                    ))}
                    {it.diff_keys.length > 6 && (
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240, 235, 224, 0.70)' }}>+{it.diff_keys.length - 6} más</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Load more */}
        {items.length < total && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button data-testid="audit-load-more" onClick={loadMore} disabled={loading}
              style={{ padding: '8px 22px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Cargando…' : `Cargar más (${total - items.length} restantes)`}
            </button>
          </div>
        )}
      </div>

      <AuditEntryDrawer entryId={drawerId} onClose={() => setDrawerId(null)} />
      {showExport && <ExportModal filters={buildQuery()} currentTotal={total} onClose={() => setShowExport(false)} />}
    </SuperadminLayout>
  );
}

// ─── Form helpers ──────────────────────────────────────────────────────────────
function FieldShell({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      {children}
    </label>
  );
}

function TextField({ label, value, onChange, testId, mono }) {
  return (
    <FieldShell label={label}>
      <input data-testid={testId} value={value || ''} onChange={e => onChange(e.target.value)}
        placeholder={label}
        style={{ padding: '7px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans', fontSize: 11.5, outline: 'none' }} />
    </FieldShell>
  );
}

function DateField({ label, value, onChange, testId }) {
  // Stored as ISO Z (yyyy-mm-ddT00:00:00Z); UI displays date only.
  const dateOnly = (value || '').slice(0, 10);
  const onDateChange = (v) => onChange(v ? `${v}T00:00:00Z` : '');
  return (
    <FieldShell label={label}>
      <input type="date" data-testid={testId} value={dateOnly} onChange={e => onDateChange(e.target.value)}
        style={{ padding: '7px 11px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 11.5, outline: 'none' }} />
    </FieldShell>
  );
}

function AutocompleteField({ label, value, options, onChange, testId }) {
  const [focus, setFocus] = useState(false);
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  const filtered = (options || []).filter(o => !draft || o.value.toLowerCase().includes(draft.toLowerCase()) || o.label.toLowerCase().includes(draft.toLowerCase())).slice(0, 8);
  return (
    <FieldShell label={label}>
      <div style={{ position: 'relative' }}>
        <input data-testid={testId} value={draft} onChange={e => { setDraft(e.target.value); onChange(e.target.value); }}
          onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
          placeholder={`Buscar ${label.toLowerCase()}…`}
          style={{ width: '100%', padding: '7px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 11.5, outline: 'none' }} />
        {focus && filtered.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, padding: 4, borderRadius: 10, background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(var(--theme-rgb),0.30)', maxHeight: 220, overflowY: 'auto', zIndex: Z.DROPDOWN }}>
            {filtered.map(o => (
              <button key={o.value} onClick={() => { setDraft(o.value); onChange(o.value); }}
                data-testid={`${testId}-opt-${o.value}`}
                style={{ display: 'block', width: '100%', padding: '6px 10px', borderRadius: 7, background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 11 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >{o.label}</button>
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
}

// W5.FF3 · SuperadminFeatureVisibility — UI Matrix
// Ruta: /superadmin/feature-visibility · superadmin only · sección Operación (naranja).
// Cero hex hardcoded · usa var(--theme*) / var(--cream*) / var(--border).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Toast } from '../../components/advisor/primitives';
import { RefreshCw, Search, Layers, Filter, FlaskConical, Upload } from 'lucide-react';
import FeatureMatrixGrid from '../../components/superadmin/FeatureMatrixGrid';
import FeatureTemplateModal from '../../components/superadmin/FeatureTemplateModal';
import PlansPanel from '../../components/superadmin/PlansPanel';
import ABExperimentsModal from '../../components/superadmin/ABExperimentsModal';
import {
  fetchCatalog,
  fetchUsersWithFeatures,
  grantFeature,
  applyTemplate,
  fetchUsage,
  uploadBulkCSV,
} from '../../api/feature_visibility';

const ROLE_FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'developer_admin', label: 'Dev admin' },
  { key: 'developer_member', label: 'Dev member' },
  { key: 'inmobiliaria_admin', label: 'Inmob admin' },
  { key: 'inmobiliaria_member', label: 'Inmob member' },
  { key: 'advisor', label: 'Advisor' },
  { key: 'buyer', label: 'Buyer' },
];

const TIER_FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'free', label: 'Free' },
  { key: 'pro', label: 'Pro' },
  { key: 'enterprise', label: 'Enterprise' },
];

const PAGE_SIZE = 50;

function pill(active) {
  return {
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'DM Sans',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? 'rgba(var(--theme-rgb), 0.22)' : 'rgba(255,255,255,0.04)',
    border: active ? '1px solid rgba(var(--theme-rgb), 0.45)' : '1px solid var(--border)',
    color: active ? 'var(--theme-2)' : 'var(--cream-2)',
    transition: 'all 0.15s',
  };
}

const inputStyle = {
  padding: '8px 10px 8px 32px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--cream)',
  fontFamily: 'DM Sans',
  fontSize: 12,
  outline: 'none',
  width: 240,
};

export default function SuperadminFeatureVisibility({ embedded }) {
  const [catalog, setCatalog] = useState([]);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [role, setRole] = useState('');
  const [tier, setTier] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [skip, setSkip] = useState(0);
  const [busyKey, setBusyKey] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const [toast, setToast] = useState(null);
  // W5.FF4 · Mini-widget usage analytics (top features últimos 7d)
  const [usageSummary, setUsageSummary] = useState(null);
  // W5.FF5 · A/B modal + Bulk CSV
  const [abOpen, setAbOpen] = useState(false);
  const [csvErrors, setCsvErrors] = useState(null);
  const csvInputRef = useRef(null);

  // Initial catalog fetch (once)
  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then(d => {
        if (cancelled) return;
        setCatalog(d.catalog || []);
      })
      .catch(e => setToast({ kind: 'error', text: e.message || 'Error catalog' }));
    return () => { cancelled = true; };
  }, []);

  // W5.FF4 · Mini-widget usage (silenciosamente oculto si falla)
  useEffect(() => {
    let cancelled = false;
    fetchUsage({ days: 7 })
      .then(d => {
        if (cancelled) return;
        setUsageSummary(d?.summary || null);
      })
      .catch(() => { /* silent · hide widget */ });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Users fetch (re-runs on filters)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUsersWithFeatures({ role, tier, search, limit: PAGE_SIZE, skip })
      .then(d => {
        if (cancelled) return;
        setUsers(d.items || []);
        setTotal(d.total || 0);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setToast({ kind: 'error', text: e.message || 'Error users' });
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [role, tier, search, skip, refreshKey]);

  async function handleToggle(user, feature, nextEnabled) {
    const cellKey = `${user.user_id}:${feature.key}`;
    setBusyKey(cellKey);
    // Optimistic update
    setUsers(prev => prev.map(u => {
      if (u.user_id !== user.user_id) return u;
      const set = new Set(u.features_enabled || []);
      if (nextEnabled) set.add(feature.key); else set.delete(feature.key);
      const arr = Array.from(set);
      return { ...u, features_enabled: arr, features_count: arr.length };
    }));
    try {
      await grantFeature({
        user_id: user.user_id,
        tenant_id: user.tenant_id || user.user_id,
        feature_key: feature.key,
        enabled: nextEnabled,
      });
      setToast({
        kind: 'success',
        text: `${nextEnabled ? 'Habilitado' : 'Deshabilitado'} · ${feature.key} → ${user.email || user.user_id}`,
      });
    } catch (e) {
      // Revert on failure
      setRefreshKey(k => k + 1);
      // W5.FF4 · special-case missing_dependencies (409) → warning informativo
      if (e.status === 409 && e.body?.detail?.error === 'missing_dependencies') {
        const req = (e.body.detail.required || []).join(', ');
        setToast({
          kind: 'warning',
          text: `Requiere primero: ${req}`,
        });
      } else {
        setToast({ kind: 'error', text: e.message || 'Error grant' });
      }
    } finally {
      setBusyKey('');
    }
  }

  async function handleApplyTemplate({ user_id, tenant_id, template }) {
    const res = await applyTemplate({ user_id, tenant_id, template });
    setToast({
      kind: 'success',
      text: `Plantilla ${template} aplicada · ${res.granted_count || 0} features`,
    });
    setRefreshKey(k => k + 1);
  }

  // W5.FF5 · Bulk CSV upload
  async function handleCsvSelected(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    // Clear input so same file re-select fires onChange next time
    if (csvInputRef.current) csvInputRef.current.value = '';
    setToast({ kind: 'info', text: `Procesando ${file.name}…` });
    setCsvErrors(null);
    try {
      const res = await uploadBulkCSV(file);
      setToast({
        kind: 'success',
        text: `CSV procesado · ${res.rows_succeeded || 0}/${res.rows_processed || 0} filas aplicadas`,
      });
      if ((res.errors || []).length > 0) {
        setCsvErrors(res.errors);
      }
      setRefreshKey(k => k + 1);
    } catch (e) {
      if (e.status === 422 && e.body?.detail?.rows_with_errors) {
        setCsvErrors(e.body.detail.rows_with_errors);
        setToast({ kind: 'error', text: `Validación fallida · ${e.body.detail.rows_with_errors.length} errores` });
      } else {
        setToast({ kind: 'error', text: e.message || 'Error CSV' });
      }
    }
  }

  const stats = useMemo(() => {
    if (!users || users.length === 0) return { totalUsers: total, avgFeatures: 0 };
    const sum = users.reduce((acc, u) => acc + (u.features_count || 0), 0);
    return { totalUsers: total, avgFeatures: (sum / users.length).toFixed(1) };
  }, [users, total]);

  const submitSearch = (e) => {
    e.preventDefault();
    setSkip(0);
    setSearch(searchInput.trim());
  };

  return (
    <SuperadminLayout bare={embedded}>
      <PageHeader
        eyebrow="W5.FF3"
        title="Feature Visibility"
        sub="Concede o revoca features por usuario · plantillas por tier · audit chain mandatorio"
      />

      {/* Fase 3.1 · Control plane — asignar PLAN/snapshot a un tenant (GoHighLevel) */}
      <PlansPanel />

      {/* W5.FF4 · Mini-widget usage analytics (oculto si fetch falla) */}
      {usageSummary && usageSummary.top && usageSummary.top.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            fontFamily: 'DM Sans',
          }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--cream-3)',
            }}>
              Top features (últimos {usageSummary.period_days || 7}d)
            </div>
            {(usageSummary.top || []).map(t => (
              <span
                key={t.feature_key}
                title={`${t.count} eventos`}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'rgba(var(--theme-rgb), 0.14)',
                  border: '1px solid rgba(var(--theme-rgb), 0.35)',
                  color: 'var(--theme-2)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.feature_key} · {t.count}
              </span>
            ))}
            <span style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: 'var(--cream-3)',
            }}>
              {usageSummary.total_events || 0} eventos totales · {usageSummary.feature_count || 0} features con uso
            </span>
          </div>
        </Card>
      )}

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
      }}>
        <form onSubmit={submitSearch} style={{ position: 'relative' }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--cream-3)', pointerEvents: 'none',
          }} />
          <input
            data-testid="search-input"
            placeholder="Buscar email o nombre…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={inputStyle}
          />
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={12} style={{ color: 'var(--cream-3)' }} />
          <span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Rol:</span>
          {ROLE_FILTERS.map(f => (
            <button
              key={f.key || '__all'}
              data-testid={`filter-role-${f.key || 'all'}`}
              onClick={() => { setRole(f.key); setSkip(0); }}
              style={pill(role === f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Tier:</span>
          {TIER_FILTERS.map(f => (
            <button
              key={f.key || '__all_t'}
              data-testid={`filter-tier-${f.key || 'all'}`}
              onClick={() => { setTier(f.key); setSkip(0); }}
              style={pill(tier === f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            data-testid="open-template-modal"
            onClick={() => setTplOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: 'rgba(var(--theme-rgb), 0.18)',
              border: '1px solid rgba(var(--theme-rgb), 0.45)',
              color: 'var(--theme-2)',
              fontFamily: 'DM Sans',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Layers size={14} />
            Aplicar plantilla
          </button>
          {/* W5.FF5 · A/B Tests button */}
          <button
            data-testid="open-ab-modal"
            onClick={() => setAbOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: 'rgba(var(--theme-rgb), 0.10)',
              border: '1px solid rgba(var(--theme-rgb), 0.30)',
              color: 'var(--theme-2)',
              fontFamily: 'DM Sans',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <FlaskConical size={14} />
            A/B Tests
          </button>
          {/* W5.FF5 · Bulk CSV upload button */}
          <button
            data-testid="open-csv-upload"
            onClick={() => csvInputRef.current && csvInputRef.current.click()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--cream-2)',
              fontFamily: 'DM Sans',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Upload size={14} />
            Importar CSV
          </button>
          <input
            ref={csvInputRef}
            data-testid="csv-file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvSelected}
            style={{ display: 'none' }}
          />
          <button
            data-testid="refresh-btn"
            onClick={() => setRefreshKey(k => k + 1)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--cream-2)',
              fontFamily: 'DM Sans',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RefreshCw size={13} />
            Refrescar
          </button>
        </div>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{
          display: 'flex',
          gap: 32,
          padding: '12px 16px',
          fontFamily: 'DM Sans',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>Total usuarios</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)' }}>{stats.totalUsers}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>Features catalog</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)' }}>{catalog.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>Promedio features/user</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--theme-2)' }}>{stats.avgFeatures}</div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 4 }}>
          {loading ? (
            <div style={{
              padding: 28,
              textAlign: 'center',
              color: 'var(--cream-3)',
              fontFamily: 'DM Sans',
              fontSize: 13,
            }}>
              Cargando matriz…
            </div>
          ) : (
            <FeatureMatrixGrid
              users={users}
              catalog={catalog}
              onToggle={handleToggle}
              busyKey={busyKey}
            />
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontFamily: 'DM Sans',
          fontSize: 11,
          color: 'var(--cream-3)',
        }}>
          <div>
            Mostrando {users.length} de {total} usuarios
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              data-testid="page-prev"
              onClick={() => setSkip(s => Math.max(0, s - PAGE_SIZE))}
              disabled={skip === 0}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--cream-2)',
                fontFamily: 'DM Sans',
                fontSize: 11,
                cursor: skip === 0 ? 'not-allowed' : 'pointer',
                opacity: skip === 0 ? 0.4 : 1,
              }}
            >
              ← Anterior
            </button>
            <button
              data-testid="page-next"
              onClick={() => setSkip(s => s + PAGE_SIZE)}
              disabled={skip + users.length >= total}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--cream-2)',
                fontFamily: 'DM Sans',
                fontSize: 11,
                cursor: (skip + users.length >= total) ? 'not-allowed' : 'pointer',
                opacity: (skip + users.length >= total) ? 0.4 : 1,
              }}
            >
              Siguiente →
            </button>
          </div>
        </div>
      </Card>

      <FeatureTemplateModal
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        users={users}
        onApply={handleApplyTemplate}
      />

      {/* W5.FF5 · A/B Experiments modal */}
      <ABExperimentsModal
        open={abOpen}
        onClose={() => setAbOpen(false)}
        catalog={catalog}
        onToast={setToast}
      />

      {/* W5.FF5 · CSV errors modal (simple list) */}
      {csvErrors && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16,
          }}
        >
          <div style={{
            width: '100%', maxWidth: 560, maxHeight: '80vh', overflow: 'auto',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 22,
            fontFamily: 'DM Sans',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{
                fontFamily: 'Outfit',
                fontWeight: 800,
                fontSize: 16,
                color: 'var(--cream)',
                margin: 0,
              }}>
                Errores en CSV ({csvErrors.length})
              </h3>
              <button
                data-testid="csv-errors-close"
                onClick={() => setCsvErrors(null)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--cream-2)', cursor: 'pointer', fontSize: 18, padding: 4,
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{
                    padding: '6px 10px',
                    fontSize: 10,
                    color: 'var(--cream-3)',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'left',
                  }}>Fila</th>
                  <th style={{
                    padding: '6px 10px',
                    fontSize: 10,
                    color: 'var(--cream-3)',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'left',
                  }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {csvErrors.map((e, i) => (
                  <tr key={`${e.row}-${i}`}>
                    <td style={{
                      padding: '6px 10px',
                      fontSize: 12,
                      color: 'var(--cream)',
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                    }}>{e.row}</td>
                    <td style={{
                      padding: '6px 10px',
                      fontSize: 12,
                      color: 'var(--cream-2)',
                      borderBottom: '1px solid var(--border)',
                    }}>{e.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          kind={toast.kind}
          text={toast.text}
          onClose={() => setToast(null)}
        />
      )}
    </SuperadminLayout>
  );
}

// W5.FF3 · SuperadminFeatureVisibility — UI Matrix
// Ruta: /superadmin/feature-visibility · superadmin only · sección Operación (naranja).
// Cero hex hardcoded · usa var(--theme*) / var(--cream*) / var(--border).
import React, { useEffect, useMemo, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Toast } from '../../components/advisor/primitives';
import { RefreshCw, Search, Layers, Filter } from 'lucide-react';
import FeatureMatrixGrid from '../../components/superadmin/FeatureMatrixGrid';
import FeatureTemplateModal from '../../components/superadmin/FeatureTemplateModal';
import {
  fetchCatalog,
  fetchUsersWithFeatures,
  grantFeature,
  applyTemplate,
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

export default function SuperadminFeatureVisibility() {
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
      setToast({ kind: 'error', text: e.message || 'Error grant' });
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
    <SuperadminLayout>
      <PageHeader
        eyebrow="W5.FF3"
        title="Feature Visibility"
        sub="Concede o revoca features por usuario · plantillas por tier · audit chain mandatorio"
      />

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

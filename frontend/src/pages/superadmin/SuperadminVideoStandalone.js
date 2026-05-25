// W5.22 Z.4 · SuperadminVideoStandalone — stats + cost monitoring.
// Ruta: /superadmin/video-standalone · superadmin only · sección MONETIZACIÓN (verde).
// Cero hex hardcoded · usa var(--theme*) / var(--cream*) / var(--border).
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Video, TrendingUp, DollarSign } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import { getStandaloneSuperadminStats } from '../../api/videoStandalone';

const DAYS_OPTIONS = [7, 30, 90];

function Kpi({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? 'var(--theme-2)' : 'var(--cream)' }}>{value}</div>
    </div>
  );
}

const thStyle = {
  textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase',
  borderBottom: '1px solid var(--border)',
};
const tdStyle = {
  padding: '9px 12px', fontSize: 13, color: 'var(--cream-2)',
  borderBottom: '1px solid var(--border)', fontFamily: 'DM Sans',
};

export default function SuperadminVideoStandalone() {
  const { t } = useTranslation();
  const tt = (k, d, o) => t(`videoStandalone.superadmin.${k}`, d, o);
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getStandaloneSuperadminStats(days);
        if (!cancelled) setStats(res);
      } catch (e) {
        if (!cancelled) setError(e?.message || tt('error', 'No fue posible cargar las métricas.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const topProviders = stats?.top_providers || [];
  const topUsers = stats?.top_users || [];

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow={tt('eyebrow', 'Monetización · Studio')}
        title={tt('title', 'Video Standalone')}
        sub={tt('sub', 'Volumen, tasa de éxito y costo de generación de videos.')}
      />

      {/* KPI strip */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 32, padding: '12px 16px', fontFamily: 'DM Sans', flexWrap: 'wrap', alignItems: 'center' }}>
          <Kpi label={tt('kpi.total', 'Videos {{n}}d', { n: days })} value={stats?.total_videos ?? '—'} />
          <Kpi label={tt('kpi.success', 'Tasa de éxito')} value={stats ? `${stats.success_rate_pct}%` : '—'} accent />
          <Kpi label={tt('kpi.avgCost', 'Costo promedio')} value={stats ? `$${(stats.avg_cost_usd ?? 0).toFixed(4)}` : '—'} />
          <Kpi label={tt('kpi.totalCost', 'Costo total')} value={stats ? `$${(stats.total_cost_usd ?? 0).toFixed(2)}` : '—'} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              data-testid="svs-days-select"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{
                padding: '8px 10px', borderRadius: 8, background: 'transparent',
                border: '1px solid var(--border)', color: 'var(--cream-2)',
                fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
              }}
            >
              {DAYS_OPTIONS.map((d) => <option key={d} value={d}>{tt('lastDays', '{{n}} días', { n: d })}</option>)}
            </select>
            <button
              data-testid="svs-refresh-btn"
              onClick={() => setRefreshKey((k) => k + 1)}
              style={{
                padding: '8px 12px', borderRadius: 8, background: 'transparent',
                border: '1px solid var(--border)', color: 'var(--cream-2)',
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
              {tt('refresh', 'Actualizar')}
            </button>
          </div>
        </div>
      </Card>

      {error && (
        <Card style={{ marginBottom: 14 }}>
          <div role="alert" style={{ padding: '12px 16px', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 13 }}>{error}</div>
        </Card>
      )}

      {/* Top providers */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={15} style={{ color: 'var(--theme-2)' }} />
          <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{tt('providers.title', 'Proveedores más usados')}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>{tt('providers.provider', 'Proveedor')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>{tt('providers.count', 'Videos')}</th>
            </tr>
          </thead>
          <tbody>
            {topProviders.length === 0 ? (
              <tr><td style={tdStyle} colSpan={2}>{loading ? tt('loading', 'Cargando…') : tt('empty', 'Sin datos en el periodo.')}</td></tr>
            ) : topProviders.map((p) => (
              <tr key={p.provider} data-testid="svs-provider-row">
                <td style={tdStyle}><Video size={12} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--cream-3)' }} />{p.provider}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--cream)' }}>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Top users by video count + cost monitoring */}
      <Card>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <DollarSign size={15} style={{ color: 'var(--theme-2)' }} />
          <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{tt('users.title', 'Top usuarios por volumen')}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={thStyle}>{tt('users.user', 'Usuario')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>{tt('users.count', 'Videos')}</th>
            </tr>
          </thead>
          <tbody>
            {topUsers.length === 0 ? (
              <tr><td style={tdStyle} colSpan={3}>{loading ? tt('loading', 'Cargando…') : tt('empty', 'Sin datos en el periodo.')}</td></tr>
            ) : topUsers.map((u, i) => (
              <tr key={u.user_id} data-testid="svs-user-row">
                <td style={{ ...tdStyle, color: 'var(--cream-3)' }}>{i + 1}</td>
                <td style={tdStyle}>{u.user_id}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--cream)' }}>{u.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </SuperadminLayout>
  );
}

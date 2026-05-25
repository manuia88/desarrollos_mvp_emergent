/**
 * W5.10 · Superadmin Social/Ads monitoring.
 * KPIs (tenants · tokens activos · expirando 7d · Meta API health) · tabla tenants ·
 * sección Meta API status (latency + error rate · STUB).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getSuperadminStats, getSuperadminTenants } from '../../api/socialAds';

const CARD = {
  padding: 18, borderRadius: 16,
  background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
};
const KPI = {
  padding: 16, borderRadius: 14,
  background: 'rgba(99,102,241,0.06)',
  border: '1px solid rgba(99,102,241,0.18)',
};
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('es-MX').format(n); } catch { return String(n); }
}

export default function SuperadminSocialAds() {
  const { t } = useTranslation('common');
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, tRes] = await Promise.all([getSuperadminStats(), getSuperadminTenants()]);
      if (!sRes.ok) { setError(t('socialAds.superadmin.loadError', 'No se pudieron cargar las estadísticas.')); return; }
      setStats(sRes.body);
      setTenants(tRes.ok ? (tRes.body.tenants || []) : []);
    } catch (e) {
      setError(t('socialAds.superadmin.loadError', 'No se pudieron cargar las estadísticas.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const health = stats?.meta_api_status || {};

  return (
    <SuperadminLayout>
      <div style={{ padding: 24, color: '#E5E7EB' }}>
        <header style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, backgroundImage: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('socialAds.superadmin.title', 'Social Ads · monitoreo')}
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>
            {t('socialAds.superadmin.subtitle', 'Conexiones Meta por tenant · tokens · salud de la API.')}
          </p>
        </header>

        {stats?.stub_mode && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 9999, marginBottom: 16, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#FCD34D', fontSize: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: 9999, background: 'currentColor' }} />
            {t('socialAds.superadmin.stubBadge', 'Modo demo · Meta App Review pendiente')}
          </div>
        )}

        {error && (
          <div role="alert" style={{ padding: 12, marginBottom: 16, borderRadius: 12, background: 'rgba(239,68,68,0.10)', color: '#FCA5A5', fontSize: 13 }}>{error}</div>
        )}

        {loading && !stats ? (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>…</p>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 14, marginBottom: 22, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div style={KPI}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{t('socialAds.superadmin.kpi.tenants', 'Tenants conectados')}</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{fmtNum(stats?.tenants_connected)}</div>
              </div>
              <div style={KPI}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{t('socialAds.superadmin.kpi.activeTokens', 'Tokens activos')}</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{fmtNum(stats?.active_tokens)}</div>
              </div>
              <div style={KPI}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{t('socialAds.superadmin.kpi.expiring', 'Expiran en 7d')}</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: (stats?.expiring_7d || 0) > 0 ? '#FCD34D' : undefined }}>{fmtNum(stats?.expiring_7d)}</div>
              </div>
              <div style={KPI}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{t('socialAds.superadmin.kpi.apiHealth', 'Meta API')}</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: health.reachable ? '#6EE7B7' : '#FCA5A5' }}>
                  {health.reachable ? t('socialAds.superadmin.healthOk', 'Operativa') : t('socialAds.superadmin.healthDown', 'Caída')}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
              {/* Tenants table */}
              <div style={CARD}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>{t('socialAds.superadmin.tenantsTitle', 'Conexiones por tenant')}</h2>
                {tenants.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{t('socialAds.superadmin.noTenants', 'Sin tenants conectados aún.')}</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase' }}>
                          <th style={{ textAlign: 'left', paddingBottom: 8 }}>tenant</th>
                          <th style={{ textAlign: 'right', paddingBottom: 8 }}>{t('socialAds.superadmin.colConn', 'conexiones')}</th>
                          <th style={{ textAlign: 'right', paddingBottom: 8 }}>{t('socialAds.superadmin.colUsers', 'usuarios')}</th>
                          <th style={{ textAlign: 'right', paddingBottom: 8 }}>{t('socialAds.superadmin.colExp', 'exp. 7d')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenants.map((r) => (
                          <tr key={r.tenant_id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '8px 0', color: '#E5E7EB', fontFamily: 'ui-monospace, Menlo, monospace', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.tenant_id}</td>
                            <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmtNum(r.connections)}</td>
                            <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmtNum(r.users)}</td>
                            <td style={{ padding: '8px 0', textAlign: 'right', color: (r.expiring_7d || 0) > 0 ? '#FCD34D' : undefined }}>{fmtNum(r.expiring_7d)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Meta API status */}
              <div style={CARD}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>{t('socialAds.superadmin.apiStatusTitle', 'Estado Meta API')}</h2>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{t('socialAds.superadmin.latency', 'Latencia última llamada')}</span>
                    <strong>{health.last_call_latency_ms != null ? `${health.last_call_latency_ms} ms` : '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{t('socialAds.superadmin.errorRate', 'Tasa de error')}</span>
                    <strong style={{ color: (health.error_rate_pct || 0) > 1 ? '#FCD34D' : '#6EE7B7' }}>{health.error_rate_pct != null ? `${health.error_rate_pct}%` : '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{t('socialAds.superadmin.totalTokens', 'Tokens totales')}</span>
                    <strong>{fmtNum(stats?.total_tokens)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{t('socialAds.superadmin.estCost', 'Costo mensual estimado')}</span>
                    <strong>${(stats?.est_monthly_cost_usd ?? 0).toFixed(2)} USD</strong>
                  </div>
                  {health.checked_at && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                      {t('socialAds.superadmin.checkedAt', 'Verificado')}: {new Date(health.checked_at).toLocaleString('es-MX')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </SuperadminLayout>
  );
}

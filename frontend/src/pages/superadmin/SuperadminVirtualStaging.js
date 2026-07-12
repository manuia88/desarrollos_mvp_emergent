/**
 * W5.17 wire — Superadmin Virtual Staging IA · Debug dashboard.
 *
 * Stats agregadas 30d: total · cache hit · Replicate cost · top style ·
 * by_style · by_room · top 5 users.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('es-MX').format(n); } catch { return String(n); }
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(1)}%`;
}

function fmtUsd(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n); } catch { return String(n); }
}

const card = {
  padding: 18, borderRadius: 16,
  background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
};

const kpi = {
  padding: 16, borderRadius: 14,
  background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.18)',
};

async function fetchVsStats() {
  const base = process.env.REACT_APP_BACKEND_URL;
  const res = await fetch(`${base}/api/virtual-staging/admin/stats`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function SuperadminVirtualStaging({ embedded }) {
  const { t } = useTranslation('common');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchVsStats();
      setData(d);
    } catch (e) {
      setError(e?.message || 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byStyle = Array.isArray(data?.by_style) ? data.by_style : [];
  const byRoom = Array.isArray(data?.by_room) ? data.by_room : [];
  const topUsers = Array.isArray(data?.top_users_5) ? data.top_users_5 : [];

  return (
    <SuperadminLayout bare={embedded}>
      <div data-testid="superadmin-virtual-staging" style={{ padding: 24, fontFamily: 'DM Sans, sans-serif', color: '#F0EBE0' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t('virtualStagingAdmin.page_title', 'Virtual Staging IA · Debug')}
          </h1>
          <p style={{ margin: '6px 0 0', color: 'rgba(240,235,224,0.62)', fontSize: 14 }}>
            {t('virtualStagingAdmin.page_subtitle', 'Stats agregadas W5.17 · cache + costo Replicate + top usuarios.')}
          </p>
        </header>

        {/* KPIs */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
          <div style={kpi}>
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.62)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {t('virtualStagingAdmin.stat_total', 'Stagings totales')}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, fontFamily: 'Outfit, sans-serif' }}>{fmtNum(data?.total_stagings)}</div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.62)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {t('virtualStagingAdmin.stat_cache_hit', 'Cache hit rate')}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, fontFamily: 'Outfit, sans-serif' }}>{fmtPct(data?.cache_hit_rate_pct)}</div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.62)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {t('virtualStagingAdmin.stat_cost', 'Costo USD 30d')}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, fontFamily: 'Outfit, sans-serif' }}>{fmtUsd(data?.total_replicate_cost_usd_30d)}</div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.62)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {t('virtualStagingAdmin.stat_top_style', 'Estilo top')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 10, fontFamily: 'Outfit, sans-serif' }}>{data?.top_style || '—'}</div>
          </div>
        </section>

        {loading && (
          <p style={{ color: 'rgba(240,235,224,0.62)', fontSize: 13 }}>{t('common.loading', 'Cargando...')}</p>
        )}
        {error && (
          <p style={{ color: '#FCA5A5', fontSize: 13 }}>{t('virtualStagingAdmin.error', 'No fue posible cargar las metricas.')} · {error}</p>
        )}

        {!loading && !error && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <section style={card}>
              <h2 style={{ margin: '0 0 14px', fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700 }}>
                {t('virtualStagingAdmin.table_by_style', 'Por estilo')}
              </h2>
              {byStyle.length === 0 ? (
                <p style={{ color: 'rgba(240,235,224,0.62)', fontSize: 13 }}>{t('virtualStagingAdmin.empty', 'Sin actividad reciente.')}</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'rgba(240,235,224,0.62)', borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
                      <th style={{ padding: '8px 6px' }}>{t('virtualStagingAdmin.col_style', 'Estilo')}</th>
                      <th style={{ padding: '8px 6px' }}>{t('virtualStagingAdmin.col_count', 'Cantidad')}</th>
                      <th style={{ padding: '8px 6px' }}>{t('virtualStagingAdmin.col_avg_ms', 'Avg ms')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byStyle.map((r) => (
                      <tr key={r.style} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }}>
                        <td style={{ padding: '8px 6px' }}>{r.style}</td>
                        <td style={{ padding: '8px 6px' }}>{fmtNum(r.count)}</td>
                        <td style={{ padding: '8px 6px', color: 'rgba(240,235,224,0.62)' }}>{fmtNum(r.avg_processing_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section style={card}>
              <h2 style={{ margin: '0 0 14px', fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700 }}>
                {t('virtualStagingAdmin.table_by_room', 'Por tipo de habitacion')}
              </h2>
              {byRoom.length === 0 ? (
                <p style={{ color: 'rgba(240,235,224,0.62)', fontSize: 13 }}>{t('virtualStagingAdmin.empty', 'Sin actividad reciente.')}</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'rgba(240,235,224,0.62)', borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
                      <th style={{ padding: '8px 6px' }}>{t('virtualStagingAdmin.col_room', 'Habitacion')}</th>
                      <th style={{ padding: '8px 6px' }}>{t('virtualStagingAdmin.col_count', 'Cantidad')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byRoom.map((r) => (
                      <tr key={r.room} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }}>
                        <td style={{ padding: '8px 6px' }}>{r.room}</td>
                        <td style={{ padding: '8px 6px' }}>{fmtNum(r.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section style={card}>
              <h2 style={{ margin: '0 0 14px', fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700 }}>
                {t('virtualStagingAdmin.table_top_users', 'Top 5 usuarios')}
              </h2>
              {topUsers.length === 0 ? (
                <p style={{ color: 'rgba(240,235,224,0.62)', fontSize: 13 }}>{t('virtualStagingAdmin.empty', 'Sin actividad reciente.')}</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'rgba(240,235,224,0.62)', borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
                      <th style={{ padding: '8px 6px' }}>{t('virtualStagingAdmin.col_user', 'Usuario')}</th>
                      <th style={{ padding: '8px 6px' }}>{t('virtualStagingAdmin.col_count', 'Cantidad')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topUsers.map((u) => (
                      <tr key={u.user_id} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }}>
                        <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>{u.user_id}</td>
                        <td style={{ padding: '8px 6px' }}>{fmtNum(u.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}

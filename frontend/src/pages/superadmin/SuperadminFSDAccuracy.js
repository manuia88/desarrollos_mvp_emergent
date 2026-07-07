/**
 * W5.15 wire — Superadmin FSD per-property Accuracy dashboard.
 *
 * KPIs (MAPE rolling 30d · total predictions · accuracy trend) ·
 * Distribution buckets · Top 20 worst MAPE table.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('es-MX').format(n); } catch { return String(n); }
}

function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n); } catch { return String(n); }
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(2)}%`;
}

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; }
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

async function fetchFsdAccuracy(days = 30) {
  const base = process.env.REACT_APP_BACKEND_URL;
  const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  const res = await fetch(`${base}/api/fsd/accuracy?days=${days}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function SuperadminFSDAccuracy({ embedded }) {
  const { t } = useTranslation('common');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchFsdAccuracy(30);
      setData(d);
    } catch (e) {
      setError(e?.message || 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = Array.isArray(data?.accuracy_by_property) ? data.accuracy_by_property : [];
  const dist = data?.distribution || {};

  return (
    <SuperadminLayout bare={embedded}>
      <div data-testid="superadmin-fsd-accuracy" style={{ padding: 24, fontFamily: 'DM Sans, sans-serif', color: '#F0EBE0' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t('fsdAccuracy.page_title', 'FSD per-property · Accuracy')}
          </h1>
          <p style={{ margin: '6px 0 0', color: 'rgba(240,235,224,0.62)', fontSize: 14 }}>
            {t('fsdAccuracy.page_subtitle', 'Forecast Standard Deviation (W5.15) · monitoreo MAPE rolling 30 dias.')}
          </p>
          <span style={{
            display: 'inline-block', marginTop: 12,
            padding: '4px 12px', borderRadius: 9999,
            background: 'rgba(99,102,241,0.16)', color: '#C7D2FE',
            fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 700,
          }}>{t('fsdAccuracy.chip_mape', 'MAPE rolling 30d')}</span>
        </header>

        {/* KPIs */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
          <div style={kpi}>
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.62)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {t('fsdAccuracy.stat_total', 'Predicciones totales')}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, fontFamily: 'Outfit, sans-serif' }}>{fmtNum(data?.n_predictions)}</div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.62)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {t('fsdAccuracy.stat_mape', 'MAPE actual')}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, fontFamily: 'Outfit, sans-serif' }}>{fmtPct(data?.mape_rolling)}</div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.62)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {t('fsdAccuracy.stat_trend', 'Tendencia accuracy')}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10, color: 'rgba(240,235,224,0.85)' }}>
              {data?.days_window ? `${data.days_window}d window` : '—'}
            </div>
          </div>
        </section>

        {/* Distribution buckets */}
        <section style={{ ...card, marginBottom: 22 }}>
          <h2 style={{ margin: '0 0 14px', fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700 }}>
            {t('fsdAccuracy.distribution_label', 'Distribucion por bucket de error')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {['0-5%', '5-10%', '10-20%', '20-40%', '40%+'].map((b) => (
              <div key={b} style={{
                padding: 12, borderRadius: 12,
                background: 'rgba(240,235,224,0.04)',
                border: '1px solid rgba(240,235,224,0.12)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.62)' }}>{b}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, fontFamily: 'Outfit, sans-serif' }}>{fmtNum(dist[b] || 0)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Top worst MAPE */}
        <section style={card}>
          <h2 style={{ margin: '0 0 14px', fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700 }}>
            {t('fsdAccuracy.table_title', 'Top 20 propiedades con peor MAPE')}
          </h2>
          {loading && (
            <p style={{ color: 'rgba(240,235,224,0.62)', fontSize: 13 }}>{t('common.loading', 'Cargando...')}</p>
          )}
          {error && (
            <p style={{ color: '#FCA5A5', fontSize: 13 }}>{t('fsdAccuracy.error', 'No fue posible cargar las metricas.')} · {error}</p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p style={{ color: 'rgba(240,235,224,0.62)', fontSize: 13 }}>{t('fsdAccuracy.empty', 'Sin datos suficientes para mostrar accuracy.')}</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'rgba(240,235,224,0.62)', borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
                    <th style={{ padding: '10px 8px' }}>{t('fsdAccuracy.col_property', 'Propiedad')}</th>
                    <th style={{ padding: '10px 8px' }}>{t('fsdAccuracy.col_prediction', 'Prediccion')}</th>
                    <th style={{ padding: '10px 8px' }}>{t('fsdAccuracy.col_actual', 'Real')}</th>
                    <th style={{ padding: '10px 8px' }}>{t('fsdAccuracy.col_mape', 'MAPE')}</th>
                    <th style={{ padding: '10px 8px' }}>{t('fsdAccuracy.col_updated', 'Actualizado')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.property_id}-${i}`} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }}>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 12 }}>{r.property_id || '—'}</td>
                      <td style={{ padding: '10px 8px' }}>{fmtMoney(r.predicted_value)}</td>
                      <td style={{ padding: '10px 8px' }}>{fmtMoney(r.actual_value)}</td>
                      <td style={{ padding: '10px 8px', color: r.mape_pct > 20 ? '#FCA5A5' : r.mape_pct > 10 ? '#FBBF24' : '#86EFAC' }}>
                        {fmtPct(r.mape_pct)}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'rgba(240,235,224,0.62)' }}>{fmtDate(r.computed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </SuperadminLayout>
  );
}

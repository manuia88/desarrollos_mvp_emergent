// W7.AS.3.I · SuperadminConversationDrift — dashboard de deriva del agente IA.
// Wirea conversation_drift_detector (R2, antes orphan) vía routes superadmin.
// 4 widgets: (1) KPIs strip 3 cards · (2) trend chart SVG nativo 3 líneas
// baseline vs reciente · (3) tabla alerts history paginada (cap 100) con ack ·
// (4) botón forzar recálculo baseline.
// Standalone · Terminal G lo registra como route + namespace i18n. Aurora design.
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowLeftRight, Gauge, ShieldAlert, RefreshCw, Loader2, Check } from 'lucide-react';
import SuperadminLayout from './SuperadminLayout';

const API = process.env.REACT_APP_BACKEND_URL || '';
const BASE = `${API}/api/superadmin/conversation-drift`;
const PAGE_SIZE = 100;
const THRESHOLD = 0.15;

// métrica → key i18n + key baseline/current (shape del detector)
const METRICS = [
  { id: 'handoff_rate_delta', src: 'handoff_rate', Icon: ArrowLeftRight,
    labelKey: 'kpi_handoff', metricKey: 'metric_handoff_rate', color: 'var(--theme-accent, #EC4899)' },
  { id: 'sentiment_delta', src: 'avg_sentiment', Icon: Activity,
    labelKey: 'kpi_sentiment', metricKey: 'metric_avg_sentiment', color: 'var(--theme-primary, #6366F1)' },
  { id: 'confidence_delta', src: 'avg_confidence', Icon: Gauge,
    labelKey: 'kpi_confidence', metricKey: 'metric_avg_confidence', color: 'var(--theme-success, #22C55E)' },
];
const METRIC_LABEL = {
  handoff_rate: 'metric_handoff_rate',
  avg_sentiment: 'metric_avg_sentiment',
  avg_confidence: 'metric_avg_confidence',
};

function authHeaders() {
  const t = localStorage.getItem('dmx_token') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function fmtPct(v) {
  const n = Number(v || 0) * 100;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

// normaliza un valor de métrica a banda 0..1 para el chart comparativo
function norm(src, v) {
  const n = Number(v || 0);
  if (src === 'avg_sentiment') return Math.max(0, Math.min(1, (n + 1) / 2)); // -1..1 → 0..1
  return Math.max(0, Math.min(1, n)); // handoff_rate / avg_confidence ya 0..1
}

function TrendChart({ data, t }) {
  const baseline = data?.baseline || {};
  const current = data?.current || {};
  const hasData = data && !data.insufficient_baseline && Number(baseline.n || 0) > 0;
  const W = 420, H = 140, padX = 40, padY = 18;

  if (!hasData) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(240,235,224,0.4)', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
        {data?.insufficient_baseline ? t('waiting_data') : t('chart_empty')}
      </div>
    );
  }
  const xL = padX, xR = W - padX;
  const yOf = (val) => padY + (1 - val) * (H - padY * 2);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }} data-testid="drift-trend-chart">
        {/* ejes horizontales guía */}
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={xL} y1={yOf(g)} x2={xR} y2={yOf(g)}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {/* etiquetas eje X */}
        <text x={xL} y={H - 2} textAnchor="middle" fontSize="9" fill="rgba(240,235,224,0.4)" fontFamily="DM Mono, monospace">{t('chart_baseline')}</text>
        <text x={xR} y={H - 2} textAnchor="middle" fontSize="9" fill="rgba(240,235,224,0.4)" fontFamily="DM Mono, monospace">{t('chart_current')}</text>
        {/* 3 líneas: baseline (izq) → reciente (der) por métrica */}
        {METRICS.map((m) => {
          const yb = yOf(norm(m.src, baseline[m.src]));
          const yc = yOf(norm(m.src, current[m.src]));
          return (
            <g key={m.id}>
              <line x1={xL} y1={yb} x2={xR} y2={yc} stroke={m.color} strokeWidth="2" strokeLinecap="round" />
              <circle cx={xL} cy={yb} r={4} fill={m.color} />
              <circle cx={xR} cy={yc} r={4} fill={m.color} />
            </g>
          );
        })}
      </svg>
      {/* leyenda */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
        {METRICS.map((m) => (
          <span key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 9999, background: m.color, display: 'inline-block' }} />
            {t(m.metricKey)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SuperadminConversationDrift() {
  const { t } = useTranslation(['conversation_drift', 'conversation_confidence']);
  const [tenantId, setTenantId] = useState('');
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState({ alerts: [], total: 0, page: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [acking, setAcking] = useState(null);
  const [recomputing, setRecomputing] = useState(false);
  const [notice, setNotice] = useState('');
  const [confStats, setConfStats] = useState(null); // W7.AS.3.H · confidence stats (SA)

  const loadConfStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/superadmin/confidence/stats`, { headers: authHeaders() });
      setConfStats(res.ok ? await res.json() : null);
    } catch { setConfStats(null); }
  }, []);

  const loadAlerts = useCallback(async (p = 1) => {
    try {
      const qs = new URLSearchParams({ days: '30', page: String(p), page_size: String(PAGE_SIZE) });
      if (tenantId.trim()) qs.set('tenant_id', tenantId.trim());
      const res = await fetch(`${BASE}/alerts/history?${qs}`, { headers: authHeaders() });
      setAlerts(res.ok ? await res.json() : { alerts: [], total: 0, page: p });
    } catch {
      setAlerts({ alerts: [], total: 0, page: p });
    }
  }, [tenantId]);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      if (tenantId.trim()) {
        const res = await fetch(`${BASE}/compute?tenant_id=${encodeURIComponent(tenantId.trim())}`, { headers: authHeaders() });
        setData(res.ok ? await res.json() : null);
      } else {
        setData(null);
      }
      await loadAlerts(1);
      setPage(1);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, loadAlerts]);

  useEffect(() => { loadAlerts(1); }, [loadAlerts]);
  useEffect(() => { loadConfStats(); }, [loadConfStats]);

  const onAck = async (alertId) => {
    setAcking(alertId);
    try {
      await fetch(`${BASE}/alerts/${encodeURIComponent(alertId)}/ack`, { method: 'POST', headers: authHeaders() });
      await loadAlerts(page);
    } catch { /* noop */ }
    finally { setAcking(null); }
  };

  const onRecompute = async () => {
    if (!tenantId.trim()) return;
    setRecomputing(true);
    setNotice('');
    try {
      const res = await fetch(`${BASE}/baseline/recompute?tenant_id=${encodeURIComponent(tenantId.trim())}`, { headers: authHeaders() });
      const j = res.ok ? await res.json() : null;
      setNotice(j?.throttled ? t('recompute_throttled') : t('recompute_done'));
      await load();
    } catch { /* noop */ }
    finally { setRecomputing(false); }
  };

  const totalPages = Math.max(1, Math.ceil((alerts.total || 0) / PAGE_SIZE));
  const dl = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--cream, #F0EBE0)', padding: '6px 10px', fontSize: 12.5, outline: 'none',
  };

  return (
    <SuperadminLayout>
    <div style={{ padding: 24, color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <ShieldAlert size={22} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, margin: 0 }}>{t('title')}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(240,235,224,0.55)' }}>{t('subtitle')}</p>
        </div>
        <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder={t('tenant_placeholder')}
          style={{ ...dl, minWidth: 160 }} onKeyDown={(e) => { if (e.key === 'Enter') load(); }} />
        <button type="button" onClick={load} style={{ ...dl, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />} {t('refresh')}
        </button>
      </div>

      {/* drift banner */}
      {data && !data.insufficient_baseline && (
        <div style={{ marginBottom: 16, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: data.drift ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.10)',
          border: `1px solid ${data.drift ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.3)'}`,
          color: data.drift ? '#fca5a5' : '#86efac' }}>
          <ShieldAlert size={15} /> {data.drift ? t('drift_detected') : t('drift_stable')}
        </div>
      )}

      {/* (1) KPIs strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {METRICS.map(({ id, Icon, labelKey, color }) => {
          const v = data ? Number(data[id] || 0) : 0;
          const breached = data && !data.insufficient_baseline && Math.abs(v) > THRESHOLD;
          return (
            <div key={id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${breached ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(240,235,224,0.5)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Icon size={14} color={color} /> {t(labelKey)}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8, color: breached ? '#fca5a5' : 'var(--cream, #F0EBE0)' }}>
                {data && !data.insufficient_baseline ? fmtPct(v) : '—'}
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(240,235,224,0.4)', marginTop: 2 }}>{t('kpi_hint')}</div>
            </div>
          );
        })}
      </div>

      {/* (2) trend chart */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{t('chart_title')}</div>
        <TrendChart data={data} t={t} />
      </div>

      {/* (4) recompute action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" onClick={onRecompute} disabled={!tenantId.trim() || recomputing}
          style={{ ...dl, display: 'flex', alignItems: 'center', gap: 7, cursor: tenantId.trim() ? 'pointer' : 'not-allowed',
            opacity: tenantId.trim() ? 1 : 0.5, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.4)' }}>
          {recomputing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
          {recomputing ? t('recomputing') : t('recompute')}
        </button>
        {notice && <span style={{ fontSize: 12.5, color: 'rgba(240,235,224,0.65)' }}>{notice}</span>}
      </div>

      {/* (3) alerts history table */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{t('alerts_title')}</div>
        {(alerts.alerts || []).length === 0 ? (
          <div style={{ color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>{t('alerts_empty')}</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.04em' }}>
                    <th style={{ padding: '6px 8px' }}>{t('col_date')}</th>
                    <th style={{ padding: '6px 8px' }}>{t('col_metric')}</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('col_delta')}</th>
                    <th style={{ padding: '6px 8px' }}>{t('col_status')}</th>
                    <th style={{ padding: '6px 8px' }}>{t('col_action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.alerts.map((a) => {
                    const breached = (a.breached || [])[0];
                    const delta = breached ? (a.deltas || {})[breached] : null;
                    return (
                      <tr key={a.alert_id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 11.5 }}>{(a.alerted_at || '').slice(0, 10)}</td>
                        <td style={{ padding: '8px' }}>{(a.breached || []).map((b) => t(METRIC_LABEL[b] || b, b)).join(', ') || '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{delta != null ? fmtPct(delta) : '—'}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 11,
                            background: a.acknowledged ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                            color: a.acknowledged ? '#86efac' : '#fcd34d' }}>
                            {a.acknowledged ? t('status_ack') : t('status_pending')}
                          </span>
                        </td>
                        <td style={{ padding: '8px' }}>
                          {a.acknowledged ? (
                            <Check size={15} color="#86efac" />
                          ) : (
                            <button type="button" onClick={() => onAck(a.alert_id)} disabled={acking === a.alert_id}
                              style={{ ...dl, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer' }}>
                              {acking === a.alert_id ? t('acking') : t('ack')}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* paginación */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, justifyContent: 'flex-end' }}>
                <button type="button" disabled={page <= 1}
                  onClick={() => { const np = page - 1; setPage(np); loadAlerts(np); }}
                  style={{ ...dl, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>{t('page_prev')}</button>
                <span style={{ fontSize: 12, color: 'rgba(240,235,224,0.55)' }}>{t('page_of', { page })}</span>
                <button type="button" disabled={page >= totalPages}
                  onClick={() => { const np = page + 1; setPage(np); loadAlerts(np); }}
                  style={{ ...dl, cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>{t('page_next')}</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* (5) W7.AS.3.H · Estadísticas de confianza IA (superadmin · global) */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Gauge size={16} color="var(--theme-success, #22C55E)" />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{t('conversation_confidence:stats.title', 'Estadísticas de confianza IA')}</span>
        </div>
        {!confStats || (confStats.trend && confStats.trend.all == null && (confStats.avg_per_asesor || []).length === 0) ? (
          <div style={{ color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>{t('conversation_confidence:stats.empty', 'Aún no hay datos de confianza.')}</div>
        ) : (
          <>
            {/* trend strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
              {[['trend_7d', confStats.trend?.['7d']], ['trend_30d', confStats.trend?.['30d']], ['trend_all', confStats.trend?.all]].map(([k, v]) => (
                <div key={k} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 11.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(`conversation_confidence:stats.${k}`)}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: v != null && v < 50 ? '#fca5a5' : 'var(--cream, #F0EBE0)' }}>
                    {v != null ? `${v}%` : '—'}
                  </div>
                </div>
              ))}
            </div>
            {/* avg per asesor (peores primero · cap 8) */}
            {(confStats.avg_per_asesor || []).length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.04em' }}>
                      <th style={{ padding: '6px 8px' }}>{t('conversation_confidence:stats.asesor', 'Asesor')}</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('conversation_confidence:stats.confidence', 'Confianza')}</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('conversation_confidence:stats.conversations', 'convs.')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(confStats.avg_per_asesor || []).slice(0, 8).map((row) => (
                      <tr key={row.asesor_id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px' }}>{row.asesor_id}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: row.avg_confidence < 50 ? '#fca5a5' : '#86efac' }}>{row.avg_confidence}%</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: 'rgba(240,235,224,0.55)' }}>{row.conversations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </SuperadminLayout>
  );
}

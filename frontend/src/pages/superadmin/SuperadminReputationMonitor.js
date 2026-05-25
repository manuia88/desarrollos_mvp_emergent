// W7.AS.6 · SuperadminReputationMonitor
// Brand24-style dashboard · KPIs + filters + mentions table + top negative + trend chart
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import { Eye, RefreshCw, AlertTriangle, ExternalLink, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import {
  getMentions,
  getStats,
  scanNow,
  getAlertsHistory,
  markMention,
} from '../../api/reputationMonitor';

const CREAM = '#F0EBE0';
const SUBTLE = 'rgba(240,235,224,0.65)';
const PANEL_BG = 'rgba(240,235,224,0.04)';
const PANEL_BORDER = 'rgba(240,235,224,0.10)';
const POS_COLOR = '#34D399';
const NEG_COLOR = '#F87171';
const NEU_COLOR = 'rgba(240,235,224,0.70)';

const SOURCES = ['google_search', 'twitter_x', 'reddit', 'news_web'];
const SENTIMENTS = ['positive', 'neutral', 'negative'];

export default function SuperadminReputationMonitor() {
  const { t } = useTranslation('common');
  const tt = (k, fb) => t(`reputationMonitor.${k}`, fb);

  const [stats, setStats] = useState(null);
  const [mentions, setMentions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ sentiment: '', source: '', status: '', days: 30 });
  const [busy, setBusy] = useState({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m, a] = await Promise.all([
        getStats(filters.days),
        getMentions({ days: filters.days, sentiment: filters.sentiment || undefined, source: filters.source || undefined, status: filters.status || undefined, limit: 50 }),
        getAlertsHistory(filters.days),
      ]);
      setStats(s);
      setMentions(m.items || []);
      setAlerts(a.items || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- F.93 audit · load() reads filters from closure, depending solo on filter values evita loop infinito
  useEffect(() => { load(); }, [filters.days, filters.sentiment, filters.source, filters.status]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      await scanNow();
      await load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setScanning(false);
    }
  };

  const handleMark = async (id, status) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await markMention(id, status);
      await load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const total = stats?.total_mentions || 0;
  const sent = stats?.by_sentiment || { positive: 0, neutral: 0, negative: 0 };
  const pctNeg = total > 0 ? Math.round((sent.negative / total) * 100) : 0;
  // F.93 fix · trend memoized to stabilize useMemo deps below
  const trend = useMemo(() => stats?.trend_7d || [], [stats]);
  const trendDir = useMemo(() => {
    if (!trend || trend.length < 2) return 'flat';
    const first = trend[0]?.count || 0;
    const last = trend[trend.length - 1]?.count || 0;
    if (last > first) return 'up';
    if (last < first) return 'down';
    return 'flat';
  }, [trend]);
  const alertsCount = stats?.alerts_triggered_7d || 0;
  const topNegative = stats?.top_negative_urls || [];

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="W7.AS.6"
        title={tt('title', 'Monitor de Reputación')}
        sub={tt('sub', 'Menciones de DMX en Google · X · Reddit · News · sentiment Claude')}
      />

      {error && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', color: NEG_COLOR }}>
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label={tt('kpi.total', 'Menciones totales')} value={total} sub={`${filters.days}d`} icon={<Eye size={14} />} />
        <KpiCard label={tt('kpi.positivePct', 'Positivas')} value={`${total > 0 ? Math.round((sent.positive / total) * 100) : 0}%`} sub={`${sent.positive}`} color={POS_COLOR} />
        <KpiCard label={tt('kpi.negativePct', 'Negativas')} value={`${pctNeg}%`} sub={`${sent.negative}`} color={NEG_COLOR} />
        <KpiCard label={tt('kpi.trend', 'Tendencia 7d')} value={tt(`trend.${trendDir}`, trendDir)} icon={<TrendingUp size={14} />} />
        <KpiCard label={tt('kpi.alerts7d', 'Alertas 7d')} value={alertsCount} icon={<AlertTriangle size={14} />} color={alertsCount > 0 ? NEG_COLOR : CREAM} />
      </div>

      {/* Actions row */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <FilterSelect label={tt('filter.sentiment', 'Sentimiento')} value={filters.sentiment} onChange={(v) => setFilters((f) => ({ ...f, sentiment: v }))} options={[['', tt('filter.all', 'Todas')], ...SENTIMENTS.map((s) => [s, tt(`sentiment.${s}`, s)])]} />
            <FilterSelect label={tt('filter.source', 'Fuente')} value={filters.source} onChange={(v) => setFilters((f) => ({ ...f, source: v }))} options={[['', tt('filter.all', 'Todas')], ...SOURCES.map((s) => [s, tt(`source.${s}`, s)])]} />
            <FilterSelect label={tt('filter.status', 'Estado')} value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={[['', tt('filter.all', 'Todos')], ['new', tt('status.new', 'Nuevas')], ['reviewed', tt('status.reviewed', 'Revisadas')], ['dismissed', tt('status.dismissed', 'Descartadas')]]} />
            <FilterSelect label={tt('filter.days', 'Días')} value={String(filters.days)} onChange={(v) => setFilters((f) => ({ ...f, days: Number(v) || 30 }))} options={[['7', '7d'], ['30', '30d'], ['90', '90d']]} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={btnSecondary} disabled={loading} data-testid="reputation-refresh">
              <RefreshCw size={12} /> {tt('actions.refresh', 'Refrescar')}
            </button>
            <button onClick={handleScan} style={btnPrimary} disabled={scanning} data-testid="reputation-scan-now">
              {scanning ? tt('actions.scanning', 'Escaneando…') : tt('actions.scanNow', 'Escanear ahora')}
            </button>
          </div>
        </div>
      </Card>

      {/* Trend chart */}
      {trend.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: CREAM, fontFamily: 'Playfair Display, serif', fontSize: 18, marginBottom: 12 }}>
            {tt('trend.title', 'Menciones diarias · últimos 7 días')}
          </h3>
          <TrendChart data={trend} />
        </Card>
      )}

      {/* Top negative */}
      {topNegative.length > 0 && (
        <Card style={{ marginBottom: 20, borderLeft: `3px solid ${NEG_COLOR}` }}>
          <h3 style={{ margin: 0, color: CREAM, fontFamily: 'Playfair Display, serif', fontSize: 18, marginBottom: 12 }}>
            {tt('topNegative.title', 'Top 5 menciones negativas')}
          </h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {topNegative.map((m, i) => (
              <div key={m.id || i} style={{ padding: 12, borderRadius: 12, background: PANEL_BG, border: `1px solid ${PANEL_BORDER}` }}>
                <div style={{ color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 13, marginBottom: 4 }}>
                  <strong>{m.title || tt('mention.noTitle', '(sin título)')}</strong>
                  {' · '}<span style={{ color: SUBTLE }}>{tt(`source.${m.source}`, m.source)}</span>
                </div>
                <div style={{ color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 12, marginBottom: 6 }}>
                  {m.snippet?.slice(0, 220)}{m.snippet?.length > 220 ? '…' : ''}
                </div>
                {m.url && (
                  <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6366F1', fontSize: 12, textDecoration: 'none' }}>
                    <ExternalLink size={12} /> {tt('actions.open', 'Abrir')}
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Mentions table */}
      <Card>
        <h3 style={{ margin: 0, color: CREAM, fontFamily: 'Playfair Display, serif', fontSize: 18, marginBottom: 14 }}>
          {tt('table.title', 'Menciones')} ({mentions.length})
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="reputation-mentions-table">
            <thead>
              <tr style={{ borderBottom: `1px solid ${PANEL_BORDER}` }}>
                <Th>{tt('col.date', 'Fecha')}</Th>
                <Th>{tt('col.source', 'Fuente')}</Th>
                <Th>{tt('col.sentiment', 'Sentimiento')}</Th>
                <Th>{tt('col.title', 'Título')}</Th>
                <Th>{tt('col.snippet', 'Extracto')}</Th>
                <Th>{tt('col.status', 'Estado')}</Th>
                <Th>{tt('col.actions', 'Acciones')}</Th>
              </tr>
            </thead>
            <tbody>
              {mentions.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 16, color: SUBTLE, fontFamily: 'DM Sans, sans-serif' }}>
                  {loading ? tt('loading', 'Cargando…') : tt('table.empty', 'Sin menciones en este rango. Corre un scan o ajusta filtros.')}
                </td></tr>
              )}
              {mentions.map((m) => {
                const sentColor = m.sentiment === 'positive' ? POS_COLOR : m.sentiment === 'negative' ? NEG_COLOR : NEU_COLOR;
                return (
                  <tr key={m.id} style={{ borderBottom: `1px solid ${PANEL_BORDER}` }}>
                    <Td>{m.found_at ? new Date(m.found_at).toLocaleDateString('es-MX') : '—'}</Td>
                    <Td>{tt(`source.${m.source}`, m.source)}</Td>
                    <Td><span style={{ color: sentColor, fontWeight: 600 }}>{tt(`sentiment.${m.sentiment}`, m.sentiment || '—')}</span></Td>
                    <Td>
                      {m.url ? (
                        <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ color: '#6366F1', textDecoration: 'none' }}>
                          {(m.title || tt('mention.noTitle', '(sin título)')).slice(0, 60)}
                        </a>
                      ) : (m.title || '—').slice(0, 60)}
                    </Td>
                    <Td style={{ maxWidth: 360 }}>
                      <span style={{ color: SUBTLE }}>{(m.snippet || '').slice(0, 120)}{(m.snippet || '').length > 120 ? '…' : ''}</span>
                    </Td>
                    <Td>{tt(`status.${m.status}`, m.status || 'new')}</Td>
                    <Td>
                      <button onClick={() => handleMark(m.id, 'reviewed')} disabled={busy[m.id] || m.status === 'reviewed'} style={btnIcon} title={tt('actions.markReviewed', 'Marcar revisada')} data-testid={`mark-reviewed-${m.id}`}>
                        <CheckCircle size={14} />
                      </button>
                      <button onClick={() => handleMark(m.id, 'dismissed')} disabled={busy[m.id] || m.status === 'dismissed'} style={{ ...btnIcon, marginLeft: 6, color: NEG_COLOR }} title={tt('actions.markDismissed', 'Descartar')} data-testid={`mark-dismissed-${m.id}`}>
                        <XCircle size={14} />
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Alerts history */}
      {alerts.length > 0 && (
        <Card style={{ marginTop: 20 }}>
          <h3 style={{ margin: 0, color: CREAM, fontFamily: 'Playfair Display, serif', fontSize: 18, marginBottom: 12 }}>
            {tt('alerts.title', 'Historial de alertas')}
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {alerts.map((a) => (
              <div key={a.id} style={{ padding: 10, borderRadius: 10, background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
                  {a.triggered_at ? new Date(a.triggered_at).toLocaleString('es-MX') : '—'}
                </span>
                <span style={{ color: NEG_COLOR, fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
                  {a.negative_count} {tt('alerts.negatives', 'negativas')} · {tt('alerts.threshold', 'umbral')}: {a.threshold}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </SuperadminLayout>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ padding: 14, borderRadius: 16, background: PANEL_BG, border: `1px solid ${PANEL_BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {icon}{label}
      </div>
      <div style={{ color: color || CREAM, fontFamily: 'Playfair Display, serif', fontSize: 26, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
      {sub != null && (
        <div style={{ color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 11, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '6px 10px', borderRadius: 9999, background: PANEL_BG,
          border: `1px solid ${PANEL_BORDER}`, color: CREAM,
          fontFamily: 'DM Sans, sans-serif', fontSize: 12, minWidth: 130,
        }}
      >
        {options.map(([v, l]) => <option key={v} value={v} style={{ background: '#0F1320', color: CREAM }}>{l}</option>)}
      </select>
    </label>
  );
}

function TrendChart({ data }) {
  if (!data || data.length === 0) return null;
  const W = 600, H = 120, P = 20;
  const max = Math.max(1, ...data.map((d) => d.count || 0));
  const step = (W - P * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = P + i * step;
    const y = H - P - ((d.count || 0) / max) * (H - P * 2);
    return [x, y, d];
  });
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: 160 }}>
      <path d={path} fill="none" stroke="#6366F1" strokeWidth="2" />
      {points.map(([x, y, d], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3" fill="#6366F1" />
          <text x={x} y={H - 4} textAnchor="middle" fontSize="9" fill={SUBTLE}>
            {d.date?.slice(5)}
          </text>
          <text x={x} y={y - 6} textAnchor="middle" fontSize="9" fill={CREAM}>{d.count}</text>
        </g>
      ))}
    </svg>
  );
}

const Th = ({ children }) => (
  <th style={{ padding: '10px 8px', textAlign: 'left', color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>
    {children}
  </th>
);

const Td = ({ children, style }) => (
  <td style={{ padding: '10px 8px', color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 13, verticalAlign: 'top', ...style }}>
    {children}
  </td>
);

const btnSecondary = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 14px', borderRadius: 9999, background: PANEL_BG,
  border: `1px solid ${PANEL_BORDER}`, color: CREAM,
  fontFamily: 'DM Sans, sans-serif', fontSize: 12, cursor: 'pointer',
};

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 14px', borderRadius: 9999,
  background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
  border: 'none', color: '#FFFFFF',
  fontFamily: 'DM Sans, sans-serif', fontSize: 12, cursor: 'pointer',
};

const btnIcon = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 6, borderRadius: 9999, background: PANEL_BG,
  border: `1px solid ${PANEL_BORDER}`, color: CREAM, cursor: 'pointer',
};

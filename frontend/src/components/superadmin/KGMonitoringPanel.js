/**
 * W5.12 Parte 2 — Tab Monitoring: KPIs + charts + health checks.
 * Auto-refresh 60s. Banner si KG_AVAILABLE=false.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, AlertTriangle, CheckCircle2, Clock, Cpu, Database, Layers, RefreshCw, Zap } from 'lucide-react';
import { getKgHealth, getKgStats, triggerKgRebuild } from '../../api/knowledge_graph';

const cardStyle = {
  background: 'rgba(13,16,23,0.92)',
  backdropFilter: 'blur(24px)',
  border: '1px solid var(--border, rgba(255,255,255,0.08))',
  borderRadius: 16,
  padding: '18px 22px',
};

function KpiCard({ label, value, sub, Icon, color = 'var(--cream, #F0EBE0)', testid }) {
  return (
    <div data-testid={testid} style={{ ...cardStyle, flex: '1 1 180px', minWidth: 160 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {Icon && <Icon size={14} color={color} />}
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3, rgba(240,235,224,0.55))', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3, rgba(240,235,224,0.55))', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function PillBtn({ children, onClick, kind = 'ghost', disabled, testid }) {
  const palettes = {
    primary: { background: 'linear-gradient(90deg, var(--theme, #7c2fff), var(--theme-2, #c026d3))', color: '#fff', border: '1px solid transparent' },
    ghost:   { background: 'rgba(255,255,255,0.04)', color: 'var(--cream-2, #d6d2c4)', border: '1px solid var(--border, rgba(255,255,255,0.10))' },
  };
  const p = palettes[kind] || palettes.ghost;
  return (
    <button
      data-testid={testid} onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 18px', borderRadius: 9999,
        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        ...p,
      }}>{children}</button>
  );
}

export default function KGMonitoringPanel() {
  const { t } = useTranslation();
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [healthHistory, setHealthHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    const [h, s] = await Promise.all([getKgHealth(), getKgStats()]);
    const ts = new Date().toISOString();
    if (h.ok && h.body) setHealth(h.body);
    else setHealth({ connected: false, kg_available: false, error: h.body?.detail || 'no response' });
    if (s.ok && s.body) setStats(s.body);
    else setStats(null);

    setHealthHistory(prev => [
      ...(prev.slice(-9)),
      { ts, ok: !!(h.body?.connected), ping: h.body?.last_ping_ms ?? null },
    ]);
    setLastUpdated(ts);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 60000);
    return () => clearInterval(id);
  }, []);

  const kgAvailable = !!(health?.kg_available);

  const handleRebuild = async () => {
    setBusy(true);
    const r = await triggerKgRebuild();
    setBusy(false);
    if (r.ok) loadAll();
  };

  const lineData = (healthHistory || []).map((h, i) => ({
    idx: i + 1,
    ping: h.ping ?? 0,
    ok: h.ok ? 1 : 0,
  }));

  const nodeBars = stats?.nodes
    ? Object.entries(stats.nodes).map(([k, v]) => ({ name: k, count: v }))
    : [];

  return (
    <div data-testid="kg-tab-monitoring" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!kgAvailable && (
        <div data-testid="kg-banner-unavailable" style={{
          ...cardStyle, display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.25)',
        }}>
          <AlertTriangle size={16} color="#fcd34d" />
          <div style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 13, color: '#fcd34d' }}>
            {t('knowledge_graph.banner.kg_unavailable', 'Neo4j no disponible. Arranca el servicio con')}{' '}
            <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, fontFamily: 'DM Mono, monospace' }}>
              docker compose up neo4j
            </code>{' '}
            {t('knowledge_graph.banner.kg_unavailable_tail', 'y verifica las credenciales en .env')}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <PillBtn onClick={loadAll} disabled={loading} testid="monitoring-refresh-btn">
          <RefreshCw size={11} /> {t('knowledge_graph.actions.refresh', 'Recargar')}
        </PillBtn>
        <PillBtn kind="primary" onClick={handleRebuild} disabled={busy || !kgAvailable} testid="monitoring-rebuild-btn">
          <Zap size={11} /> {busy ? t('knowledge_graph.loading', 'Cargando...') : t('knowledge_graph.actions.trigger_rebuild', 'Disparar rebuild')}
        </PillBtn>
        {lastUpdated && (
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3, rgba(240,235,224,0.55))' }}>
            {t('knowledge_graph.last_updated', 'Actualizado')}: {new Date(lastUpdated).toLocaleTimeString('es-MX')}
          </span>
        )}
      </div>

      <div data-testid="kg-kpi-strip" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label={t('knowledge_graph.kpi.total_nodes', 'Nodos totales')} value={stats?.total_nodes ?? '—'} Icon={Layers} color="#c4b5fd" testid="kpi-total-nodes" />
        <KpiCard label={t('knowledge_graph.kpi.total_edges', 'Edges totales')} value={stats?.total_edges ?? '—'} Icon={Activity} color="#a5b4fc" testid="kpi-total-edges" />
        <KpiCard label={t('knowledge_graph.kpi.queries_24h', 'Queries 24h')} value={stats?.queries_24h ?? '—'} Icon={Database} color="#86efac" testid="kpi-queries-24h" />
        <KpiCard label={t('knowledge_graph.kpi.avg_latency', 'Latencia avg')} value={stats?.avg_latency_ms != null ? `${stats.avg_latency_ms} ms` : '—'} Icon={Cpu} color="#fcd34d" testid="kpi-latency" />
        <KpiCard label={t('knowledge_graph.kpi.uptime', 'Neo4j')} value={kgAvailable ? 'UP' : 'DOWN'} Icon={kgAvailable ? CheckCircle2 : AlertTriangle} color={kgAvailable ? '#86efac' : '#fda4af'} sub={health?.version || (health?.error ? String(health.error).slice(0, 80) : '')} testid="kpi-uptime" />
        <KpiCard label={t('knowledge_graph.kpi.last_rebuild', 'Ultimo rebuild')} value={stats?.last_rebuild?.timestamp ? new Date(stats.last_rebuild.timestamp).toLocaleString('es-MX') : '—'} Icon={Clock} color="#94a3b8" testid="kpi-last-rebuild" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream, #F0EBE0)', marginBottom: 12 }}>
            {t('knowledge_graph.chart.ping_history', 'Health checks · ultimos 10 (ping ms)')}
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="idx" stroke="rgba(240,235,224,0.45)" fontSize={10} />
                <YAxis stroke="rgba(240,235,224,0.45)" fontSize={10} />
                <Tooltip contentStyle={{ background: '#0a0e16', border: '1px solid rgba(255,255,255,0.10)', fontFamily: 'DM Sans', fontSize: 12 }} />
                <Line type="monotone" dataKey="ping" stroke="#c4b5fd" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream, #F0EBE0)', marginBottom: 12 }}>
            {t('knowledge_graph.chart.nodes_by_type', 'Nodos por tipo')}
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={nodeBars}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="rgba(240,235,224,0.45)" fontSize={9} angle={-25} textAnchor="end" interval={0} height={50} />
                <YAxis stroke="rgba(240,235,224,0.45)" fontSize={10} />
                <Tooltip contentStyle={{ background: '#0a0e16', border: '1px solid rgba(255,255,255,0.10)', fontFamily: 'DM Sans', fontSize: 12 }} />
                <Bar dataKey="count" fill="#7c2fff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={cardStyle} data-testid="kg-health-history">
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream, #F0EBE0)', marginBottom: 12 }}>
          {t('knowledge_graph.health_history', 'Ultimas verificaciones')}
        </div>
        {(healthHistory || []).length === 0 ? (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, rgba(240,235,224,0.55))' }}>—</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {healthHistory.slice(-10).map((h, i) => (
              <span key={i} title={`${h.ts} · ${h.ping ?? '—'}ms`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 9999,
                background: h.ok ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
                border: `1px solid ${h.ok ? 'rgba(34,197,94,0.30)' : 'rgba(239,68,68,0.30)'}`,
                color: h.ok ? '#86efac' : '#fda4af',
                fontFamily: 'DM Mono, monospace', fontSize: 10,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 9999, background: h.ok ? '#22c55e' : '#ef4444' }} />
                {new Date(h.ts).toLocaleTimeString('es-MX')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

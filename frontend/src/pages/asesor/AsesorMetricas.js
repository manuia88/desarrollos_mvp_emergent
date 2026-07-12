/**
 * Phase 4 Batch 20 · /asesor/metricas — Mi Performance.
 *
 * KPIs strip · ranking card · sparkline conversion 90d · health · filter chips.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader } from '../../components/advisor/primitives';
import { FilterChipsBar } from '../../components/shared/FilterChipsBar';
import HealthScoreWidget from '../../components/shared/HealthScoreWidget';
import SmartEmptyState from '../../components/shared/SmartEmptyState';
import AsesorDailyFeed from '../../components/asesor/AsesorDailyFeed';
import {
  getAsesorMetrics, getAsesorTimeseries, getAsesorTeamMetrics,
} from '../../api/metrics';

const fmtMXN = (v) => {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
};
const fmtNum = (v, dec = 0) =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: dec }).format(v ?? 0);

const PERIOD_FILTERS = [{
  key: 'period', label: 'Periodo',
  options: [
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: '90d', label: '90 días' },
  ],
}];

function Sparkline({ data, color = 'var(--cream)', h = 60 }) {
  if (!data?.length) return null;
  const w = 360;
  const xs = data.map((_, i) => (i / Math.max(1, data.length - 1)) * w);
  const max = Math.max(...data.map(d => d.value));
  const min = Math.min(...data.map(d => d.value));
  const range = (max - min) || 1;
  const points = xs.map((x, i) =>
    `${x},${h - ((data[i].value - min) / range) * h}`).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

function KPI({ label, value, testId, sub }) {
  return (
    <div data-testid={testId} style={{
      padding: 14, borderRadius: 12,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      backdropFilter: 'blur(24px)',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--cream-3)', marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, color: 'var(--cream)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const API = process.env.REACT_APP_BACKEND_URL || '';
function authHeaders() {
  // Seguridad: la cookie httponly (access_token) autentica vía credentials:'include'.
  // Ya no se lee el token de localStorage (vector XSS).
  return {};
}
const OBJ_LABEL = { precio: 'Precio', ubicacion: 'Ubicación', financiamiento: 'Financiamiento', tiempo: 'No es el momento', competencia: 'Comparando', duda: 'Dudas' };

export default function AsesorMetricas({ user, onLogout }) {
  const [period, setPeriod] = useState('30d');
  const [metrics, setMetrics] = useState(null);
  const [team, setTeam] = useState(null);
  const [series, setSeries] = useState(null);
  const [copilot, setCopilot] = useState(null);   // cierre de ciclo · métricas del Copiloto del asesor
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      const [m, t, ts, cp] = await Promise.all([
        getAsesorMetrics(period),
        getAsesorTeamMetrics(period).catch(() => null),
        getAsesorTimeseries(user?.user_id || 'me', '90d').catch(() => null),
        fetch(`${API}/api/asesor/copilot/metrics?days=${days}`, { headers: authHeaders(), credentials: 'include' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      setMetrics(m);
      setTeam(t);
      setSeries(ts);
      setCopilot(cp);
    } finally {
      setLoading(false);
    }
  }, [period, user?.user_id]);

  useEffect(() => { load(); }, [load]);

  const myRank = useMemo(() => {
    if (!team?.asesores || !user?.user_id) return null;
    const idx = team.asesores.findIndex(r => r.asesor_id === user.user_id);
    if (idx < 0) return null;
    return { rank: idx + 1, total: team.asesores.length,
              vs_avg: team.asesores[idx].vs_team_avg_pct };
  }, [team, user?.user_id]);

  const isEmpty = !loading && metrics
    && metrics.leads_active === 0
    && metrics.citas_booked_30d === 0
    && metrics.activity_score_7d === 0;

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="MÉTRICAS · MI PERFORMANCE"
        title="Mi panel de rendimiento"
        sub="Pipeline, conversión, tiempo de respuesta y posición en el equipo."
      />

      {/* Phase 4 Batch 34 — Tu día hoy smart feed */}
      <AsesorDailyFeed user={user} />

      <div data-testid="asesor-metrics-filters" style={{ marginBottom: 16 }}>
        <FilterChipsBar
          filters_config={PERIOD_FILTERS}
          current_state={{ period }}
          on_change={(k, v) => k === 'period' && setPeriod(v || '30d')}
          sync_url={true}
        />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>
          Cargando métricas…
        </div>
      ) : isEmpty ? (
        <SmartEmptyState
          contextKey="suggestions.none"
          testId="asesor-metricas-empty"
          overrides={{
            title: 'Sin métricas todavía',
            body: 'Tu primer lead activará el dashboard. Comparte tu link público o crea uno desde "Mis links" para empezar.',
            ctas: [{ label: 'Crear link', key: 'create_link',
                      href: '/asesor/links', testId: 'metricas-cta-create-link', primary: true }],
          }}
        />
      ) : metrics && (
        <>
          {/* KPIs strip */}
          <div data-testid="asesor-kpis-strip" style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))',
            gap: 10, marginBottom: 16,
          }}>
            <KPI testId="kpi-pipeline" label="Pipeline" value={fmtMXN(metrics.pipeline_value_mxn)} />
            <KPI testId="kpi-leads-active" label="Leads activos" value={fmtNum(metrics.leads_active)} />
            <KPI testId="kpi-conversion" label={`Conv. ${period}`} value={`${fmtNum(metrics.conversion_rate_pct, 1)}%`} />
            <KPI testId="kpi-response" label="Respuesta" value={`${fmtNum(metrics.response_time_hours, 1)}h`} />
            <KPI testId="kpi-citas" label="Citas booked" value={fmtNum(metrics.citas_booked_30d)} />
          </div>

          {/* Position card */}
          {myRank && (
            <div data-testid="asesor-rank-card" style={{
              padding: 18, borderRadius: 14, marginBottom: 16,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              backdropFilter: 'blur(24px)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 12, fontFamily: 'DM Sans',
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--cream-3)', letterSpacing: '0.08em',
                                textTransform: 'uppercase', marginBottom: 6 }}>
                  Posición en el equipo
                </div>
                <div style={{ fontFamily: 'Outfit', fontSize: 24, fontWeight: 800, color: 'var(--cream)' }}>
                  #{myRank.rank} <span style={{ fontSize: 14, color: 'var(--cream-3)', fontWeight: 500 }}>de {myRank.total}</span>
                </div>
              </div>
              <div data-testid="vs-avg-badge" style={{
                padding: '6px 14px', borderRadius: 9999,
                background: myRank.vs_avg >= 0 ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                color: myRank.vs_avg >= 0 ? '#22c55e' : '#ef4444',
                fontWeight: 600, fontSize: 13,
              }}>
                {myRank.vs_avg >= 0 ? '+' : ''}{fmtNum(myRank.vs_avg, 1)}% vs equipo
              </div>
              <HealthScoreWidget
                entity_type="asesor"
                entity_id={user?.user_id}
                size="sm"
                initialScore={metrics.health_score}
              />
            </div>
          )}

          {/* Sparkline 90d */}
          {series?.series?.conversion_rate?.length > 0 && (
            <div data-testid="asesor-sparkline-card" style={{
              padding: 16, borderRadius: 14,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              fontFamily: 'DM Sans',
            }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                              color: 'var(--cream-3)', marginBottom: 8 }}>
                Conversión · últimos 90 días
              </div>
              <Sparkline data={series.series.conversion_rate} color="#a5b4fc" />
            </div>
          )}

          {/* Cierre de ciclo · Tu Copiloto (vista global, no por-conversación) */}
          {copilot && (copilot.used > 0 || (copilot.top_objeciones || []).length > 0) && (
            <div style={{ marginTop: 18, padding: 18, borderRadius: 14, background: 'rgba(109,74,255,0.05)', border: '1px solid rgba(109,74,255,0.18)', fontFamily: 'DM Sans' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>✨ Tu Copiloto · {period === '7d' ? 'últimos 7 días' : period === '90d' ? 'últimos 90 días' : 'últimos 30 días'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--cream)' }}>{copilot.used || 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>sugerencias usadas</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: (copilot.response_rate || 0) >= 0.5 ? '#4ADE80' : 'var(--cream)' }}>{Math.round((copilot.response_rate || 0) * 100)}%</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>respuesta positiva</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--cream)' }}>{copilot.positive || 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>respuestas logradas</div>
                </div>
              </div>
              {(copilot.top_objeciones || []).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--cream-3)', marginBottom: 7 }}>Objeciones más frecuentes de tus leads</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {copilot.top_objeciones.map((o) => (
                      <span key={o.type} style={{ fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'rgba(242,99,91,0.12)', color: '#F2635B' }}>{OBJ_LABEL[o.type] || o.type} · {o.count}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </AdvisorLayout>
  );
}

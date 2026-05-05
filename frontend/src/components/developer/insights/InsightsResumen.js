/**
 * Phase 4 Batch 22 — InsightsResumen sub-tab.
 * KPIs · Health score · Trend 30d · Narrativa Haiku.
 */
import React, { useEffect, useState } from 'react';
import { getInsightsResumen } from '../../../api/insights';
import HealthScore from '../../shared/HealthScore';
import { Activity, TrendUp, TrendDown } from '../../icons';

const fmtMXN = (v) => {
  if (!v || v === 0) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

function KPICard({ label, value, sub, testid }) {
  return (
    <div data-testid={testid} style={{
      background: 'rgba(240,235,224,0.04)',
      border: '1px solid rgba(240,235,224,0.10)',
      borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
        color: 'var(--cream-3)', fontFamily: 'DM Sans, sans-serif',
      }}>{label}</span>
      <span style={{
        fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--cream)',
      }}>{value}</span>
      {sub && (
        <span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans, sans-serif' }}>{sub}</span>
      )}
    </div>
  );
}

function TrendSparkline({ trend = [] }) {
  if (!trend.length) {
    return <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>Sin histórico aún.</div>;
  }
  const W = 360, H = 80, padX = 6, padY = 8;
  const vals = trend.map(t => t.value || 0);
  const maxV = Math.max(...vals, 100);
  const minV = Math.min(...vals, 0);
  const range = maxV - minV || 1;
  const xs = trend.map((_, i) =>
    padX + (i * (W - padX * 2)) / Math.max(trend.length - 1, 1));
  const yFor = v => H - padY - ((v - minV) / range) * (H - padY * 2);
  const path = trend.map((t, i) =>
    `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${yFor(t.value).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 80, display: 'block' }}
         data-testid="resumen-trend">
      <path d={path} fill="none" stroke="#EC4899" strokeWidth="1.6" />
      {trend.map((t, i) => (
        <circle key={i} cx={xs[i]} cy={yFor(t.value)} r={1.6} fill="#EC4899" />
      ))}
    </svg>
  );
}

export default function InsightsResumen({ projectId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    getInsightsResumen(projectId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) return (
    <div data-testid="resumen-loading" style={{ padding: 36, textAlign: 'center', color: 'var(--cream-3)' }}>
      Cargando resumen…
    </div>
  );
  if (err) return (
    <div data-testid="resumen-error" style={{ padding: 24, color: '#fca5a5' }}>
      Error: {err}
    </div>
  );
  if (!data) return null;

  const k = data.kpis || {};
  const trend7 = data.trend_7d || 0;
  const TrendIcon = trend7 >= 0 ? TrendUp : TrendDown;
  const trendColor = trend7 >= 0 ? '#22c55e' : '#f87171';

  return (
    <div data-testid="resumen-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs grid */}
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        <KPICard testid="kpi-units-sold"
          label="Unidades vendidas"
          value={`${k.units_sold || 0} / ${k.units_total || 0}`}
          sub={k.units_total ? `${Math.round((k.units_sold / k.units_total) * 100)}% absorción` : '—'} />
        <KPICard testid="kpi-leads-30d" label="Leads (30d)" value={k.leads_30d || 0} />
        <KPICard testid="kpi-conversion" label="Conversión" value={`${k.conversion_pct || 0}%`} />
        <KPICard testid="kpi-days-listed" label="Días listado" value={k.days_listed || 0} />
        <KPICard testid="kpi-gmv" label="GMV cerrado" value={fmtMXN(k.gmv || 0)} />
      </div>

      {/* Health + trend row */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 2fr' }}>
        <div data-testid="resumen-health" style={{
          background: 'rgba(240,235,224,0.04)',
          border: '1px solid rgba(240,235,224,0.10)',
          borderRadius: 14, padding: 14,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <HealthScore score={data.health_score || 0} size="md" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>Health Score</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit' }}>
              {data.health_score || 0}/100
            </span>
            <span style={{ fontSize: 11, color: trendColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <TrendIcon size={11} /> {trend7 > 0 ? '+' : ''}{trend7} en 7 días
            </span>
          </div>
        </div>

        <div style={{
          background: 'rgba(240,235,224,0.04)',
          border: '1px solid rgba(240,235,224,0.10)',
          borderRadius: 14, padding: 14,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
            color: 'var(--cream-3)', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6,
          }}>
            <Activity size={11} /> Tendencia 30d
          </div>
          <TrendSparkline trend={data.trend_30d || []} />
        </div>
      </div>

      {/* Narrative */}
      <div data-testid="resumen-narrative" style={{
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.20)',
        borderRadius: 14, padding: 16,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
          color: '#a5b4fc', marginBottom: 8,
        }}>Resumen ejecutivo · IA</div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--cream-2)', fontFamily: 'DM Sans, sans-serif' }}>
          {data.summary_text || 'Sin resumen disponible.'}
        </p>
      </div>
    </div>
  );
}

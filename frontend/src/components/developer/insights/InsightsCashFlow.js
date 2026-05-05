/**
 * Phase 4 Batch 22 — InsightsCashFlow sub-tab.
 * Wrapper compacto del Cash Flow Forecast (B8). Reusa endpoints de developer.js.
 * Para el reporte completo, link a la página dedicada.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as devApi from '../../../api/developer';
import { ArrowRight, BarChart } from '../../icons';

const fmtM = (v) => {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
};

function MiniChart({ series = [] }) {
  if (!series.length) return null;
  const W = 720, H = 180, padX = 32, padY = 14;
  const xs = series.map((_s, i) =>
    padX + (i * (W - padX * 2)) / Math.max(series.length - 1, 1));
  const all = series.flatMap(s => [s.inflow_total, s.outflow_total, s.cumulative_balance]);
  const maxV = Math.max(...all, 0);
  const minV = Math.min(...all, 0);
  const range = maxV - minV || 1;
  const yFor = v => H - padY - ((v - minV) / range) * (H - padY * 2);
  const path = (key) => series.map((s, i) =>
    `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${yFor(s[key]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 180, display: 'block' }}
         data-testid="cf-mini-chart">
      <line x1={padX} y1={yFor(0)} x2={W - padX} y2={yFor(0)}
            stroke="rgba(240,235,224,0.18)" strokeWidth="1" strokeDasharray="3,3" />
      <path d={path('inflow_total')} fill="none" stroke="#22C55E" strokeWidth="1.4" />
      <path d={path('outflow_total')} fill="none" stroke="#EF4444" strokeWidth="1.4" />
      <path d={path('cumulative_balance')} fill="none" stroke="#EC4899" strokeWidth="2" />
    </svg>
  );
}

function StatBox({ label, value, sub, tone = 'neutral', testid }) {
  const colors = {
    ok:   '#22c55e',
    warn: '#f59e0b',
    bad:  '#f87171',
    neutral: 'var(--cream)',
  };
  return (
    <div data-testid={testid} style={{
      background: 'rgba(240,235,224,0.04)',
      border: '1px solid rgba(240,235,224,0.10)',
      borderRadius: 12, padding: 12,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
        color: 'var(--cream-3)', fontFamily: 'DM Sans, sans-serif',
      }}>{label}</span>
      <div style={{
        fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, color: colors[tone] || 'var(--cream)', marginTop: 2,
      }}>{value}</div>
      {sub && <span style={{ fontSize: 10.5, color: 'var(--cream-3)' }}>{sub}</span>}
    </div>
  );
}

export default function InsightsCashFlow({ projectId }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    devApi.getCashFlowCurrent(projectId)
      .then(d => { if (!cancelled) setDoc(d); })
      .catch(e => {
        if (cancelled) return;
        if ((e.message || '').includes('404')) setDoc(null);
        else setErr(e.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) return (
    <div data-testid="cashflow-loading" style={{ padding: 24, color: 'var(--cream-3)' }}>
      Cargando flujo de caja…
    </div>
  );

  if (err) return (
    <div data-testid="cashflow-error" style={{ padding: 16, color: '#fca5a5' }}>Error: {err}</div>
  );

  if (!doc) return (
    <div data-testid="cashflow-empty" style={{
      padding: 36, textAlign: 'center',
      background: 'rgba(240,235,224,0.04)',
      border: '1px solid rgba(240,235,224,0.10)',
      borderRadius: 14,
    }}>
      <BarChart size={26} color="#f9a8d4" />
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginTop: 10 }}>
        Aún no hay forecast calculado
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--cream-2)', maxWidth: 420, margin: '6px auto 14px' }}>
        Genera tu primer reporte de flujo de caja con escenarios IA.
      </p>
      <Link
        to={`/desarrollador/cash-flow/${projectId}`}
        data-testid="cashflow-go-full"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 9999,
          background: 'linear-gradient(90deg, #6366F1, #EC4899)',
          color: '#fff', textDecoration: 'none',
          fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600,
        }}>
        Abrir Cash Flow completo <ArrowRight size={11} />
      </Link>
    </div>
  );

  const series = doc.series || [];
  const summary = doc.summary || {};
  const breakeven = summary.breakeven_month
    ? `Mes ${summary.breakeven_month}`
    : (summary.total_balance >= 0 ? 'Ya' : 'Fuera horizonte');

  return (
    <div data-testid="cashflow-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      }}>
        <StatBox testid="cf-mini-revenue" label="Revenue" value={fmtM(summary.total_revenue_projected || 0)} sub={`${doc.horizon_months || 18}m`} tone="ok" />
        <StatBox testid="cf-mini-costs" label="Costos" value={fmtM(summary.total_costs || 0)} sub="ops + obra" tone="bad" />
        <StatBox testid="cf-mini-breakeven" label="Breakeven" value={breakeven} tone={summary.breakeven_month && summary.breakeven_month <= 12 ? 'ok' : 'warn'} />
        <StatBox testid="cf-mini-gap"
          label="Gap mayor"
          value={summary.biggest_gap ? fmtM(summary.biggest_gap.amount) : 'Sin gaps'}
          sub={summary.biggest_gap ? `mes ${summary.biggest_gap.month}` : '—'}
          tone={summary.biggest_gap ? 'bad' : 'ok'} />
      </div>

      <div style={{
        background: 'rgba(240,235,224,0.04)',
        border: '1px solid rgba(240,235,224,0.10)',
        borderRadius: 14, padding: 14,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
          color: 'var(--cream-3)', marginBottom: 8,
        }}>Forecast · escenario base</div>
        <MiniChart series={series} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <Link
            to={`/desarrollador/cash-flow/${projectId}`}
            data-testid="cashflow-link-full"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 9999,
              background: 'transparent',
              border: '1px solid rgba(240,235,224,0.16)',
              color: 'var(--cream-2)', textDecoration: 'none',
              fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 600,
            }}>
            Ver reporte completo <ArrowRight size={10} />
          </Link>
        </div>
      </div>
    </div>
  );
}

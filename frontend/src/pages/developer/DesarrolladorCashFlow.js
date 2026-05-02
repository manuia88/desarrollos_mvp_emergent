/**
 * DesarrolladorCashFlow — Phase 4 Batch 8 · 4.24
 * Investor-grade cash-flow forecast page for a project.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmt0 } from '../../components/advisor/primitives';
import {
  Sparkle, Activity, Download, AlertTriangle, BarChart, TrendUp, TrendDown, Check, Clock,
} from '../../components/icons';
import * as api from '../../api/developer';

const SCENARIO_TONE = {
  pesimista: 'rgba(239,68,68,0.10)',
  base: 'rgba(99,102,241,0.10)',
  optimista: 'rgba(34,197,94,0.10)',
};
const SCENARIO_BORDER = {
  pesimista: 'rgba(239,68,68,0.32)',
  base: 'rgba(99,102,241,0.34)',
  optimista: 'rgba(34,197,94,0.34)',
};

const SEVERITY_TONE = {
  none: { bg: 'transparent', label: '—' },
  mild: { bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.40)', label: 'Mild' },
  moderate: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.42)', label: 'Moderate' },
  critical: { bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.62)', label: 'Crítico' },
};

const PRIORITY_TONE = { critical: 'bad', high: 'brand', medium: 'neutral' };

function formatM(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

function CashFlowChart({ series }) {
  if (!series || series.length === 0) return null;
  const W = 720;
  const H = 240;
  const padX = 40, padY = 20;
  const xs = series.map((_s, i) => padX + (i * (W - padX * 2)) / Math.max(series.length - 1, 1));
  const allValues = series.flatMap(s => [s.inflow_total, s.outflow_total, s.cumulative_balance]);
  const maxV = Math.max(...allValues, 0);
  const minV = Math.min(...allValues, 0);
  const range = maxV - minV || 1;
  const yFor = v => H - padY - ((v - minV) / range) * (H - padY * 2);

  const pathFor = (key, color) => series.map((s, i) =>
    `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${yFor(s[key]).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 240, display: 'block' }} data-testid="cf-chart">
      {/* Grid */}
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={padX} y1={padY + (H - padY * 2) * p} x2={W - padX} y2={padY + (H - padY * 2) * p}
              stroke="rgba(240,235,224,0.08)" strokeWidth="1" />
      ))}
      <line x1={padX} y1={yFor(0)} x2={W - padX} y2={yFor(0)} stroke="rgba(240,235,224,0.18)" strokeWidth="1" strokeDasharray="3,3" />
      {/* Inflow line green */}
      <path d={pathFor('inflow_total')} fill="none" stroke="#22C55E" strokeWidth="1.6" />
      {/* Outflow red */}
      <path d={pathFor('outflow_total')} fill="none" stroke="#EF4444" strokeWidth="1.6" />
      {/* Cumulative balance pink */}
      <path d={pathFor('cumulative_balance')} fill="none" stroke="#EC4899" strokeWidth="2" />
      {/* X-axis labels (every 3 months) */}
      {series.map((s, i) => i % 3 === 0 && (
        <text key={i} x={xs[i]} y={H - 4} textAnchor="middle" fontSize="9"
              fill="rgba(240,235,224,0.6)" fontFamily="DM Sans">M{s.month}</text>
      ))}
      {/* Legend */}
      <g transform={`translate(${padX}, 4)`}>
        {[['#22C55E', 'Inflow'], ['#EF4444', 'Outflow'], ['#EC4899', 'Acumulado']].map(([c, l], i) => (
          <g key={l} transform={`translate(${i * 80}, 0)`}>
            <line x1={0} y1={6} x2={14} y2={6} stroke={c} strokeWidth="2" />
            <text x={18} y={9} fontSize="10" fill="var(--cream-2)" fontFamily="DM Sans">{l}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function StatCard({ eyebrow, value, sub, tone = 'neutral', testid }) {
  const colorMap = { ok: '#86efac', warn: '#fcd34d', bad: '#fca5a5', brand: '#f9a8d4', neutral: 'var(--cream)' };
  return (
    <Card data-testid={testid}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: colorMap[tone] || colorMap.neutral }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 3 }}>{sub}</div>}
    </Card>
  );
}

function ScenarioMini({ scn, active }) {
  const s = scn.summary || {};
  return (
    <Card data-testid={`cf-scn-${scn.label}`} style={{
      background: SCENARIO_TONE[scn.label] || 'rgba(240,235,224,0.04)',
      border: `1px solid ${active ? SCENARIO_BORDER[scn.label] : 'var(--border)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div className="eyebrow" style={{ textTransform: 'capitalize' }}>{scn.label}</div>
        {active && <Badge tone="brand">Activo</Badge>}
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>
        {formatM(s.total_balance)}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
        Balance · breakeven mes {s.breakeven_month || '—'} · {s.gap_count || 0} gaps
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', lineHeight: 1.45,
                  margin: '8px 0 0', borderLeft: '2px solid rgba(236,72,153,0.4)', paddingLeft: 8 }}>
        {scn.narrative}
      </p>
    </Card>
  );
}

function GapAlertCard({ gap, idx }) {
  const tone = SEVERITY_TONE[gap.gap_severity] || SEVERITY_TONE.mild;
  return (
    <div data-testid={`cf-gap-${idx}`} style={{
      padding: 12, background: tone.bg, border: `1px solid ${tone.border || 'var(--border)'}`, borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={13} color={tone.border} />
        <div className="eyebrow">{gap.gap_severity.toUpperCase()} · MES {gap.month}</div>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', marginTop: 6 }}>
        Cumulative: <b>{formatM(gap.cumulative_balance)}</b> · Balance del mes: <b>{formatM(gap.monthly_balance)}</b>
      </div>
    </div>
  );
}

function RecommendationCard({ rec, idx, projectId, isApplied, onApplied }) {
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    try {
      await api.applyCashFlowRecommendation(projectId, { recommendation_index: idx, note: null });
      if (onApplied) onApplied(idx);
    } catch (e) { /* noop */ }
    setBusy(false);
  };
  return (
    <Card data-testid={`cf-rec-${idx}`} style={{
      borderLeft: `3px solid ${rec.priority === 'critical' ? '#EF4444' : rec.priority === 'high' ? '#EC4899' : 'rgba(240,235,224,0.3)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <Badge tone={PRIORITY_TONE[rec.priority] || 'neutral'}>{rec.priority}</Badge>
        <div className="eyebrow" style={{ textTransform: 'uppercase' }}>{(rec.category || '').replace(/_/g, ' ')}</div>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 6 }}>
        {rec.title}
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5, margin: 0 }}>
        {rec.detail}
      </p>
      {rec.estimated_impact_mxn && (
        <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 11.5, color: '#86efac' }}>
          Impacto estimado: {formatM(rec.estimated_impact_mxn)}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        {isApplied ? (
          <Badge tone="ok" data-testid={`cf-rec-applied-${idx}`}><Check size={10} /> Aplicada</Badge>
        ) : (
          <button data-testid={`cf-rec-apply-${idx}`} onClick={apply} disabled={busy} style={{
            padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--cream-2)',
            fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
          }}>{busy ? 'Aplicando…' : 'Marcar como aplicada'}</button>
        )}
      </div>
    </Card>
  );
}

export default function DesarrolladorCashFlow({ user, onLogout }) {
  const { slug } = useParams();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalcing, setRecalcing] = useState(false);
  const [scenario, setScenario] = useState('base');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await api.getCashFlowCurrent(slug);
      setDoc(d);
    } catch (e) {
      if ((e.message || '').includes('404')) setDoc(null);
      else setError(e.message);
    }
    setLoading(false);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  const recalc = async () => {
    setRecalcing(true); setError(null);
    try {
      await api.recalcCashFlow(slug, { horizon_months: 18 });
      await load();
    } catch (e) {
      setError(e.message || 'Error al recalcular');
    }
    setRecalcing(false);
  };

  const exportPdf = async () => {
    try {
      const r = await api.exportCashFlowPdf(slug);
      window.open(api.cashFlowDownloadUrl(slug, r.file_id), '_blank');
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('No se pudo exportar PDF');
    }
  };

  // Pick series based on selected scenario
  const activeScenario = useMemo(() => {
    if (!doc) return null;
    if (scenario === 'base') return doc; // base is the doc itself
    return (doc.scenarios || []).find(s => s.label === scenario) || null;
  }, [doc, scenario]);

  const series = activeScenario?.series || doc?.series || [];
  const summary = activeScenario?.summary || doc?.summary || {};
  const gaps = (series || []).filter(s => s.gap_severity !== 'none').slice(0, 6);

  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin'
    || user?.internal_role === 'admin';
  const appliedSet = new Set((doc?.applied_recommendations || []).map(a => a.recommendation_index));

  if (loading) {
    return (
      <DeveloperLayout user={user} onLogout={onLogout}>
        <Card style={{ padding: 36, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando forecast…</Card>
      </DeveloperLayout>
    );
  }

  if (!doc) {
    return (
      <DeveloperLayout user={user} onLogout={onLogout}>
        <PageHeader eyebrow="4.24 · CASH FLOW FORECAST IA" title="Flujo de Caja" sub="Aún no hay forecast calculado para este proyecto." />
        <Card style={{ padding: 36, textAlign: 'center' }}>
          <BarChart size={26} color="#f9a8d4" />
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', marginTop: 10 }}>
            Genera tu primer forecast
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 480, margin: '6px auto 14px' }}>
            Combina pipeline de leads + costos construcción + gastos operativos en un reporte investor-grade con 3 escenarios y recomendaciones IA.
          </p>
          {isAdmin && (
            <button data-testid="cf-empty-recalc" onClick={recalc} disabled={recalcing} style={{
              padding: '10px 20px', borderRadius: 9999,
              background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
              border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>{recalcing ? 'Calculando…' : 'Calcular forecast'}</button>
          )}
        </Card>
      </DeveloperLayout>
    );
  }

  const lastCalcMs = doc.last_calculated_at ? new Date(doc.last_calculated_at).getTime() : Date.now();
  const hoursAgo = Math.floor((Date.now() - lastCalcMs) / 3600000);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="4.24 · CASH FLOW FORECAST IA"
        title={`Flujo de Caja · ${doc.project_name}`}
        sub={`Horizonte ${doc.horizon_months}m · Actualizado hace ${hoursAgo}h · ${doc.scenarios?.length || 0} escenarios analizados`}
      />

      {error && <Card style={{ marginBottom: 14, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.32)', color: '#fca5a5' }}>{error}</Card>}

      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        {isAdmin && (
          <button data-testid="cf-recalc-btn" onClick={recalc} disabled={recalcing} style={{
            padding: '8px 14px', borderRadius: 9999, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
            cursor: recalcing ? 'wait' : 'pointer', opacity: recalcing ? 0.6 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}><Clock size={11} /> {recalcing ? 'Recalculando…' : 'Recalcular'}</button>
        )}
        <button data-testid="cf-export-btn" onClick={exportPdf} style={{
          padding: '8px 14px', borderRadius: 9999,
          background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
          border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}><Download size={11} /> Exportar PDF</button>
      </div>

      {/* Stats strip */}
      <div data-testid="cf-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
        <StatCard testid="cf-stat-revenue" eyebrow="REVENUE PROYECTADO"
          value={formatM(summary.total_revenue_projected || 0)} sub={`${doc.horizon_months}m`} tone="ok" />
        <StatCard testid="cf-stat-costs" eyebrow="COSTOS TOTALES"
          value={formatM(summary.total_costs || 0)} sub="construcción + ops" tone="bad" />
        <StatCard testid="cf-stat-breakeven" eyebrow="BREAKEVEN"
          value={summary.breakeven_month ? `Mes ${summary.breakeven_month}`
                 : summary.total_balance >= 0 ? 'Ya' : 'Fuera horizonte'}
          sub={summary.breakeven_month && summary.breakeven_month <= 12 ? 'rápido' : (summary.breakeven_month || 99) <= 24 ? 'medio plazo' : 'tardío'}
          tone={summary.breakeven_month && summary.breakeven_month <= 12 ? 'ok' : (summary.breakeven_month || 99) <= 24 ? 'warn' : 'bad'} />
        <StatCard testid="cf-stat-gap" eyebrow="GAP MÁS GRANDE"
          value={summary.biggest_gap ? formatM(summary.biggest_gap.amount) : 'Sin gaps'}
          sub={summary.biggest_gap ? `mes ${summary.biggest_gap.month} · ${summary.gap_count} total` : 'flujo positivo'}
          tone={summary.biggest_gap ? 'bad' : 'ok'} />
      </div>

      {/* Scenario toggle */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div className="eyebrow"><Activity size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} />FORECAST CHART</div>
          <div data-testid="cf-scenario-toggle" style={{ display: 'flex', gap: 4 }}>
            {['pesimista', 'base', 'optimista'].map(s => (
              <button key={s} data-testid={`cf-scn-toggle-${s}`} onClick={() => setScenario(s)} style={{
                padding: '6px 12px', borderRadius: 9999,
                background: scenario === s ? 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))' : 'transparent',
                border: '1px solid var(--border)',
                color: scenario === s ? '#fff' : 'var(--cream-2)',
                fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
              }}>{s}</button>
            ))}
          </div>
        </div>
        <CashFlowChart series={series} />
      </Card>

      {/* Scenarios mini comparison */}
      <div data-testid="cf-scenarios-mini" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 16 }}>
        {(doc.scenarios || []).map(scn => (
          <ScenarioMini key={scn.label} scn={scn} active={scenario === scn.label} />
        ))}
      </div>

      {/* Gap alerts */}
      {gaps.length > 0 && (
        <Card style={{ marginBottom: 14, background: 'rgba(239,68,68,0.04)' }}>
          <div className="eyebrow" style={{ marginBottom: 10, color: '#fca5a5' }}>
            <AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} />
            GAP ALERTS · {gaps.length} de {summary.gap_count || 0} mostrados
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {gaps.map((g, i) => <GapAlertCard key={i} gap={g} idx={i} />)}
          </div>
        </Card>
      )}

      {/* Recommendations */}
      {(doc.ai_recommendations || []).length > 0 && (
        <Card data-testid="cf-recommendations" style={{ marginBottom: 14, background: 'linear-gradient(140deg, rgba(99,102,241,0.06), transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Sparkle size={13} color="#f9a8d4" />
            <div className="eyebrow" style={{ color: '#f9a8d4' }}>RECOMENDACIONES IA · CLAUDE HAIKU</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
            {doc.ai_recommendations.map((r, i) => (
              <RecommendationCard key={i} rec={r} idx={i} projectId={slug}
                isApplied={appliedSet.has(i)}
                onApplied={() => load()} />
            ))}
          </div>
        </Card>
      )}

      {/* Monthly table (collapsible) */}
      <Card style={{ marginBottom: 14 }}>
        <details data-testid="cf-monthly-table">
          <summary style={{ cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginBottom: 8 }}>
            Tabla mensual (clic para expandir)
          </summary>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontFamily: 'DM Sans', fontSize: 11.5, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Mes', 'Inflow', 'Outflow', 'Balance', 'Acumulado', 'Severidad'].map(h => (
                    <th key={h} style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map(s => {
                  const tone = SEVERITY_TONE[s.gap_severity] || SEVERITY_TONE.none;
                  return (
                    <tr key={s.month} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)', background: tone.bg }}>
                      <td style={{ padding: '6px', color: 'var(--cream)' }}>{s.label}</td>
                      <td style={{ padding: '6px', color: '#86efac' }}>{formatM(s.inflow_total)}</td>
                      <td style={{ padding: '6px', color: '#fca5a5' }}>{formatM(s.outflow_total)}</td>
                      <td style={{ padding: '6px', color: s.monthly_balance >= 0 ? 'var(--cream)' : '#fca5a5' }}>{formatM(s.monthly_balance)}</td>
                      <td style={{ padding: '6px', color: s.cumulative_balance >= 0 ? 'var(--cream)' : '#fca5a5', fontWeight: 600 }}>{formatM(s.cumulative_balance)}</td>
                      <td style={{ padding: '6px' }}>
                        <Badge tone={s.gap_severity === 'critical' ? 'bad' : s.gap_severity === 'moderate' ? 'bad' : s.gap_severity === 'mild' ? 'neutral' : 'ok'}>
                          {s.gap_severity}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textAlign: 'center', padding: '14px 0' }}>
        Estimaciones basadas en pipeline actual + benchmarks construcción LATAM. Recalcula cuando agregues nuevos leads o actualices costos.
      </div>
    </DeveloperLayout>
  );
}

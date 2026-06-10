// /desarrollador/reportes — D9 Monthly AI Report + Phase 4 Batch 2 Analytics
// Tabs: Reporte Ejecutivo | Absorción avanzada | Forecast
import React, { useEffect, useState, useMemo } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import DevReporteEjecutivo from '../../components/developer/DevReporteEjecutivo';
import { PageHeader, Card, Badge, fmt0, fmtMXN, Toast } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import { Sparkle, BarChart, Target, TrendUp, TrendDown, Activity, Bookmark, Plus, Check } from '../../components/icons';
import * as leadsApi from '../../api/leads';
import {
  CohortMatrix, HeatmapCalendar, BarList, FunnelChart, LineChart, Sparkline,
} from '../../components/developer/ChartPrimitives';

const TABS = [
  { k: 'executive', label: 'Reporte ejecutivo', Icon: Sparkle },
  { k: 'absorption', label: 'Absorción avanzada', Icon: Activity },
  { k: 'forecast',   label: 'Forecast vs actual', Icon: Target },
  { k: 'insights',   label: 'Insights de mercado', Icon: BarChart },
  { k: 'alerts',     label: 'Movement alerts', Icon: TrendUp },
  { k: 'branded',    label: 'Reportes branded',  Icon: Bookmark },
];

const DEV_V2 = process.env.REACT_APP_DEV_V2 === 'true';

export default function DesarrolladorReportes({ user, onLogout, embedded }) {
  const [tab, setTab] = useState('executive');
  const [toast, setToast] = useState(null);

  return (
    <DeveloperLayout user={user} onLogout={onLogout} bare={embedded}>
      <PageHeader
        eyebrow="D9 · REPORTES IA + ANÁLISIS AVANZADO"
        title="Reportes ejecutivos e insights"
        sub="Resumen narrado por Claude + análisis de absorción por cohortes, heatmap de ventas y forecast por proyecto."
      />

      {/* F5.1 · Score de Bancabilidad de tus proyectos (qué tan financiables son) */}
      <BancabilidadCard />

      {/* Resumen Ejecutivo del Mes (IA · junta dinero+ventas+demanda+red+prioridades, compartible) */}
      {DEV_V2 && <DevReporteEjecutivo />}

      {/* Tab bar */}
      <div data-testid="rep-tabs" style={{
        display: 'flex', gap: 2, borderBottom: '1px solid var(--border)',
        marginBottom: 18, flexWrap: 'wrap',
      }}>
        {TABS.map(t => {
          const active = tab === t.k;
          const Icon = t.Icon;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              data-testid={`rep-tab-${t.k}`}
              style={{
                padding: '11px 18px', background: 'transparent', border: 'none',
                borderBottom: `2px solid ${active ? '#EC4899' : 'transparent'}`,
                color: active ? 'var(--cream)' : 'var(--cream-3)',
                fontFamily: 'DM Sans', fontWeight: active ? 600 : 500, fontSize: 13,
                cursor: 'pointer', marginBottom: -1,
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'executive'  && <ExecutiveTab onToast={setToast} />}
      {tab === 'absorption' && <AbsorptionTab onToast={setToast} />}
      {tab === 'forecast'   && <ForecastTab onToast={setToast} />}
      {tab === 'insights'   && <InsightsTab scope="dev" onToast={setToast} />}
      {tab === 'alerts'     && <MovementAlertsTab onToast={setToast} />}
      {tab === 'branded'    && <BrandedReportsTab onToast={setToast} />}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </DeveloperLayout>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 1 — Executive (legacy D9 generator)
// ═════════════════════════════════════════════════════════════════════════════
function ExecutiveTab({ onToast }) {
  const [reports, setReports] = useState([]);
  const [active, setActive] = useState(null);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    const r = await api.listReports();
    setReports(r);
    if (r.length && !active) setActive(r[0]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await api.generateReport();
      setActive(r); load();
      onToast({ kind: 'success', text: 'Reporte generado con IA' });
    } catch { onToast({ kind: 'error', text: 'Error al generar' }); }
    finally { setGenerating(false); }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={generate} disabled={generating} data-testid="gen-report" className="btn btn-primary" style={{ opacity: generating ? 0.6 : 1 }}>
          <Sparkle size={12} />
          {generating ? 'Generando…' : 'Generar reporte mes pasado'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14 }} className="rep-grid">
        <Card style={{ padding: 8, height: 'fit-content' }}>
          {reports.length === 0
            ? <div style={{ padding: 14, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', textAlign: 'center' }}>Sin reportes aún.</div>
            : reports.map(r => (
              <button key={r.id} onClick={() => setActive(r)} data-testid={`rep-${r.month}`} style={{
                width: '100%', textAlign: 'left',
                padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                background: r.id === active?.id ? 'rgba(236,72,153,0.10)' : 'transparent',
                border: `1px solid ${r.id === active?.id ? 'rgba(236,72,153,0.3)' : 'transparent'}`,
                color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>
                <div>{r.month}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2 }}>
                  {r.metrics?.absorption_pct}% abs · {r.metrics?.units_sold} cerrad.
                </div>
              </button>
            ))}
        </Card>

        {active ? (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>REPORTE EJECUTIVO · {active.month}</div>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', letterSpacing: '-0.02em', margin: 0 }}>
                  Desempeño del portafolio
                </h2>
              </div>
              <Badge tone="brand"><Sparkle size={9} /> IA</Badge>
            </div>

            <div style={{ padding: 18, background: 'linear-gradient(140deg, rgba(236,72,153,0.06), transparent)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 18 }}>
              <pre data-testid="rep-summary" style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {active.summary}
              </pre>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
              <Metric label="Absorción" v={`${active.metrics.absorption_pct}%`} />
              <Metric label="Unidades cerradas" v={fmt0(active.metrics.units_sold)} />
              <Metric label="Ticket promedio" v={fmtMXN(active.metrics.avg_price)} />
              <Metric label="Ingresos del mes" v={fmtMXN(active.metrics.revenue)} accent="var(--ok,#86efac)" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }} className="rep-cols">
              <ListBox title="WINS DEL MES" items={active.wins} tone="ok" />
              <ListBox title="ALERTAS" items={active.alerts} tone="bad" />
              <ListBox title="RECOMENDACIONES" items={active.recommendations} tone="brand" />
            </div>
          </Card>
        ) : (
          <Card style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
            Genera tu primer reporte con el botón superior.
          </Card>
        )}
      </div>
      <style>{`
        @media (max-width: 940px) { .rep-grid { grid-template-columns: 1fr !important; } .rep-cols { grid-template-columns: 1fr !important; } }
      `}</style>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 2 — Absorption (cohort, heatmap, win/loss, funnel)
// ═════════════════════════════════════════════════════════════════════════════
function AbsorptionTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.getAbsorptionAnalytics()
      .then(setData)
      .catch(e => setErr(e.message || 'Error'));
  }, []);

  if (err) return <Card style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Error: {err}</Card>;
  if (!data) return <Card style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando…</Card>;

  const winLoss = data.win_loss || {};
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }} className="abs-grid">
      {/* Cohort matrix */}
      <Card style={{ gridColumn: '1 / -1' }} data-testid="abs-cohort">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="eyebrow">GRUPOS POR MES · 12 MESES</div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '4px 0 0', letterSpacing: '-0.018em' }}>
              Captación × Cierre por mes
            </h3>
            <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginTop: 4, maxWidth: 560, lineHeight: 1.5 }}>
              Cada celda muestra cuántos leads capturados en el mes de fila cerraron venta en el mes de columna. Intensidad = volumen relativo.
            </p>
          </div>
        </div>
        <CohortMatrix months={data.months} cohort={data.cohort} />
      </Card>

      {/* Heatmap YTD */}
      <Card data-testid="abs-heatmap">
        <div className="eyebrow">MAPA DE CALOR DEL AÑO · VENTAS POR DÍA</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 10px', letterSpacing: '-0.018em' }}>
          Calendario de cierres
        </h3>
        <HeatmapCalendar cells={data.heatmap} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)' }}>
          <span>Menos</span>
          {[0,1,2,3,4].map(l => (
            <span key={l} style={{ width: 10, height: 10, borderRadius: 2, background: ['rgba(var(--cream-rgb),0.04)', 'rgba(236,72,153,0.18)', 'rgba(236,72,153,0.38)', 'rgba(236,72,153,0.62)', 'rgba(236,72,153,0.95)'][l] }} />
          ))}
          <span>Más</span>
        </div>
      </Card>

      {/* Win/loss */}
      <Card data-testid="abs-winloss">
        <div className="eyebrow">WIN / LOSS · Razones de pérdida</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 14px', letterSpacing: '-0.018em' }}>
          ¿Por qué se perdieron las ventas?
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <Metric label="Ganadas" v={fmt0(winLoss.won)} accent="var(--ok,#86efac)" />
          <Metric label="Win rate" v={`${winLoss.win_rate_pct}%`} />
        </div>
        <BarList
          items={(winLoss.lost_reasons || []).map(r => ({ label: `${r.reason} · ${r.pct}%`, value: r.count, color: r.color }))}
          format={v => `${v}`}
        />
      </Card>

      {/* Funnel */}
      <Card style={{ gridColumn: '1 / -1' }} data-testid="abs-funnel">
        <div className="eyebrow">FUNNEL MULTI-STEP · Lead → Cierre</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 14px', letterSpacing: '-0.018em' }}>
          Conversión por etapa
        </h3>
        <FunnelChart steps={data.funnel || []} />
      </Card>

      <style>{`@media (max-width: 940px) { .abs-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 3 — Forecast vs actual
// ═════════════════════════════════════════════════════════════════════════════
function ForecastTab() {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('individual'); // individual | consolidated

  useEffect(() => { api.getForecast().then(setData); }, []);
  if (!data) return <Card style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando…</Card>;

  const rows = data.rows || [];
  const cons = data.consolidated || {};
  const monthly = mode === 'consolidated' ? (data.monthly_projection || []) : (rows[0]?.monthly_projection || []);
  const xLabels = monthly.map(m => m.month.slice(5));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
          <div>
            <div className="eyebrow">PRONÓSTICO · META VS REAL</div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '4px 0 0', letterSpacing: '-0.018em' }}>
              Ventas planificadas vs reales
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 2, background: 'rgba(var(--cream-rgb),0.04)', borderRadius: 9999, padding: 3 }} data-testid="forecast-mode-toggle">
            {['individual', 'consolidated'].map(m => (
              <button
                key={m}
                data-testid={`forecast-mode-${m}`}
                onClick={() => setMode(m)}
                style={{
                  padding: '7px 14px', borderRadius: 9999,
                  background: mode === m ? 'var(--grad)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--cream-3)',
                  border: 'none', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                {m === 'individual' ? 'Por proyecto' : 'Consolidado'}
              </button>
            ))}
          </div>
        </div>

        {mode === 'consolidated' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Metric label="Target total" v={fmt0(cons.target_units)} />
            <Metric label="Actual total" v={fmt0(cons.actual_units)} accent={cons.variance_pct >= 0 ? '#86efac' : '#fca5a5'} />
            <Metric label="Varianza" v={`${cons.variance_pct >= 0 ? '+' : ''}${cons.variance_pct}%`} accent={cons.variance_pct >= 0 ? '#86efac' : '#fca5a5'} />
            <Metric label="Tendencia" v={cons.trend === 'up' ? 'Al alza' : cons.trend === 'down' ? 'A la baja' : 'Estable'} />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="forecast-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Proyecto', 'Target', 'Actual', 'Varianza', 'Tendencia', 'Revenue target', 'Revenue actual'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 500, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.dev_id} data-testid={`forecast-row-${r.dev_id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px', color: 'var(--cream)' }}>
                      <div style={{ fontWeight: 600 }}>{r.dev_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{r.colonia}</div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--cream-2)', fontFamily: 'DM Mono, monospace' }}>{r.target_units}</td>
                    <td style={{ padding: '12px', color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{r.actual_units}</td>
                    <td style={{ padding: '12px' }}>
                      <Badge tone={r.variance_pct >= 0 ? 'ok' : 'bad'}>
                        {r.variance_pct >= 0 ? '+' : ''}{r.variance_pct}%
                      </Badge>
                    </td>
                    <td style={{ padding: '12px', color: r.trend === 'up' ? '#86efac' : r.trend === 'down' ? '#fca5a5' : 'var(--cream-3)' }}>
                      {r.trend === 'up' ? <TrendUp size={14} /> : r.trend === 'down' ? <TrendDown size={14} /> : '—'}
                      <span style={{ marginLeft: 6, fontSize: 12, textTransform: 'capitalize' }}>{r.trend}</span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--cream-3)', fontFamily: 'DM Mono, monospace', fontSize: 11.5 }}>{fmtMXN(r.revenue_target)}</td>
                    <td style={{ padding: '12px', color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 11.5 }}>{fmtMXN(r.revenue_actual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card data-testid="forecast-chart">
        <div className="eyebrow">PROYECCIÓN 12 MESES · sensitivity</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 14px', letterSpacing: '-0.018em' }}>
          Escenario base con bandas pesimista/optimista
        </h3>
        <LineChart
          width={720}
          height={260}
          xLabels={xLabels}
          series={[
            { name: 'Pesimista', color: 'var(--red)', values: monthly.map((m, i) => ({ x: i, y: m.pessimist })) },
            { name: 'Base', color: 'var(--rose)', values: monthly.map((m, i) => ({ x: i, y: m.base })) },
            { name: 'Optimista', color: 'var(--green)', values: monthly.map((m, i) => ({ x: i, y: m.optimist })) },
          ]}
        />
        <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>
          {[
            { c: '#fca5a5', l: 'Pesimista (-35%)' },
            { c: '#EC4899', l: 'Base' },
            { c: '#86efac', l: 'Optimista (+38%)' },
          ].map(s => (
            <span key={s.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: s.c }} /> {s.l}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════
function Metric({ label, v, accent }) {
  return (
    <div style={{ padding: 12, background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: accent || 'var(--cream)' }}>{v}</div>
    </div>
  );
}

function ListBox({ title, items, tone }) {
  return (
    <div style={{ padding: 14, background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)', borderRadius: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{title}</div>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
          <Badge tone={tone}>{i + 1}</Badge>
          <div style={{ flex: 1 }}>{t}</div>
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 4 — Insights de mercado (cancel/reschedule/lost reasons)
// Phase 4 Batch 4.4 · 4.37
// ═════════════════════════════════════════════════════════════════════════════
export function InsightsTab({ scope = 'dev', onToast }) {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [cohort, setCohort] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetcher = scope === 'dev' ? api.getDevAnalyticsCancelReasons : api.getInmAnalyticsCancelReasons;
    fetcher(period).then(r => setData(r))
      .catch(e => onToast?.({ kind: 'error', text: e.body?.detail || 'Error al cargar insights' }))
      .finally(() => setLoading(false));
    if (scope === 'dev') {
      api.getHeatCohort(period).then(setCohort).catch(() => setCohort(null));
    }
  }, [period, scope, onToast]);

  return (
    <div data-testid="insights-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PeriodFilter value={period} onChange={setPeriod} />
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <Card>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Razones cancelación</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', marginBottom: 10 }}>
                {fmt0(data.totals.cancellations)} citas
              </div>
              <BarList items={data.cancel_reasons_breakdown.map(r => ({ label: r.reason, value: r.count }))} format={v => `${v}`} />
            </Card>
            <Card>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Razones reagendar</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', marginBottom: 10 }}>
                {fmt0(data.totals.reschedules)} citas
              </div>
              <BarList items={data.reschedule_reasons_breakdown.map(r => ({ label: r.reason, value: r.count }))} format={v => `${v}`} />
            </Card>
            <Card>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Razones perdido</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', marginBottom: 10 }}>
                {fmt0(data.totals.lost)} leads
              </div>
              <BarList items={data.lost_reasons_breakdown.map(r => ({ label: r.reason, value: r.count }))} format={v => `${v}`} />
            </Card>
          </div>

          <Card>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Tendencia mensual</div>
            {data.trends.per_month.length === 0 ? (
              <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Sin datos del período</div>
            ) : (
              <div data-testid="trend-chart" style={{ overflowX: 'auto' }}>
                <LineChart
                  series={[
                    { name: 'Cancelaciones', values: data.trends.per_month.map(m => m.cancellations) },
                    { name: 'Reagendamientos', values: data.trends.per_month.map(m => m.reschedules) },
                    { name: 'Perdidos', values: data.trends.per_month.map(m => m.lost) },
                  ]}
                  labels={data.trends.per_month.map(m => m.month)}
                  width={720} height={200}
                />
              </div>
            )}
          </Card>

          {cohort && cohort.total_leads > 0 && (
            <Card>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Cohort de Heat IA · Close rate por temperatura</div>
              <div data-testid="heat-cohort" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {cohort.cohort.map(c => (
                  <HeatCohortCard key={c.tag} {...c} />
                ))}
              </div>
              <div style={{ marginTop: 14, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.55 }}>
                {fmt0(cohort.total_leads)} leads creados en el período. Prioriza coaching del asesor sobre los <strong style={{ color: 'var(--cream-2)' }}>calientes</strong> — convierten significativamente más rápido que tibios y fríos.
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 5 — Movement alerts (Phase 4 Batch 4.4 · 4.37)
// ═════════════════════════════════════════════════════════════════════════════
function MovementAlertsTab({ onToast }) {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getDevMovementAlerts(period)
      .then(r => setData(r))
      .catch(e => onToast?.({ kind: 'error', text: e.body?.detail || 'Error al cargar movement alerts' }))
      .finally(() => setLoading(false));
  }, [period, onToast]);

  return (
    <div data-testid="alerts-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PeriodFilter value={period} onChange={setPeriod} />
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <StatCard label="Alertas enviadas" value={fmt0(data.total_alerts_sent)} />
            <StatCard label="Tasa de respuesta" value={`${data.response_rate}%`} />
            <StatCard label="Tasa reactivación" value={`${data.reactivation_rate}%`} />
          </div>
          <Card>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Por asesor</div>
            {data.alerts_by_asesor.length === 0 ? (
              <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Sin alertas en el período</div>
            ) : (
              <table data-testid="alerts-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={{ textAlign: 'left', padding: '8px 4px' }}>Asesor</th>
                    <th style={{ textAlign: 'right', padding: '8px 4px' }}>Alertas recibidas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.alerts_by_asesor.map(a => (
                    <tr key={a.asesor_id} style={{ borderBottom: '1px solid rgba(var(--cream-rgb),0.04)' }}>
                      <td style={{ padding: '10px 4px', color: 'var(--cream)' }}>{a.asesor_name}</td>
                      <td style={{ textAlign: 'right', padding: '10px 4px', color: 'var(--cream-2)', fontFamily: 'DM Mono, monospace' }}>{a.alerts_received}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function PeriodFilter({ value, onChange }) {
  const opts = [{ k: '7d', label: '7d' }, { k: '30d', label: '30d' }, { k: '90d', label: '90d' }, { k: '12m', label: '12m' }];
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {opts.map(o => (
        <button
          key={o.k}
          data-testid={`period-${o.k}`}
          onClick={() => onChange(o.k)}
          style={{
            padding: '6px 12px', borderRadius: 9999, cursor: 'pointer',
            background: value === o.k ? 'rgba(var(--cream-rgb),0.10)' : 'transparent',
            border: `1px solid ${value === o.k ? 'rgba(var(--cream-rgb),0.30)' : 'var(--border)'}`,
            color: value === o.k ? 'var(--cream)' : 'var(--cream-3)',
            fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 600,
          }}>{o.label}</button>
      ))}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <Card>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)' }}>{value}</div>
    </Card>
  );
}

function HeatCohortCard({ tag, total, won, close_rate, share_pct }) {
  const tones = {
    caliente:     { bg: 'rgba(239,68,68,0.08)',  bd: 'rgba(239,68,68,0.30)',  fg: 'var(--red)' },
    tibio:        { bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.30)', fg: 'var(--amber)' },
    frio:         { bg: 'rgba(var(--cream-rgb),0.05)', bd: 'rgba(var(--cream-rgb),0.18)', fg: 'var(--cream-3)' },
    sin_calcular: { bg: 'rgba(var(--cream-rgb),0.03)', bd: 'rgba(var(--cream-rgb),0.10)', fg: 'var(--cream-3)' },
  };
  const t = tones[tag] || tones.frio;
  return (
    <div data-testid={`heat-cohort-${tag}`} style={{
      padding: 14, borderRadius: 12,
      background: t.bg, border: `1px solid ${t.bd}`,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: t.fg, textTransform: 'capitalize' }}>
          {tag.replace('_', ' ')}
        </div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--cream-3)' }}>
          {share_pct}%
        </div>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)' }}>{total}</div>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: t.fg, fontWeight: 600 }}>
        {close_rate}% close · {won} cerrados
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// F5.1 — Score de Bancabilidad de los proyectos del dev (qué tan financiables son)
const LETRA_BC = { 'A+': '#22C55E', 'A': '#22C55E', 'B+': '#84CC16', 'B': '#84CC16', 'C+': '#E2982E', 'C': '#E2982E', 'D': '#ef4444' };
function BancabilidadCard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { api.getDevBancabilidad().then(setData).catch(() => setErr(true)); }, []);
  if (err || (data && (data.proyectos || []).length === 0)) return null;
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>Score de Bancabilidad</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>Qué tan financiables son tus proyectos</div>
        </div>
        {data?.promedio != null && (
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)' }}>{data.promedio}</span>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}> promedio</span>
          </div>
        )}
      </div>
      {!data && <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Calculando…</div>}
      {(data?.proyectos || []).map(p => (
        <div key={p.dev_id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream)', fontWeight: 600 }}>{p.nombre}</span>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
              {p.etiqueta} · <b style={{ color: LETRA_BC[p.letra] || 'var(--cream)' }}>{p.bancabilidad} · {p.letra}</b>
            </span>
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 2 }}>
            Absorción {p.componentes?.absorcion_pct ?? '—'}% · venta esperada {p.componentes?.prob_venta_esperada_pct ?? '—'}%{p.componentes?.posicion_zona != null ? ` · zona ${p.componentes.posicion_zona}` : ''}
          </div>
          {(p.recomendaciones || []).slice(0, 1).map((r, i) => (
            <div key={i} style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#a5b4fc', marginTop: 2 }}>→ {r}</div>
          ))}
        </div>
      ))}
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 8 }}>◐ Calificación A–F: absorción real + posición de zona + venta esperada aprendida por el Cerebro.</div>
    </Card>
  );
}

// BrandedReportsTab — Phase 4 Batch 5 · 4.21
// ═════════════════════════════════════════════════════════════════════════════
function BrandedReportsTab({ onToast }) {
  const [subtab, setSubtab] = useState('generate');
  const subtabs = [
    { k: 'templates',     label: 'Templates' },
    { k: 'generate',      label: 'Generar ahora' },
    { k: 'estudios',      label: 'Estudios de Mercado' },
    { k: 'distributions', label: 'Distribución automática' },
  ];
  return (
    <div data-testid="branded-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {subtabs.map(s => (
          <button key={s.k}
            data-testid={`br-sub-${s.k}`}
            onClick={() => setSubtab(s.k)}
            style={{
              padding: '6px 12px', borderRadius: 9999, cursor: 'pointer',
              background: subtab === s.k ? 'rgba(var(--cream-rgb),0.10)' : 'transparent',
              border: `1px solid ${subtab === s.k ? 'rgba(var(--cream-rgb),0.30)' : 'var(--border)'}`,
              color: subtab === s.k ? 'var(--cream)' : 'var(--cream-3)',
              fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 600,
            }}>{s.label}</button>
        ))}
      </div>
      {subtab === 'templates'     && <TemplatesSubtab onToast={onToast} />}
      {subtab === 'generate'      && <GenerateSubtab onToast={onToast} />}
      {subtab === 'estudios'      && <EstudiosSubtab onToast={onToast} />}
      {subtab === 'distributions' && <DistributionsSubtab onToast={onToast} />}
    </div>
  );
}

// F3.3 — Estudios de Mercado guardados (reusa historial F3.2 + PDF branded F3.1)
function EstudiosSubtab({ onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let alive = true;
    api.getEstudioHistorial().then(r => { if (alive) setItems(r.items || []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const downloadPdf = async (it) => {
    setBusy(it.id);
    try {
      const base = process.env.REACT_APP_BACKEND_URL || '';
      const url = `${base}/api/dev/estudio-mercado/pdf?colonia_id=${encodeURIComponent(it.colonia_id)}&categoria=${encodeURIComponent(it.categoria || 'media')}`;
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error('pdf');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Estudio_${(it.colonia || 'colonia').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}_v${it.version}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      onToast?.({ kind: 'error', text: 'No se pudo generar el PDF' });
    } finally { setBusy(''); }
  };

  if (loading) return <div data-testid="estudios-subtab" style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, padding: 16 }}>Cargando…</div>;
  if (items.length === 0) return (
    <div data-testid="estudios-subtab" style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, padding: 16 }}>
      Aún no guardas estudios. Genera uno en <b style={{ color: 'var(--cream-2)' }}>Estudio de Mercado Vivo</b> y pulsa “Guardar Versión”.
    </div>
  );

  return (
    <div data-testid="estudios-subtab" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: 0 }}>Estudios guardados</h3>
      {items.map(it => {
        const s = it.snapshot || {};
        return (
          <Card key={it.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
                  {it.colonia || it.colonia_id} <span style={{ color: 'var(--cream-3)', fontWeight: 500, fontSize: 12 }}>· v{it.version} · {(it.categoria || '').charAt(0).toUpperCase() + (it.categoria || '').slice(1)}</span>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>
                  {(it.generated_at || '').slice(0, 10)} · {fmt0(s.demanda_total)} búsquedas · hueco {fmt0(s.gap_vertical)}{s.producto_dominante?.tipologia ? ` · ${s.producto_dominante.tipologia}` : ''}
                </div>
              </div>
              <button onClick={() => downloadPdf(it)} disabled={busy === it.id} style={{ ...btnSecRep, opacity: busy === it.id ? 0.6 : 1 }}>
                <Bookmark size={11} /> {busy === it.id ? 'Generando…' : 'Descargar PDF'}
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function TemplatesSubtab({ onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('executive');
  const [primaryColor, setPrimaryColor] = useState('#06080F');
  const [headerText, setHeaderText] = useState('DesarrollosMX');

  const load = async () => {
    setLoading(true);
    try {
      const r = await leadsApi.listReportTemplates();
      setItems(r.items || []);
    } catch (e) { onToast?.({ kind: 'error', text: e.body?.detail || 'Error' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const submit = async () => {
    if (!name) return onToast?.({ kind: 'error', text: 'Nombre requerido' });
    try {
      await leadsApi.createReportTemplate({
        name, type,
        sections: [
          { type: 'cover', config: {} },
          { type: 'kpi_grid', config: {} },
          { type: 'absorption_chart', config: {} },
          { type: 'team_perf', config: {} },
          { type: 'narrative_ai', config: {} },
        ],
        branding: { primary_color: primaryColor, secondary_color: 'var(--cream)', header_text: headerText, footer_text: 'Confidencial · DesarrollosMX' },
        default: false,
      });
      onToast?.({ kind: 'success', text: 'Template creado' });
      setShowForm(false); setName('');
      load();
    } catch (e) { onToast?.({ kind: 'error', text: e.body?.detail || 'Error' }); }
  };

  return (
    <div data-testid="templates-subtab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: 0 }}>Templates</h3>
        <button data-testid="new-template" onClick={() => setShowForm(s => !s)} style={btnSecRep}>
          <Plus size={11} /> Nuevo template
        </button>
      </div>
      {showForm && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={lblRep}>Nombre</label>
              <input data-testid="tpl-name" value={name} onChange={e => setName(e.target.value)} style={inpRep} placeholder="Reporte Ejecutivo Mensual" />
            </div>
            <div>
              <label style={lblRep}>Tipo</label>
              <select data-testid="tpl-type" value={type} onChange={e => setType(e.target.value)} style={inpRep}>
                <option value="executive">Ejecutivo</option>
                <option value="marketing">Marketing</option>
                <option value="financial">Financiero</option>
                <option value="commercial">Comercial</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblRep}>Color primario</label>
                <input data-testid="tpl-color" type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} style={inpRep} />
              </div>
              <div>
                <label style={lblRep}>Header</label>
                <input value={headerText} onChange={e => setHeaderText(e.target.value)} style={inpRep} />
              </div>
            </div>
            <button data-testid="tpl-submit" onClick={submit} style={btnPriRep}>Crear template</button>
          </div>
        </Card>
      )}
      {loading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div> :
        items.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Sin templates aún</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 12 }}>
          {items.map(t => (
            <Card key={t.id}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>{t.type}</div>
              <h4 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: '0 0 6px' }}>{t.name}</h4>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)' }}>
                {t.sections?.length || 0} secciones · {t.default ? 'default' : 'estándar'}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function GenerateSubtab({ onToast }) {
  const [templates, setTemplates] = useState([]);
  const [tplId, setTplId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [periodFrom, setPeriodFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    leadsApi.listReportTemplates().then(r => {
      setTemplates(r.items || []);
      if (r.items?.length) setTplId(r.items[0].id);
    }).catch(() => {});
  }, []);

  const generate = async () => {
    if (!tplId) return onToast?.({ kind: 'error', text: 'Selecciona un template' });
    setBusy(true); setResult(null);
    try {
      const r = await leadsApi.generateReport({
        template_id: tplId,
        project_id: projectId || null,
        period_from: new Date(`${periodFrom}T00:00:00Z`).toISOString(),
        period_to: new Date(`${periodTo}T23:59:59Z`).toISOString(),
      });
      setResult(r);
      onToast?.({ kind: 'success', text: `PDF generado · ${r.size_kb} KB` });
    } catch (e) { onToast?.({ kind: 'error', text: e.body?.detail || 'Error al generar' }); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <div data-testid="generate-subtab" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={lblRep}>Template</label>
          <select data-testid="gen-template" value={tplId} onChange={e => setTplId(e.target.value)} style={inpRep}>
            <option value="">— elige template —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.type})</option>)}
          </select>
        </div>
        <div>
          <label style={lblRep}>Proyecto (opcional)</label>
          <input data-testid="gen-project" value={projectId} onChange={e => setProjectId(e.target.value)}
            placeholder="Ej: quattro-alto (vacío = consolidado)" style={inpRep} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={lblRep}>Desde</label>
            <input data-testid="gen-from" type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} style={inpRep} />
          </div>
          <div>
            <label style={lblRep}>Hasta</label>
            <input data-testid="gen-to" type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} style={inpRep} />
          </div>
        </div>
        <button data-testid="gen-submit" onClick={generate} disabled={busy} style={btnPriRep}>
          {busy ? 'Generando PDF…' : 'Generar y descargar PDF'}
        </button>
        {result && (
          <div data-testid="gen-result" style={{
            padding: 12, borderRadius: 8,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.30)',
            color: 'var(--green)', fontFamily: 'DM Sans', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Check size={13} /> Reporte listo · {result.size_kb} KB
            <a href={leadsApi.reportDownloadUrl(result.file_id)} target="_blank" rel="noreferrer"
              style={{ marginLeft: 12, color: 'var(--cream)', textDecoration: 'underline' }}>
              Descargar
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}

function DistributionsSubtab({ onToast }) {
  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tplId, setTplId] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [emails, setEmails] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [r, ts] = await Promise.all([leadsApi.listReportDistributions(), leadsApi.listReportTemplates()]);
      setItems(r.items || []);
      setTemplates(ts.items || []);
      if (ts.items?.length && !tplId) setTplId(ts.items[0].id);
    } catch (e) { onToast?.({ kind: 'error', text: e.body?.detail || 'Error' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const submit = async () => {
    const recipients = emails.split(',').map(e => e.trim()).filter(Boolean).map(email => ({ email, role: 'team' }));
    if (recipients.length === 0) return onToast?.({ kind: 'error', text: 'Agrega al menos 1 email' });
    try {
      await leadsApi.createReportDistribution({
        template_id: tplId, frequency, recipients,
        day_of_week: frequency === 'weekly' ? 1 : null,
        day_of_month: frequency === 'monthly' ? 1 : null,
      });
      onToast?.({ kind: 'success', text: 'Distribución creada' });
      setShowForm(false); setEmails('');
      load();
    } catch (e) { onToast?.({ kind: 'error', text: e.body?.detail || 'Error' }); }
  };

  return (
    <div data-testid="distributions-subtab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: 0 }}>Distribuciones automáticas</h3>
        <button data-testid="new-dist" onClick={() => setShowForm(s => !s)} style={btnSecRep}>
          <Plus size={11} /> Nueva distribución
        </button>
      </div>
      {showForm && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={lblRep}>Template</label>
              <select value={tplId} onChange={e => setTplId(e.target.value)} style={inpRep}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lblRep}>Frecuencia</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)} style={inpRep}>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
                <option value="quarterly">Trimestral</option>
              </select>
            </div>
            <div>
              <label style={lblRep}>Destinatarios (emails separados por coma)</label>
              <textarea data-testid="dist-emails" rows={3} value={emails} onChange={e => setEmails(e.target.value)}
                placeholder="cliente@empresa.com, partner@empresa.com" style={{ ...inpRep, resize: 'vertical' }} />
            </div>
            <button data-testid="dist-submit" onClick={submit} style={btnPriRep}>Crear distribución</button>
          </div>
        </Card>
      )}
      {loading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div> :
        items.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Sin distribuciones programadas</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {items.map(d => (
            <Card key={d.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                    {d.schedule.frequency} · {d.recipients.length} destinatarios
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)' }}>
                    Próximo: {d.next_scheduled_at?.slice(0, 10) || '—'} · Último: {d.last_sent_at?.slice(0, 10) || 'nunca'}
                  </div>
                </div>
                <Badge tone={d.status === 'active' ? 'ok' : 'warn'}>{d.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const inpRep = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  background: 'rgba(var(--cream-rgb),0.04)', border: '1px solid var(--border)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none',
};
const lblRep = {
  fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--cream-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
};
const btnPriRep = {
  padding: '10px 18px', borderRadius: 9999, cursor: 'pointer',
  background: 'rgba(var(--cream-rgb),0.10)', border: '1px solid rgba(var(--cream-rgb),0.30)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
};
const btnSecRep = {
  padding: '6px 12px', borderRadius: 9999, cursor: 'pointer',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-2)',
  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 500,
  display: 'inline-flex', alignItems: 'center', gap: 4,
};


// /desarrollador/reportes — D9 Monthly AI Report + Phase 4 Batch 2 Analytics
// Tabs: Reporte Ejecutivo | Absorción avanzada | Forecast
import React, { useEffect, useState, useMemo } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmt0, fmtMXN, Toast } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import { Sparkle, BarChart, Target, TrendUp, TrendDown, Activity } from '../../components/icons';
import {
  CohortMatrix, HeatmapCalendar, BarList, FunnelChart, LineChart, Sparkline,
} from '../../components/developer/ChartPrimitives';

const TABS = [
  { k: 'executive', label: 'Reporte ejecutivo', Icon: Sparkle },
  { k: 'absorption', label: 'Absorción avanzada', Icon: Activity },
  { k: 'forecast',   label: 'Forecast vs actual', Icon: Target },
];

export default function DesarrolladorReportes({ user, onLogout }) {
  const [tab, setTab] = useState('executive');
  const [toast, setToast] = useState(null);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="D9 · REPORTES IA + ANÁLISIS AVANZADO"
        title="Reportes ejecutivos e insights"
        sub="Resumen narrado por Claude + análisis de absorción por cohortes, heatmap de ventas y forecast por proyecto."
      />

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
      onToast({ kind: 'success', text: 'Reporte generado con Claude Sonnet 4.5' });
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
              <Badge tone="brand"><Sparkle size={9} /> Claude Sonnet 4.5</Badge>
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
              <Metric label="Ingresos del mes" v={fmtMXN(active.metrics.revenue)} accent="#86efac" />
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

  if (err) return <Card style={{ padding: 40, textAlign: 'center', color: '#fca5a5' }}>Error: {err}</Card>;
  if (!data) return <Card style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando…</Card>;

  const winLoss = data.win_loss || {};
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }} className="abs-grid">
      {/* Cohort matrix */}
      <Card style={{ gridColumn: '1 / -1' }} data-testid="abs-cohort">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="eyebrow">COHORT MATRIX · 12 meses</div>
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
        <div className="eyebrow">HEATMAP YTD · Ventas por día</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 10px', letterSpacing: '-0.018em' }}>
          Calendario de cierres
        </h3>
        <HeatmapCalendar cells={data.heatmap} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)' }}>
          <span>Menos</span>
          {[0,1,2,3,4].map(l => (
            <span key={l} style={{ width: 10, height: 10, borderRadius: 2, background: ['rgba(255,255,255,0.04)', 'rgba(236,72,153,0.18)', 'rgba(236,72,153,0.38)', 'rgba(236,72,153,0.62)', 'rgba(236,72,153,0.95)'][l] }} />
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
          <Metric label="Ganadas" v={fmt0(winLoss.won)} accent="#86efac" />
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
            <div className="eyebrow">FORECAST · target vs actual</div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '4px 0 0', letterSpacing: '-0.018em' }}>
              Ventas planificadas vs reales
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 9999, padding: 3 }} data-testid="forecast-mode-toggle">
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
            { name: 'Pesimista', color: '#fca5a5', values: monthly.map((m, i) => ({ x: i, y: m.pessimist })) },
            { name: 'Base', color: '#EC4899', values: monthly.map((m, i) => ({ x: i, y: m.base })) },
            { name: 'Optimista', color: '#86efac', values: monthly.map((m, i) => ({ x: i, y: m.optimist })) },
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
    <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: accent || 'var(--cream)' }}>{v}</div>
    </div>
  );
}

function ListBox({ title, items, tone }) {
  return (
    <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14 }}>
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

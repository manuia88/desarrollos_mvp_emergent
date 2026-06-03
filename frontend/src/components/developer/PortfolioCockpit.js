// Tablero central del operador — cabina de mando del portafolio.
// FLUJO: 1) eliges el alcance (todo / zona / proyecto) → 2) signos vitales se recalculan
// → 3) gráficas con data real → 4) detalle. Todo cascadea del primer filtro.
// Fuente única: listProjectsWithStats (sin llamadas extra al backend).
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProjectsWithStats } from '../../api/developer';
import { ArrowRight } from '../icons';

/* ───────────────────────── helpers ───────────────────────── */
const fmtBig = (n) => {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};
const healthColor = (s) => (s >= 70 ? 'var(--ok, #1FA06A)' : s >= 45 ? 'var(--warm, #E2982E)' : 'var(--hot, #F2635B)');
const speedColor = (m) => (m == null ? 'var(--cream-3)' : m <= 6 ? 'var(--ok, #1FA06A)' : m <= 18 ? 'var(--warm, #E2982E)' : 'var(--hot, #F2635B)');
const C_DISP = 'var(--theme, #6D4AFF)', C_RESV = 'var(--warm, #E2982E)', C_VEND = 'var(--ok, #1FA06A)';

const avgPrice = (p) => { const f = p.price_from || 0, t = p.price_to || 0; return t > f ? (f + t) / 2 : f; };
const availOf = (p) => (p.units_by_status || {}).disponible || 0;
const resvOf = (p) => (p.units_by_status || {}).reservado || 0;
const soldOf = (p) => (p.units_by_status || {}).vendido || 0;
const porCobrar = (p) => availOf(p) * avgPrice(p);
const norm8 = (arr) => { const a = (arr || []).map(Number).map(v => (isNaN(v) ? 0 : v)).slice(-8); while (a.length < 8) a.unshift(0); return a; };
const monthlyRate = (p) => norm8(p.weekly_sales).slice(-4).reduce((s, v) => s + v, 0);
const fmtMonths = (m) => (m == null ? '—' : m >= 60 ? '60+ m' : `${m} m`);

/* ───────────────────────── gráficas (SVG puro) ───────────────────────── */
function AreaChart({ series = [], color = C_DISP, h = 84 }) {
  const vals = series.map(Number).map(v => (isNaN(v) ? 0 : v));
  if (vals.length < 2) return <div style={{ height: h, fontSize: 11, color: 'var(--cream-3)' }}>Sin datos suficientes</div>;
  const W = 100, max = Math.max(...vals, 1), rng = max || 1;
  const x = (i) => (i / (vals.length - 1)) * W;
  const y = (v) => h - (v / rng) * (h - 12) - 6;
  const line = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" width="100%" height={h} style={{ display: 'block', overflow: 'visible' }}>
      <polygon points={`0,${h} ${line} ${W},${h}`} fill={color} opacity="0.13" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="1.4" fill={color} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

function StackedBar({ disp, resv, vend }) {
  const total = disp + resv + vend || 1;
  const seg = [{ k: 'Disponibles', v: disp, c: C_DISP }, { k: 'Reservadas', v: resv, c: C_RESV }, { k: 'Vendidas', v: vend, c: C_VEND }];
  return (
    <div>
      <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: 'rgba(var(--cream-rgb),0.08)' }}>
        {seg.map(s => s.v > 0 && <div key={s.k} title={`${s.k}: ${s.v}`} style={{ width: `${(s.v / total) * 100}%`, background: s.c }} />)}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
        {seg.map(s => (
          <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.c }} />
            <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' }}>{s.k}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit' }}>{s.v}</span>
            <span style={{ fontSize: 10.5, color: 'var(--cream-3)' }}>{Math.round(s.v / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HBars({ items, fmt = (v) => v, color = C_DISP }) {
  const max = Math.max(...items.map(i => i.value), 1);
  if (!items.length) return <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>—</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {items.map(i => (
        <div key={i.label} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 56px', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.label}</span>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(var(--cream-rgb),0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(i.value / max) * 100}%`, background: i.color || color, borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif', textAlign: 'right' }}>{fmt(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, sub, right, children }) {
  return (
    <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--asr-shadow, none)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 1 }}>{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ───────────────────────── vitales ───────────────────────── */
function VitalTile({ label, value, sub, accent = C_DISP, valueColor }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 11, padding: '11px 12px 11px 13px', boxShadow: 'var(--asr-shadow, none)' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: valueColor || 'var(--cream)', letterSpacing: '-0.02em', lineHeight: 1.15, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--cream-2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function VitalGroup({ label, tiles }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(124px, 1fr))', gap: 10 }}>
        {tiles.map(t => <VitalTile key={t.label} {...t} />)}
      </div>
    </div>
  );
}

/* ───────────────────────── scope bar ───────────────────────── */
const selStyle = {
  appearance: 'none', padding: '7px 30px 7px 13px', borderRadius: 9999,
  background: 'var(--surface, #fff) url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'><path d=\'M1 1l4 4 4-4\' stroke=\'%23999\' fill=\'none\' stroke-width=\'1.5\'/></svg>") no-repeat right 12px center',
  border: '1px solid var(--border, rgba(var(--cream-rgb),0.14))', color: 'var(--cream)',
  fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

function ScopeBar({ mode, setMode, zones, zoneSel, setZoneSel, projects, projSel, setProjSel }) {
  const opts = [['all', 'Todo el portafolio'], ['zona', 'Una zona'], ['proyecto', 'Un proyecto']];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
      <span style={{ fontSize: 11.5, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '.03em' }}>ESTÁS VIENDO</span>
      <div style={{ display: 'inline-flex', gap: 3, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))', borderRadius: 9999, padding: 3 }}>
        {opts.map(([k, lbl]) => {
          const on = mode === k;
          return (
            <button key={k} data-testid={`scope-${k}`} onClick={() => setMode(k)}
              style={{ padding: '6px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: on ? 'linear-gradient(90deg, var(--theme), var(--theme-3, var(--theme)))' : 'transparent', color: on ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', fontSize: 12, fontWeight: on ? 700 : 500 }}>
              {lbl}
            </button>
          );
        })}
      </div>
      {mode === 'zona' && (
        <select data-testid="scope-zona-select" value={zoneSel || ''} onChange={e => setZoneSel(e.target.value)} style={selStyle}>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      )}
      {mode === 'proyecto' && (
        <select data-testid="scope-proj-select" value={projSel || ''} onChange={e => setProjSel(e.target.value)} style={selStyle}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
    </div>
  );
}

/* ───────────────────────── tabla ───────────────────────── */
const cell = { fontSize: 12.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' };
const GRID_PROJ = '1.5fr 0.7fr 1.05fr 0.95fr 0.95fr 0.85fr 1fr 0.75fr 0.7fr 26px';
const GRID_ZONE = '1.5fr 0.8fr 1.15fr 0.95fr 0.9fr 1.05fr 0.75fr';

function Bar({ pct, color }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--cream-rgb),0.10)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
    </div>
  );
}
function MiniSpark({ data = [], color }) {
  const vals = norm8(data);
  const max = Math.max(...vals, 1), w = 64, h = 22;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - (v / max) * (h - 3) - 1.5}`).join(' ');
  return <svg width={w} height={h} style={{ display: 'block' }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/* ───────────────────────── main ───────────────────────── */
export default function PortfolioCockpit() {
  const [projects, setProjects] = useState(null);
  const [mode, setModeRaw] = useState('all');
  const [zoneSel, setZoneSel] = useState(null);
  const [projSel, setProjSel] = useState(null);
  const [tableView, setTableView] = useState('proyecto');

  useEffect(() => {
    listProjectsWithStats()
      .then(r => setProjects(Array.isArray(r) ? r : (r.projects || r.items || [])))
      .catch(() => setProjects([]));
  }, []);

  const zones = useMemo(() => [...new Set((projects || []).map(p => p.colonia || '—'))], [projects]);

  const setMode = (m) => {
    setModeRaw(m);
    if (m === 'zona' && !zoneSel) setZoneSel(zones[0]);
    if (m === 'proyecto' && !projSel) setProjSel((projects || [])[0]?.id);
  };

  // 1) ALCANCE → subset que alimenta TODO lo de abajo
  const scoped = useMemo(() => {
    const all = projects || [];
    if (mode === 'zona') return all.filter(p => (p.colonia || '—') === zoneSel);
    if (mode === 'proyecto') return all.filter(p => p.id === projSel);
    return all;
  }, [projects, mode, zoneSel, projSel]);

  // agregados sobre el alcance
  const a = useMemo(() => scoped.reduce((x, p) => {
    const ap = avgPrice(p);
    x.total += p.units_total || 0; x.sold += soldOf(p); x.avail += availOf(p); x.resv += resvOf(p);
    x.cobrado += p.revenue_mtd_est || 0; x.porCobrar += porCobrar(p); x.enReserva += resvOf(p) * ap;
    x.valor += (p.units_total || 0) * ap;
    x.leads += p.leads_active || 0; x.leads30 += p.leads_30d || 0; x.convSum += p.conversion_pct || 0;
    x.healthSum += p.health_score || 0; x.alerts += (p.health_score || 100) < 45 ? 1 : 0;
    x.obraSum += p.construction_pct || 0;
    if (p.days_listed != null) { x.daysSum += p.days_listed; x.daysN += 1; }
    x.count += 1;
    return x;
  }, { total: 0, sold: 0, avail: 0, resv: 0, cobrado: 0, porCobrar: 0, enReserva: 0, valor: 0, leads: 0, leads30: 0, convSum: 0, healthSum: 0, alerts: 0, obraSum: 0, daysSum: 0, daysN: 0, count: 0 }), [scoped]);

  // serie de ritmo (8 sem) agregada al alcance
  const weekly = useMemo(() => Array.from({ length: 8 }, (_, i) => scoped.reduce((s, p) => s + norm8(p.weekly_sales)[i], 0)), [scoped]);

  // por zona (para tabla "Por zona" cuando alcance = todo)
  const zoneRows = useMemo(() => {
    const m = {};
    scoped.forEach(p => {
      const z = p.colonia || '—';
      if (!m[z]) m[z] = { zone: z, count: 0, total: 0, sold: 0, avail: 0, healthSum: 0, week: 0, leads: 0, porCobrar: 0, rate: 0 };
      const g = m[z];
      g.count++; g.total += p.units_total || 0; g.sold += soldOf(p); g.avail += availOf(p);
      g.healthSum += p.health_score || 0; g.week += norm8(p.weekly_sales).slice(-1)[0]; g.leads += p.leads_active || 0;
      g.porCobrar += porCobrar(p); g.rate += monthlyRate(p);
    });
    return Object.values(m).sort((x, y) => y.porCobrar - x.porCobrar);
  }, [scoped]);

  if (!projects) return null;

  const n = a.count || 1;
  const absorption = a.total ? Math.round(100 * a.sold / a.total) : 0;
  const ritmoMes = weekly.slice(-4).reduce((s, v) => s + v, 0);
  const ritmoSem = Math.round(ritmoMes / 4);
  const seAgota = ritmoMes > 0 ? Math.ceil(a.avail / ritmoMes) : null;
  const prev4 = weekly.slice(0, 4).reduce((s, v) => s + v, 0);
  const trendPct = prev4 > 0 ? Math.round((ritmoMes - prev4) / prev4 * 100) : (ritmoMes > 0 ? 100 : 0);
  const avgHealth = Math.round(a.healthSum / n);
  const avgConv = Math.round(a.convSum / n);
  const obraProm = Math.round(a.obraSum / n);
  const diasProm = a.daysN ? Math.round(a.daysSum / a.daysN) : null;
  const ticket = a.total ? a.valor / a.total : 0;
  const leadsPerUnit = a.avail ? (a.leads / a.avail).toFixed(1) : '—';

  const GROUPS = [
    { label: '💰 Dinero', tiles: [
      { label: 'Cobrado est.', value: fmtBig(a.cobrado), sub: `${absorption}% absorción`, accent: C_VEND },
      { label: 'Por cobrar est.', value: fmtBig(a.porCobrar), sub: `${a.avail} disponibles`, accent: C_RESV },
      { label: 'En reserva', value: fmtBig(a.enReserva), sub: `${a.resv} por cerrar`, accent: C_RESV },
      { label: 'Valor portafolio', value: fmtBig(a.valor), sub: `${a.total} unidades`, accent: C_DISP },
      { label: 'Ticket prom.', value: fmtBig(ticket), sub: 'por unidad', accent: C_DISP },
    ] },
    { label: '⚡ Velocidad de venta', tiles: [
      { label: 'Ritmo (sem.)', value: ritmoSem, sub: 'unidades/sem', accent: C_DISP },
      { label: 'Ventas/mes', value: ritmoMes, sub: 'últimas 4 sem', accent: C_DISP },
      { label: 'Absorción', value: `${absorption}%`, sub: `${a.sold} vendidas`, accent: C_VEND },
      { label: 'Se agota en', value: fmtMonths(seAgota), sub: 'a ritmo actual', accent: speedColor(seAgota) },
      { label: 'Tendencia', value: `${trendPct >= 0 ? '▲' : '▼'} ${Math.abs(trendPct)}%`, sub: 'vs mes previo', accent: trendPct >= 0 ? C_VEND : 'var(--hot, #F2635B)', valueColor: trendPct >= 0 ? C_VEND : 'var(--hot, #F2635B)' },
    ] },
    { label: '🎯 Demanda', tiles: [
      { label: 'Leads activos', value: a.leads, sub: 'sin cerrar', accent: C_DISP },
      { label: 'Nuevos (30d)', value: a.leads30, sub: 'entraron', accent: C_DISP },
      { label: 'Conversión', value: `${avgConv}%`, sub: 'lead → venta', accent: C_RESV },
      { label: 'Leads x unidad', value: leadsPerUnit, sub: 'demanda relativa', accent: Number(leadsPerUnit) >= 3 ? C_VEND : (Number(leadsPerUnit) < 1 ? 'var(--hot, #F2635B)' : C_RESV) },
    ] },
    { label: '❤️ Salud y riesgo', tiles: [
      { label: 'Salud prom.', value: avgHealth, sub: a.alerts ? `${a.alerts} en rojo` : 'sin alertas', accent: healthColor(avgHealth), valueColor: healthColor(avgHealth) },
      { label: 'En rojo', value: a.alerts, sub: 'requieren acción', accent: a.alerts ? 'var(--hot, #F2635B)' : C_VEND },
      { label: 'Obra prom.', value: `${obraProm}%`, sub: 'avance construcción', accent: C_DISP },
      { label: 'En mercado', value: diasProm != null ? `${diasProm}d` : '—', sub: 'antigüedad prom.', accent: C_DISP },
    ] },
  ];

  const multi = scoped.length > 1;
  const rankCobrar = [...scoped].sort((x, y) => porCobrar(y) - porCobrar(x)).slice(0, 6).map(p => ({ label: p.name, value: porCobrar(p) }));
  const rankDemanda = [...scoped].map(p => ({ label: p.name, value: availOf(p) ? +(p.leads_active / availOf(p)).toFixed(1) : 0 }))
    .sort((x, y) => y.value - x.value).slice(0, 6)
    .map(i => ({ ...i, color: i.value >= 3 ? C_VEND : (i.value < 1 ? 'var(--hot, #F2635B)' : C_RESV) }));

  const scopeLabel = mode === 'zona' ? zoneSel : mode === 'proyecto' ? (scoped[0]?.name || '') : 'todo el portafolio';

  return (
    <div data-testid="portfolio-cockpit">
      {/* 1) ALCANCE */}
      <ScopeBar mode={mode} setMode={setMode} zones={zones} zoneSel={zoneSel} setZoneSel={setZoneSel} projects={projects} projSel={projSel} setProjSel={setProjSel} />

      {/* 2) SIGNOS VITALES (recalculados al alcance) */}
      <div className="eyebrow" style={{ marginBottom: 12 }}>SIGNOS VITALES · {String(scopeLabel).toUpperCase()}</div>
      {GROUPS.map(g => <VitalGroup key={g.label} {...g} />)}

      {/* 3) GRÁFICAS con data real */}
      <div className="eyebrow" style={{ margin: '20px 0 12px' }}>LECTURA DEL MERCADO</div>
      <ChartCard
        title="Ritmo de ventas · últimas 8 semanas"
        sub="unidades cerradas por semana en el alcance elegido"
        right={<span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: trendPct >= 0 ? C_VEND : 'var(--hot, #F2635B)' }}>{trendPct >= 0 ? '▲' : '▼'} {Math.abs(trendPct)}%</span>}
      >
        <AreaChart series={weekly} color={C_DISP} />
      </ChartCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginTop: 14, marginBottom: 26 }}>
        <ChartCard title="Mix de inventario" sub={`${a.total} unidades en total`}>
          <StackedBar disp={a.avail} resv={a.resv} vend={a.sold} />
        </ChartCard>
        {multi && (
          <ChartCard title="Dónde está el dinero" sub="valor por cobrar por proyecto">
            <HBars items={rankCobrar} fmt={fmtBig} color={C_RESV} />
          </ChartCard>
        )}
        {multi && (
          <ChartCard title="Demanda relativa" sub="leads por unidad disponible · alto = subir precio">
            <HBars items={rankDemanda} fmt={(v) => `${v}`} />
          </ChartCard>
        )}
      </div>

      {/* 4) DETALLE */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
        <div className="eyebrow" style={{ margin: 0 }}>
          {tableView === 'proyecto' || mode !== 'all' ? 'DETALLE POR PROYECTO' : 'DETALLE POR ZONA'}
        </div>
        {mode === 'all' && (
          <div style={{ display: 'inline-flex', gap: 3, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))', borderRadius: 9999, padding: 3 }}>
            {[['proyecto', 'Por proyecto'], ['zona', 'Por zona']].map(([k, lbl]) => {
              const on = tableView === k;
              return (
                <button key={k} data-testid={`cockpit-view-${k}`} onClick={() => setTableView(k)}
                  style={{ padding: '5px 13px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: on ? 'linear-gradient(90deg, var(--theme), var(--theme-3, var(--theme)))' : 'transparent', color: on ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', fontSize: 11.5, fontWeight: on ? 700 : 500 }}>
                  {lbl}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface-2, rgba(var(--cream-rgb),0.03))', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '6px 0', marginBottom: 26, overflowX: 'auto' }}>
        {(tableView === 'proyecto' || mode !== 'all') ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: GRID_PROJ, gap: 12, padding: '8px 18px', minWidth: 980, borderBottom: '1px solid var(--border, rgba(var(--cream-rgb),0.08))' }}>
              {['Proyecto', 'Salud', '% Vendido', 'Obra', 'Ritmo', 'Se agota', 'Por cobrar', 'Leads', 'Conv.', ''].map((h, i) => (
                <div key={`${h}-${i}`} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{h}</div>
              ))}
            </div>
            {scoped.map(p => {
              const total = p.units_total || 0;
              const soldPct = total ? Math.round(100 * soldOf(p) / total) : 0;
              const hc = healthColor(p.health_score || 0);
              const r = monthlyRate(p);
              const months = r > 0 ? Math.ceil(availOf(p) / r) : null;
              return (
                <Link key={p.id} to={`/desarrollador/proyectos/${p.id}`} data-testid={`cockpit-proj-${p.id}`}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  style={{ display: 'grid', gridTemplateColumns: GRID_PROJ, gap: 12, padding: '12px 18px', minWidth: 980, alignItems: 'center', textDecoration: 'none', transition: 'background .12s', borderBottom: '1px solid rgba(var(--cream-rgb),0.05)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{p.colonia} · {(p.stage || '').replace('_', ' ')}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: hc, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: hc }}>{p.health_score ?? '—'}</span>
                  </div>
                  <div>
                    <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)', marginBottom: 3 }}>{soldPct}% <span style={{ color: 'var(--cream-3)', fontWeight: 400 }}>({soldOf(p)}/{total})</span></div>
                    <Bar pct={soldPct} color={C_VEND} />
                  </div>
                  <div>
                    <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)', marginBottom: 3 }}>{p.construction_pct ?? 0}%</div>
                    <Bar pct={p.construction_pct ?? 0} color={C_DISP} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MiniSpark data={p.weekly_sales} color={hc} />
                    <span style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{norm8(p.weekly_sales).slice(-1)[0]}</span>
                  </div>
                  <div style={{ ...cell, fontWeight: 700, color: speedColor(months) }}>{fmtMonths(months)}</div>
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{fmtBig(porCobrar(p))}<span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> ·{availOf(p)}u</span></div>
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{p.leads_active ?? 0}<span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> ·{p.leads_30d ?? 0}/30d</span></div>
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{p.conversion_pct ?? 0}%</div>
                  <ArrowRight size={14} color="var(--cream-3)" />
                </Link>
              );
            })}
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: GRID_ZONE, gap: 12, padding: '8px 18px', minWidth: 760, borderBottom: '1px solid var(--border, rgba(var(--cream-rgb),0.08))' }}>
              {['Zona', 'Salud prom.', '% Vendido', 'Inventario', 'Ritmo', 'Por cobrar', 'Leads'].map((h, i) => (
                <div key={`${h}-${i}`} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{h}</div>
              ))}
            </div>
            {zoneRows.map(z => {
              const soldPct = z.total ? Math.round(100 * z.sold / z.total) : 0;
              const avgH = Math.round(z.healthSum / (z.count || 1));
              const hc = healthColor(avgH);
              const months = z.rate > 0 ? Math.ceil(z.avail / z.rate) : null;
              return (
                <button key={z.zone} data-testid={`cockpit-zone-${z.zone}`} onClick={() => { setMode('zona'); setZoneSel(z.zone); }}
                  style={{ display: 'grid', gridTemplateColumns: GRID_ZONE, gap: 12, padding: '12px 18px', minWidth: 760, alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(var(--cream-rgb),0.05)', cursor: 'pointer' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{z.zone}</div>
                    <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{z.count} proyecto{z.count !== 1 ? 's' : ''} · se agota en {fmtMonths(months)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: hc, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: hc }}>{avgH}</span>
                  </div>
                  <div>
                    <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)', marginBottom: 3 }}>{soldPct}% <span style={{ color: 'var(--cream-3)', fontWeight: 400 }}>({z.sold}/{z.total})</span></div>
                    <Bar pct={soldPct} color={C_VEND} />
                  </div>
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{z.avail}<span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> disp.</span></div>
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{z.week}<span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> u/sem</span></div>
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{fmtBig(z.porCobrar)}</div>
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{z.leads}</div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

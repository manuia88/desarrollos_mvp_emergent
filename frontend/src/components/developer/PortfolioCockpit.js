// Tablero central del operador — visibilidad de TODO el portafolio de un vistazo.
// Signos vitales (agregado) + cortes: por PROYECTO o por ZONA.
// Instrumentos vivos: salud, %vendido, obra, ritmo/sparkline, se agota en, por cobrar,
// leads, conversión. Datos: listProjectsWithStats (sin llamadas extra).
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProjectsWithStats } from '../../api/developer';
import { ArrowRight } from '../icons';

const fmtBig = (n) => {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};
const healthColor = (s) => (s >= 70 ? 'var(--ok, #1FA06A)' : s >= 45 ? 'var(--warm, #E2982E)' : 'var(--hot, #F2635B)');
// Inventario que se agota rápido = bueno (verde); lento = alerta (rojo)
const speedColor = (m) => (m == null ? 'var(--cream-3)' : m <= 6 ? 'var(--ok, #1FA06A)' : m <= 18 ? 'var(--warm, #E2982E)' : 'var(--hot, #F2635B)');

const avgPrice = (p) => { const f = p.price_from || 0, t = p.price_to || 0; return t > f ? (f + t) / 2 : f; };
const availOf = (p) => (p.units_by_status || {}).disponible || 0;
const porCobrar = (p) => availOf(p) * avgPrice(p);                       // valor de inventario por vender
const monthlyRate = (p) => (p.weekly_sales || []).slice(-4).reduce((a, b) => a + (Number(b) || 0), 0); // ~ventas/mes
const monthsToSellOut = (p) => { const r = monthlyRate(p); const av = availOf(p); return r > 0 ? Math.ceil(av / r) : null; };
const fmtMonths = (m) => (m == null ? '—' : m >= 60 ? '60+ m' : `${m} m`);

function Sparkline({ data = [], color = 'var(--theme, #6D4AFF)', w = 64, h = 22 }) {
  const vals = (data || []).map(Number).filter(v => !isNaN(v));
  if (vals.length < 2) return <div style={{ width: w, height: h, fontSize: 10, color: 'var(--cream-3)' }}>—</div>;
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0), rng = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / rng) * (h - 3) - 1.5}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Bar({ pct, color }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--cream-rgb),0.10)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
    </div>
  );
}

function VitalTile({ label, value, sub, accent = 'var(--theme, #6D4AFF)' }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 11, padding: '11px 12px 11px 13px', boxShadow: 'var(--asr-shadow, none)' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', letterSpacing: '-0.02em', lineHeight: 1.15, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--cream-2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const cell = { fontSize: 12.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' };
const GRID_PROJ = '1.5fr 0.7fr 1.05fr 0.95fr 0.95fr 0.85fr 1fr 0.75fr 0.7fr 26px';
const GRID_ZONE = '1.5fr 0.8fr 1.15fr 0.95fr 0.9fr 1.05fr 0.75fr';

function ViewSwitch({ view, setView }) {
  const opts = [['proyecto', 'Por proyecto'], ['zona', 'Por zona']];
  return (
    <div style={{ display: 'inline-flex', gap: 3, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))', borderRadius: 9999, padding: 3 }}>
      {opts.map(([k, lbl]) => {
        const on = view === k;
        return (
          <button key={k} data-testid={`cockpit-view-${k}`} onClick={() => setView(k)}
            style={{
              padding: '5px 13px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              background: on ? 'linear-gradient(90deg, var(--theme), var(--theme-3, var(--theme)))' : 'transparent',
              color: on ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', fontSize: 11.5, fontWeight: on ? 700 : 500,
            }}>
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

export default function PortfolioCockpit() {
  const [projects, setProjects] = useState(null);
  const [view, setView] = useState('proyecto');
  useEffect(() => {
    listProjectsWithStats()
      .then(r => setProjects(Array.isArray(r) ? r : (r.projects || r.items || [])))
      .catch(() => setProjects([]));
  }, []);

  // Signos vitales agregados (TODO el inventario)
  const a = useMemo(() => (projects || []).reduce((x, p) => {
    const s = p.units_by_status || {};
    x.total += p.units_total || 0; x.sold += s.vendido || 0; x.avail += s.disponible || 0; x.resv += s.reservado || 0;
    x.revenue += p.revenue_mtd_est || 0; x.leads += p.leads_active || 0; x.leads30 += p.leads_30d || 0;
    x.healthSum += p.health_score || 0; x.week += (p.weekly_sales || []).slice(-1)[0] || 0;
    x.convSum += p.conversion_pct || 0; x.alerts += (p.health_score || 100) < 45 ? 1 : 0;
    x.porCobrar += porCobrar(p); x.rate += monthlyRate(p);
    return x;
  }, { total: 0, sold: 0, avail: 0, resv: 0, revenue: 0, leads: 0, leads30: 0, healthSum: 0, week: 0, convSum: 0, alerts: 0, porCobrar: 0, rate: 0 }), [projects]);

  // Agregado por zona (colonia)
  const zones = useMemo(() => {
    const m = {};
    (projects || []).forEach(p => {
      const z = p.colonia || '—';
      if (!m[z]) m[z] = { zone: z, count: 0, total: 0, sold: 0, avail: 0, healthSum: 0, week: 0, leads: 0, porCobrar: 0, rate: 0 };
      const g = m[z], s = p.units_by_status || {};
      g.count++; g.total += p.units_total || 0; g.sold += s.vendido || 0; g.avail += s.disponible || 0;
      g.healthSum += p.health_score || 0; g.week += (p.weekly_sales || []).slice(-1)[0] || 0; g.leads += p.leads_active || 0;
      g.porCobrar += porCobrar(p); g.rate += monthlyRate(p);
    });
    return Object.values(m).sort((x, y) => y.porCobrar - x.porCobrar);
  }, [projects]);

  if (!projects) return null;

  const n = projects.length || 1;
  const absorption = a.total ? Math.round(100 * a.sold / a.total) : 0;
  const avgHealth = Math.round(a.healthSum / n);
  const avgConv = Math.round(a.convSum / n);
  const portfolioMonths = a.rate > 0 ? Math.ceil(a.avail / a.rate) : null;

  const VITALS = [
    { label: 'Cobrado est.', value: fmtBig(a.revenue), sub: `${absorption}% absorción`, accent: 'var(--ok, #1FA06A)' },
    { label: 'Por cobrar est.', value: fmtBig(a.porCobrar), sub: `${a.avail} disponibles`, accent: 'var(--warm, #E2982E)' },
    { label: 'Se agota en', value: fmtMonths(portfolioMonths), sub: 'a ritmo actual', accent: speedColor(portfolioMonths) },
    { label: 'Reservadas', value: a.resv, sub: 'por cerrar', accent: 'var(--warm, #E2982E)' },
    { label: 'Vendidas', value: a.sold, sub: `de ${a.total} unidades`, accent: 'var(--ok, #1FA06A)' },
    { label: 'Ritmo (sem.)', value: a.week, sub: 'unidades/sem', accent: 'var(--theme, #6D4AFF)' },
    { label: 'Leads activos', value: a.leads, sub: `${a.leads30} en 30d`, accent: 'var(--theme, #6D4AFF)' },
    { label: 'Conversión', value: `${avgConv}%`, sub: 'promedio', accent: 'var(--warm, #E2982E)' },
    { label: 'Salud prom.', value: `${avgHealth}`, sub: a.alerts ? `${a.alerts} en rojo` : 'sin alertas', accent: healthColor(avgHealth) },
    { label: 'Proyectos', value: n, sub: `${zones.length} zonas`, accent: 'var(--theme, #6D4AFF)' },
  ];

  return (
    <div data-testid="portfolio-cockpit">
      {/* SIGNOS VITALES — todo el portafolio en una línea */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>SIGNOS VITALES DEL PORTAFOLIO</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 10, marginBottom: 24 }}>
        {VITALS.map(v => <VitalTile key={v.label} {...v} />)}
      </div>

      {/* TABLERO CENTRAL — selector de corte: por proyecto o por zona */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
        <div className="eyebrow" style={{ margin: 0 }}>
          {view === 'proyecto' ? 'TUS PROYECTOS · TODOS LOS INSTRUMENTOS' : 'TUS ZONAS · DÓNDE ESTÁ EL DINERO'}
        </div>
        <ViewSwitch view={view} setView={setView} />
      </div>

      <div style={{ background: 'var(--surface-2, rgba(var(--cream-rgb),0.03))', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '6px 0', marginBottom: 26, overflowX: 'auto' }}>
        {view === 'proyecto' ? (
          <>
            {/* Header proyecto */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID_PROJ, gap: 12, padding: '8px 18px', minWidth: 980, borderBottom: '1px solid var(--border, rgba(var(--cream-rgb),0.08))' }}>
              {['Proyecto', 'Salud', '% Vendido', 'Obra', 'Ritmo', 'Se agota', 'Por cobrar', 'Leads', 'Conv.', ''].map((h, i) => (
                <div key={`${h}-${i}`} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{h}</div>
              ))}
            </div>
            {projects.map(p => {
              const s = p.units_by_status || {};
              const total = p.units_total || 0;
              const soldPct = total ? Math.round(100 * (s.vendido || 0) / total) : 0;
              const hc = healthColor(p.health_score || 0);
              const months = monthsToSellOut(p);
              return (
                <Link key={p.id} to={`/desarrollador/proyectos/${p.id}`} data-testid={`cockpit-proj-${p.id}`}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  style={{ display: 'grid', gridTemplateColumns: GRID_PROJ, gap: 12, padding: '12px 18px', minWidth: 980, alignItems: 'center', textDecoration: 'none', transition: 'background .12s', borderBottom: '1px solid rgba(var(--cream-rgb),0.05)' }}>
                  {/* Proyecto */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{p.colonia} · {(p.stage || '').replace('_', ' ')}</div>
                  </div>
                  {/* Salud */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: hc, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: hc }}>{p.health_score ?? '—'}</span>
                  </div>
                  {/* % Vendido */}
                  <div>
                    <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)', marginBottom: 3 }}>{soldPct}% <span style={{ color: 'var(--cream-3)', fontWeight: 400 }}>({s.vendido || 0}/{total})</span></div>
                    <Bar pct={soldPct} color="var(--ok, #1FA06A)" />
                  </div>
                  {/* Obra */}
                  <div>
                    <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)', marginBottom: 3 }}>{p.construction_pct ?? 0}%</div>
                    <Bar pct={p.construction_pct ?? 0} color="var(--theme, #6D4AFF)" />
                  </div>
                  {/* Ritmo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkline data={p.weekly_sales} color={hc} />
                    <span style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{(p.weekly_sales || []).slice(-1)[0] ?? 0}</span>
                  </div>
                  {/* Se agota en */}
                  <div style={{ ...cell, fontWeight: 700, color: speedColor(months) }}>{fmtMonths(months)}</div>
                  {/* Por cobrar */}
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{fmtBig(porCobrar(p))}<span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> ·{availOf(p)}u</span></div>
                  {/* Leads */}
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{p.leads_active ?? 0}<span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> ·{p.leads_30d ?? 0}/30d</span></div>
                  {/* Conversión */}
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{p.conversion_pct ?? 0}%</div>
                  {/* arrow */}
                  <ArrowRight size={14} color="var(--cream-3)" />
                </Link>
              );
            })}
          </>
        ) : (
          <>
            {/* Header zona */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID_ZONE, gap: 12, padding: '8px 18px', minWidth: 760, borderBottom: '1px solid var(--border, rgba(var(--cream-rgb),0.08))' }}>
              {['Zona', 'Salud prom.', '% Vendido', 'Inventario', 'Ritmo', 'Por cobrar', 'Leads'].map((h, i) => (
                <div key={`${h}-${i}`} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{h}</div>
              ))}
            </div>
            {zones.map(z => {
              const soldPct = z.total ? Math.round(100 * z.sold / z.total) : 0;
              const avgH = Math.round(z.healthSum / (z.count || 1));
              const hc = healthColor(avgH);
              const months = z.rate > 0 ? Math.ceil(z.avail / z.rate) : null;
              return (
                <div key={z.zone} data-testid={`cockpit-zone-${z.zone}`}
                  style={{ display: 'grid', gridTemplateColumns: GRID_ZONE, gap: 12, padding: '12px 18px', minWidth: 760, alignItems: 'center', borderBottom: '1px solid rgba(var(--cream-rgb),0.05)' }}>
                  {/* Zona */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{z.zone}</div>
                    <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{z.count} proyecto{z.count !== 1 ? 's' : ''} · se agota en {fmtMonths(months)}</div>
                  </div>
                  {/* Salud prom. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: hc, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: hc }}>{avgH}</span>
                  </div>
                  {/* % Vendido */}
                  <div>
                    <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)', marginBottom: 3 }}>{soldPct}% <span style={{ color: 'var(--cream-3)', fontWeight: 400 }}>({z.sold}/{z.total})</span></div>
                    <Bar pct={soldPct} color="var(--ok, #1FA06A)" />
                  </div>
                  {/* Inventario */}
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{z.avail}<span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> disp.</span></div>
                  {/* Ritmo */}
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{z.week}<span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> u/sem</span></div>
                  {/* Por cobrar */}
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{fmtBig(z.porCobrar)}</div>
                  {/* Leads */}
                  <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{z.leads}</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

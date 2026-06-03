// Tablero central del operador — visibilidad de TODO el portafolio de un vistazo.
// Signos vitales (agregado) + cada proyecto con sus instrumentos vivos
// (salud, %vendido, obra, ritmo/sparkline, leads, conversión). Datos: listProjectsWithStats.
import React, { useEffect, useState } from 'react';
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

export default function PortfolioCockpit() {
  const [projects, setProjects] = useState(null);
  useEffect(() => {
    listProjectsWithStats()
      .then(r => setProjects(Array.isArray(r) ? r : (r.projects || r.items || [])))
      .catch(() => setProjects([]));
  }, []);
  if (!projects) return null;

  // Signos vitales agregados
  const a = projects.reduce((x, p) => {
    const s = p.units_by_status || {};
    x.total += p.units_total || 0; x.sold += s.vendido || 0; x.avail += s.disponible || 0; x.resv += s.reservado || 0;
    x.revenue += p.revenue_mtd_est || 0; x.leads += p.leads_active || 0; x.leads30 += p.leads_30d || 0;
    x.healthSum += p.health_score || 0; x.week += (p.weekly_sales || []).slice(-1)[0] || 0;
    x.convSum += p.conversion_pct || 0; x.alerts += (p.health_score || 100) < 45 ? 1 : 0;
    return x;
  }, { total: 0, sold: 0, avail: 0, resv: 0, revenue: 0, leads: 0, leads30: 0, healthSum: 0, week: 0, convSum: 0, alerts: 0 });
  const n = projects.length || 1;
  const absorption = a.total ? Math.round(100 * a.sold / a.total) : 0;
  const avgHealth = Math.round(a.healthSum / n);
  const avgConv = Math.round(a.convSum / n);

  const VITALS = [
    { label: 'Cobrado est.', value: fmtBig(a.revenue), sub: `${absorption}% absorción`, accent: 'var(--ok, #1FA06A)' },
    { label: 'Disponibles', value: a.avail, sub: `de ${a.total} unidades`, accent: 'var(--theme, #6D4AFF)' },
    { label: 'Reservadas', value: a.resv, sub: 'por cerrar', accent: 'var(--warm, #E2982E)' },
    { label: 'Vendidas', value: a.sold, sub: `${absorption}%`, accent: 'var(--ok, #1FA06A)' },
    { label: 'Ritmo (sem.)', value: a.week, sub: 'unidades/sem', accent: 'var(--theme, #6D4AFF)' },
    { label: 'Leads activos', value: a.leads, sub: `${a.leads30} en 30d`, accent: 'var(--theme, #6D4AFF)' },
    { label: 'Conversión', value: `${avgConv}%`, sub: 'promedio', accent: 'var(--warm, #E2982E)' },
    { label: 'Salud prom.', value: `${avgHealth}`, sub: a.alerts ? `${a.alerts} en rojo` : 'sin alertas', accent: healthColor(avgHealth) },
  ];

  return (
    <div data-testid="portfolio-cockpit">
      {/* SIGNOS VITALES — todo el portafolio en una línea */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>SIGNOS VITALES DEL PORTAFOLIO</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 10, marginBottom: 24 }}>
        {VITALS.map(v => <VitalTile key={v.label} {...v} />)}
      </div>

      {/* TABLERO CENTRAL — cada proyecto con sus instrumentos vivos */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>TUS PROYECTOS · TODOS LOS INSTRUMENTOS</div>
      <div style={{ background: 'var(--surface-2, rgba(var(--cream-rgb),0.03))', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '6px 0', marginBottom: 26, overflowX: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 1.1fr 1fr 1fr 0.9fr 0.9fr 28px', gap: 12, padding: '8px 18px', minWidth: 820, borderBottom: '1px solid var(--border, rgba(var(--cream-rgb),0.08))' }}>
          {['Proyecto', 'Salud', '% Vendido', 'Obra', 'Ritmo', 'Leads', 'Conv.', ''].map(h => (
            <div key={h} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{h}</div>
          ))}
        </div>
        {projects.map(p => {
          const s = p.units_by_status || {};
          const total = p.units_total || 0;
          const soldPct = total ? Math.round(100 * (s.vendido || 0) / total) : 0;
          const hc = healthColor(p.health_score || 0);
          return (
            <Link key={p.id} to={`/desarrollador/proyectos/${p.id}`} data-testid={`cockpit-proj-${p.id}`}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 1.1fr 1fr 1fr 0.9fr 0.9fr 28px', gap: 12, padding: '12px 18px', minWidth: 820, alignItems: 'center', textDecoration: 'none', transition: 'background .12s', borderBottom: '1px solid rgba(var(--cream-rgb),0.05)' }}>
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
              {/* Leads */}
              <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{p.leads_active ?? 0}<span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> ·{p.leads_30d ?? 0}/30d</span></div>
              {/* Conversión */}
              <div style={{ ...cell, fontWeight: 700, color: 'var(--cream)' }}>{p.conversion_pct ?? 0}%</div>
              {/* arrow */}
              <ArrowRight size={14} color="var(--cream-3)" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

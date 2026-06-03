// Inteligencia de Zona — cada zona es un panel de mercado con data REAL y
// visualizaciones variadas según el tipo de dato:
//  · Radar de 6 ejes de calidad (vida/movilidad/seguridad/comercio/plusvalía/educación)
//  · Tendencia de precio/m² (24 meses, área)
//  · Precio/m² + momentum + tier (KPIs)
//  · Tu posición real por colonia (inventario/ritmo/leads) + Live Pulse cuando fluya
//  · VEREDICTO de acción que cruza mercado × tu negocio
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import { listProjectsWithStats } from '../../api/developer';
import { getZones } from '../../api/live_pulse';
import { COLONIAS } from '../../data/colonias';
import { ArrowRight } from '../icons';

/* ── helpers ── */
const fmtBig = (n) => {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const avgPrice = (p) => { const f = p.price_from || 0, t = p.price_to || 0; return t > f ? (f + t) / 2 : f; };
const norm8 = (arr) => { const a = (arr || []).map(Number).map(v => (isNaN(v) ? 0 : v)).slice(-8); while (a.length < 8) a.unshift(0); return a; };
const speedColor = (m) => (m == null ? 'var(--cream-3)' : m <= 6 ? 'var(--ok, #1FA06A)' : m <= 18 ? 'var(--warm, #E2982E)' : 'var(--hot, #F2635B)');

// Índice de mercado por colonia (data real, frontend/src/data/colonias.js)
const COL = {};
COLONIAS.forEach(c => { COL[c.key] = c; COL[slug(c.name)] = c; });
const momentumNum = (m) => { const n = parseFloat(String(m || '').replace(/[^0-9.-]/g, '')); return isNaN(n) ? null : n; };

const AXES = [['vida', 'Vida'], ['movilidad', 'Movilidad'], ['seguridad', 'Seguridad'], ['comercio', 'Comercio'], ['plusvalia', 'Plusvalía'], ['educacion', 'Educación']];
const TIER_C = { Premium: '#6366F1', Luxury: '#A78BFA', Trendy: '#EC4899', Emergente: '#1FA06A' };

const bucketMeta = (score) => {
  if (score == null) return null;
  if (score <= 40) return { label: 'Fría', c: '#6b7280', bg: 'rgba(120,120,128,0.14)' };
  if (score <= 65) return { label: 'Templada', c: 'var(--warm, #E2982E)', bg: 'rgba(234,179,8,0.14)' };
  if (score <= 85) return { label: 'Caliente', c: '#f97316', bg: 'rgba(249,115,22,0.15)' };
  return { label: 'En fuego', c: 'var(--hot, #F2635B)', bg: 'rgba(239,68,68,0.15)' };
};

// VEREDICTO: cruza mercado (plusvalía/momentum/calor) × tu posición → qué hacer
function verdict({ heat, months, demandaRel, avail, obra, momentum, plusvalia }) {
  if (avail === 0) return { txt: 'Agotada — replica el modelo', tone: 'good', why: 'no te queda inventario aquí' };
  if (demandaRel >= 3) return { txt: 'Subir precio o liberar más unidades', tone: 'good', why: 'muchos leads por unidad disponible' };
  if (heat != null && heat >= 70 && months != null && months <= 9) return { txt: 'Ventana para subir precio', tone: 'good', why: 'demanda alta y se agota pronto' };
  if (momentum != null && momentum >= 6 && months != null && months <= 18) return { txt: 'Zona apreciándose — sube precio', tone: 'good', why: `precio/m² subiendo ${momentum}%` };
  if (months != null && months > 24) return { txt: 'Promocionar / revisar precio', tone: 'bad', why: 'inventario lento, tarda en venderse' };
  if (demandaRel < 1) return { txt: 'Generar demanda (marketing/fotos)', tone: 'warn', why: 'pocos leads por unidad' };
  if (obra != null && obra < 50 && months != null && months <= 12) return { txt: 'Acelerar obra', tone: 'warn', why: 'se vende más rápido de lo que construyes' };
  if (plusvalia != null && plusvalia >= 85) return { txt: 'Sostén precio — alta plusvalía', tone: 'good', why: 'zona muy valorizada' };
  return { txt: 'Sostener el ritmo', tone: 'neutral', why: 'oferta y demanda equilibradas' };
}
const toneColor = { good: 'var(--ok, #1FA06A)', warn: 'var(--warm, #E2982E)', bad: 'var(--hot, #F2635B)', neutral: 'var(--theme, #6D4AFF)' };

const onCardEnter = (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px -12px rgba(109,74,255,0.40)'; e.currentTarget.style.borderColor = 'rgba(109,74,255,0.45)'; };
const onCardLeave = (e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--asr-shadow, none)'; e.currentTarget.style.borderColor = 'var(--border-2, var(--border))'; };

function VizPanel({ title, children, height = 150 }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 4 }}>{title}</div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function KStat({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15.5, color: color || 'var(--cream)', letterSpacing: '-0.02em', lineHeight: 1.25 }}>{value}</div>
    </div>
  );
}

export default function ZoneIntelligence({ user, colonia }) {
  const [projects, setProjects] = useState(null);
  const [pulseMap, setPulseMap] = useState({});

  useEffect(() => {
    listProjectsWithStats()
      .then(r => setProjects(Array.isArray(r) ? r : (r.projects || r.items || [])))
      .catch(() => setProjects([]));
    getZones({ limit: 100 })
      .then(r => { const m = {}; (r.body?.zones || []).forEach(z => { if (z.zone_slug) m[z.zone_slug] = z; }); setPulseMap(m); })
      .catch(() => setPulseMap({}));
  }, []);

  const zones = useMemo(() => {
    const m = {};
    (projects || []).forEach(p => {
      const name = p.colonia || '—';
      if (!m[name]) m[name] = { name, slug: slug(name), count: 0, total: 0, sold: 0, avail: 0, resv: 0, healthSum: 0, obraSum: 0, leads: 0, porCobrar: 0, rate: 0 };
      const g = m[name], s = p.units_by_status || {};
      g.count++; g.total += p.units_total || 0; g.sold += s.vendido || 0; g.avail += s.disponible || 0; g.resv += s.reservado || 0;
      g.healthSum += p.health_score || 0; g.obraSum += p.construction_pct || 0; g.leads += p.leads_active || 0;
      g.porCobrar += (s.disponible || 0) * avgPrice(p);
      g.rate += norm8(p.weekly_sales).slice(-4).reduce((x, v) => x + v, 0);
    });
    let arr = Object.values(m).sort((a, b) => b.porCobrar - a.porCobrar);
    if (colonia) arr = arr.filter(z => z.slug === colonia || z.name === colonia);  // filtro de alcance
    return arr;
  }, [projects, colonia]);

  if (!projects) return null;
  if (zones.length === 0) return null;

  return (
    <div data-testid="zone-intelligence" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 14 }}>
      {zones.map(z => {
        const mkt = COL[z.slug] || null;                       // data real de mercado de la colonia
        const pulse = pulseMap[z.slug] || null;
        const heat = pulse ? Number(pulse.score) : null;
        const bm = bucketMeta(heat);
        const months = z.rate > 0 ? Math.ceil(z.avail / z.rate) : null;
        const demandaRel = z.avail ? +(z.leads / z.avail).toFixed(1) : 0;
        const absorption = z.total ? Math.round(100 * z.sold / z.total) : 0;
        const avgH = Math.round(z.healthSum / (z.count || 1));
        const obraProm = Math.round(z.obraSum / (z.count || 1));
        const mom = mkt ? momentumNum(mkt.momentum) : null;
        const plus = mkt ? mkt.scores?.plusvalia : null;
        const v = verdict({ heat, months, demandaRel, avail: z.avail, obra: obraProm, momentum: mom, plusvalia: plus });
        const vc = toneColor[v.tone];
        const tierC = mkt ? (TIER_C[mkt.tier] || 'var(--theme)') : 'var(--theme)';
        const radarData = mkt ? AXES.map(([k, lbl]) => ({ axis: lbl, v: mkt.scores?.[k] ?? 0 })) : [];
        const trendData = mkt ? mkt.trend.map((val, i) => ({ i, v: val })) : [];
        const tMin = trendData.length ? Math.min(...mkt.trend) : 0;
        const tMax = trendData.length ? Math.max(...mkt.trend) : 0;

        return (
          <div key={z.name} data-testid={`zone-intel-${z.slug}`} onMouseEnter={onCardEnter} onMouseLeave={onCardLeave}
            style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '15px 16px', boxShadow: 'var(--asr-shadow, none)', transition: 'transform .16s, box-shadow .16s, border-color .16s', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* header: zona + alcaldía + tier + calor */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{z.name}</div>
                <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{mkt?.alcaldia || `${z.count} proyecto${z.count !== 1 ? 's' : ''}`} · salud {avgH}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {mkt && <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 9999, fontFamily: 'DM Sans,sans-serif', fontSize: 10, fontWeight: 800, background: `${tierC}1f`, color: tierC, textTransform: 'uppercase', letterSpacing: '.05em' }}>{mkt.tier}</span>}
                {bm && <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 9999, fontFamily: 'DM Sans,sans-serif', fontSize: 10, fontWeight: 800, background: bm.bg, color: bm.c, textTransform: 'uppercase', letterSpacing: '.05em' }}>{bm.label}</span>}
              </div>
            </div>

            {/* KPIs de mercado: precio/m² · momentum · inventario zona · calor */}
            <div style={{ display: 'flex', gap: 10 }}>
              <KStat label="Precio / m²" value={mkt ? mkt.priceM2 : '—'} />
              <KStat label="Tendencia" value={mkt ? mkt.momentum : '—'} color={mkt ? (mkt.momentumPositive ? 'var(--ok, #1FA06A)' : 'var(--hot, #F2635B)') : undefined} />
              <KStat label="Oferta zona" value={mkt ? mkt.inventory : '—'} />
              <KStat label="Calor demanda" value={heat != null ? heat : '—'} color={bm ? bm.c : undefined} />
            </div>

            {/* 2 visualizaciones: radar de calidad + tendencia de precio */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <VizPanel title="Calidad de la zona (6 ejes)">
                {mkt ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="72%">
                      <PolarGrid stroke="rgba(120,120,128,0.25)" />
                      <PolarAngleAxis dataKey="axis" tick={{ fontSize: 8.5, fill: 'var(--cream-3)' }} />
                      <Radar dataKey="v" stroke="var(--theme, #6D4AFF)" fill="var(--theme, #6D4AFF)" fillOpacity={0.28} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : <div style={{ fontSize: 11, color: 'var(--cream-3)', paddingTop: 30, textAlign: 'center' }}>Zona sin índice de mercado</div>}
              </VizPanel>
              <VizPanel title={mkt ? `Precio/m² · 24 meses ($${tMin}k → $${tMax}k)` : 'Tendencia de precio'}>
                {mkt ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                      <defs>
                        <linearGradient id={`g-${z.slug}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--theme, #6D4AFF)" stopOpacity={0.32} />
                          <stop offset="100%" stopColor="var(--theme, #6D4AFF)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke="var(--theme, #6D4AFF)" strokeWidth={1.8} fill={`url(#g-${z.slug})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div style={{ fontSize: 11, color: 'var(--cream-3)', paddingTop: 30, textAlign: 'center' }}>—</div>}
              </VizPanel>
            </div>

            {/* tu posición (data real de tu inventario) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, padding: '9px 0', borderTop: '1px solid rgba(var(--cream-rgb),0.07)', borderBottom: '1px solid rgba(var(--cream-rgb),0.07)' }}>
              <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' }}><b style={{ color: 'var(--cream)' }}>{z.avail}</b> disp. · <b style={{ color: 'var(--cream)' }}>{absorption}%</b> vendido · se agota <b style={{ color: speedColor(months) }}>{months != null ? `${months}m` : '—'}</b></span>
              <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' }}>Por cobrar <b style={{ color: 'var(--cream)' }}>{fmtBig(z.porCobrar)}</b> · leads/u <b style={{ color: demandaRel >= 3 ? 'var(--ok, #1FA06A)' : demandaRel < 1 ? 'var(--hot, #F2635B)' : 'var(--warm, #E2982E)' }}>{z.avail ? demandaRel : '—'}</b></span>
            </div>

            {/* VEREDICTO */}
            <div style={{ border: `1px solid ${vc}`, borderRadius: 10, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: vc, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: vc, letterSpacing: '-0.01em' }}>{v.txt}</div>
                <div style={{ fontSize: 10.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' }}>{v.why}</div>
              </div>
            </div>

            <Link to={`/desarrollador/inteligencia?zona=${z.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--theme, #6D4AFF)', textDecoration: 'none', marginTop: -2 }}>
              Ver zona a fondo <ArrowRight size={12} />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

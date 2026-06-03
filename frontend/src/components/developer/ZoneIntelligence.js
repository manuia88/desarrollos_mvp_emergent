// Inteligencia de Zona — cada zona es un mini-cockpit que FUSIONA el mercado
// (Live Pulse: calor + 5 señales) con TU negocio (inventario/ritmo/leads por colonia)
// y termina en un VEREDICTO de acción. Datos reales donde fluyen; el resto se
// autollena cuando llega (construir para el estado final).
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProjectsWithStats } from '../../api/developer';
import { getZones } from '../../api/live_pulse';
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
const healthColor = (s) => (s >= 70 ? 'var(--ok, #1FA06A)' : s >= 45 ? 'var(--warm, #E2982E)' : 'var(--hot, #F2635B)');

const bucketMeta = (score) => {
  if (score == null) return { label: 'Sin datos aún', c: 'var(--cream-3)', bg: 'rgba(var(--cream-rgb),0.08)' };
  if (score <= 40) return { label: 'Fría', c: '#6b7280', bg: 'rgba(120,120,128,0.14)' };
  if (score <= 65) return { label: 'Templada', c: 'var(--warm, #E2982E)', bg: 'rgba(234,179,8,0.14)' };
  if (score <= 85) return { label: 'Caliente', c: '#f97316', bg: 'rgba(249,115,22,0.15)' };
  return { label: 'En fuego', c: 'var(--hot, #F2635B)', bg: 'rgba(239,68,68,0.15)' };
};

const SIGNALS = [
  ['search_velocity', 'Búsquedas'], ['view_velocity', 'Vistas'], ['trend_velocity', 'Tendencia'],
  ['lead_velocity', 'Leads'], ['price_velocity', 'Precio'],
];

// VEREDICTO: cruza calor de mercado + tu posición → qué hacer hoy
function verdict({ heat, months, demandaRel, avail, obra }) {
  if (avail === 0) return { txt: 'Agotada — replicar el modelo', tone: 'good', why: 'no te queda inventario aquí' };
  if (heat != null && heat >= 70 && months != null && months <= 9) return { txt: 'Ventana para subir precio', tone: 'good', why: 'demanda alta y se agota pronto' };
  if (demandaRel >= 3) return { txt: 'Subir precio o liberar más unidades', tone: 'good', why: 'muchos leads por unidad disponible' };
  if (months != null && months > 24) return { txt: 'Promocionar / revisar precio', tone: 'bad', why: 'inventario lento, tarda en venderse' };
  if (demandaRel < 1) return { txt: 'Generar demanda (marketing/fotos)', tone: 'warn', why: 'pocos leads por unidad' };
  if (obra != null && obra < 50 && months != null && months <= 12) return { txt: 'Acelerar obra', tone: 'warn', why: 'se vende más rápido de lo que construyes' };
  return { txt: 'Sostener el ritmo', tone: 'neutral', why: 'oferta y demanda equilibradas' };
}
const toneColor = { good: 'var(--ok, #1FA06A)', warn: 'var(--warm, #E2982E)', bad: 'var(--hot, #F2635B)', neutral: 'var(--theme, #6D4AFF)' };

const onCardEnter = (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px -12px rgba(109,74,255,0.40)'; e.currentTarget.style.borderColor = 'rgba(109,74,255,0.45)'; };
const onCardLeave = (e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--asr-shadow, none)'; e.currentTarget.style.borderColor = 'var(--border-2, var(--border))'; };

function Mini({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: color || 'var(--cream)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

function SignalBar({ label, score }) {
  const has = score != null && !isNaN(score);
  const c = !has ? 'var(--cream-3)' : score >= 66 ? 'var(--hot, #F2635B)' : score >= 40 ? 'var(--warm, #E2982E)' : 'var(--theme, #6D4AFF)';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 26px', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 10.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' }}>{label}</span>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(var(--cream-rgb),0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${has ? Math.max(4, Math.min(100, score)) : 0}%`, background: c, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--cream-3)', fontFamily: 'DM Sans,sans-serif', textAlign: 'right' }}>{has ? Math.round(score) : '—'}</span>
    </div>
  );
}

export default function ZoneIntelligence({ user }) {
  const [projects, setProjects] = useState(null);
  const [pulseMap, setPulseMap] = useState({});

  useEffect(() => {
    listProjectsWithStats()
      .then(r => setProjects(Array.isArray(r) ? r : (r.projects || r.items || [])))
      .catch(() => setProjects([]));
    getZones({ limit: 100 })
      .then(r => {
        const map = {};
        (r.body?.zones || []).forEach(z => { if (z.zone_slug) map[z.zone_slug] = z; });
        setPulseMap(map);
      })
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
    return Object.values(m).sort((a, b) => b.porCobrar - a.porCobrar);
  }, [projects]);

  if (!projects) return null;
  if (zones.length === 0) return null;

  return (
    <div data-testid="zone-intelligence" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
      {zones.map(z => {
        const pulse = pulseMap[z.slug] || null;
        const heat = pulse ? Number(pulse.score) : null;
        const bm = bucketMeta(heat);
        const months = z.rate > 0 ? Math.ceil(z.avail / z.rate) : null;
        const demandaRel = z.avail ? +(z.leads / z.avail).toFixed(1) : 0;
        const absorption = z.total ? Math.round(100 * z.sold / z.total) : 0;
        const avgH = Math.round(z.healthSum / (z.count || 1));
        const obraProm = Math.round(z.obraSum / (z.count || 1));
        const v = verdict({ heat, months, demandaRel, avail: z.avail, obra: obraProm });
        const vc = toneColor[v.tone];
        return (
          <div key={z.name} data-testid={`zone-intel-${z.slug}`} onMouseEnter={onCardEnter} onMouseLeave={onCardLeave}
            style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '15px 16px', boxShadow: 'var(--asr-shadow, none)', transition: 'transform .16s, box-shadow .16s, border-color .16s', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{z.name}</div>
                <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{z.count} proyecto{z.count !== 1 ? 's' : ''} · salud {avgH}</div>
              </div>
              <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 9999, fontFamily: 'DM Sans,sans-serif', fontSize: 10, fontWeight: 800, background: bm.bg, color: bm.c, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{bm.label}</span>
            </div>

            {/* 3 grandes: calor | se agota | demanda x unidad */}
            <div style={{ display: 'flex', gap: 10 }}>
              <Mini label="Calor de zona" value={heat != null ? `${heat}` : '—'} color={bm.c} />
              <Mini label="Se agota en" value={months != null ? `${months}m` : '—'} color={speedColor(months)} />
              <Mini label="Leads x unidad" value={z.avail ? demandaRel : '—'} color={demandaRel >= 3 ? 'var(--ok, #1FA06A)' : demandaRel < 1 ? 'var(--hot, #F2635B)' : 'var(--warm, #E2982E)'} />
            </div>

            {/* tu posición */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid rgba(var(--cream-rgb),0.07)', borderBottom: '1px solid rgba(var(--cream-rgb),0.07)' }}>
              <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' }}><b style={{ color: 'var(--cream)' }}>{z.avail}</b> disp. · <b style={{ color: 'var(--cream)' }}>{absorption}%</b> vendido</span>
              <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' }}>Por cobrar <b style={{ color: 'var(--cream)' }}>{fmtBig(z.porCobrar)}</b></span>
            </div>

            {/* 5 señales de mercado */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 6 }}>Señales de mercado</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {SIGNALS.map(([key, label]) => {
                  const s = pulse?.signals?.[key];
                  const sc = s ? (s.score ?? s.value ?? null) : null;
                  return <SignalBar key={key} label={label} score={sc} />;
                })}
              </div>
            </div>

            {/* VEREDICTO */}
            <div style={{ background: bm.bg === 'rgba(var(--cream-rgb),0.08)' ? 'rgba(var(--theme-rgb),0.05)' : 'transparent', border: `1px solid ${vc}`, borderRadius: 10, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
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

// Inteligencia de Mercado — banda densa de data REAL para el Inicio.
// 4 visualizaciones que cruzan el mercado CDMX (16 colonias) con tu negocio:
//  · Embudo comercial (leads → reservas → ventas)   [tu data]
//  · Plusvalía de tus zonas (momentum ranking)       [mercado]
//  · Precio/m² · tus zonas vs CDMX                    [mercado]
//  · Calidad comparada (radar overlay top 3 zonas)   [mercado]
import React, { useEffect, useMemo, useState } from 'react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend,
} from 'recharts';
import { listProjectsWithStats } from '../../api/developer';
import { COLONIAS } from '../../data/colonias';

const fmtBig = (n) => {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const avgPrice = (p) => { const f = p.price_from || 0, t = p.price_to || 0; return t > f ? (f + t) / 2 : f; };
const momentumNum = (m) => { const n = parseFloat(String(m || '').replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };
const COL = {}; COLONIAS.forEach(c => { COL[c.key] = c; COL[slug(c.name)] = c; });
const AXES = [['vida', 'Vida'], ['movilidad', 'Movilidad'], ['seguridad', 'Seguridad'], ['comercio', 'Comercio'], ['plusvalia', 'Plusvalía'], ['educacion', 'Educación']];

const onCardEnter = (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px -12px rgba(109,74,255,0.40)'; e.currentTarget.style.borderColor = 'rgba(109,74,255,0.45)'; };
const onCardLeave = (e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--asr-shadow, none)'; e.currentTarget.style.borderColor = 'var(--border-2, var(--border))'; };

function MCard({ title, sub, children }) {
  return (
    <div onMouseEnter={onCardEnter} onMouseLeave={onCardLeave}
      style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--asr-shadow, none)', transition: 'transform .16s, box-shadow .16s, border-color .16s', minWidth: 0 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 1, marginBottom: 10 }}>{sub}</div>}
      {!sub && <div style={{ height: 10 }} />}
      {children}
    </div>
  );
}

const C_THEME = 'var(--theme, #6D4AFF)', C_OK = 'var(--ok, #1FA06A)', C_WARM = 'var(--warm, #E2982E)';

// Barra horizontal con etiqueta + valor
function HRow({ label, pct, valueLabel, color }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 64px', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <div style={{ height: 9, borderRadius: 5, background: 'rgba(var(--cream-rgb),0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(3, Math.min(100, pct))}%`, background: color, borderRadius: 5, transition: 'width .4s' }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif', textAlign: 'right' }}>{valueLabel}</span>
    </div>
  );
}

export default function MarketIntelligence({ user }) {
  const [projects, setProjects] = useState(null);
  useEffect(() => {
    listProjectsWithStats()
      .then(r => setProjects(Array.isArray(r) ? r : (r.projects || r.items || [])))
      .catch(() => setProjects([]));
  }, []);

  // tus zonas (agregadas) + funnel comercial
  const { zones, funnel } = useMemo(() => {
    const m = {}; const f = { leads: 0, resv: 0, sold: 0 };
    (projects || []).forEach(p => {
      const name = p.colonia || '—', s = p.units_by_status || {};
      if (!m[name]) m[name] = { name, slug: slug(name), porCobrar: 0 };
      m[name].porCobrar += (s.disponible || 0) * avgPrice(p);
      f.leads += p.leads_active || 0; f.resv += s.reservado || 0; f.sold += s.vendido || 0;
    });
    return { zones: Object.values(m).sort((a, b) => b.porCobrar - a.porCobrar), funnel: f };
  }, [projects]);

  if (!projects) return null;

  // mercado CDMX (16 colonias) para contexto
  const cdmxPrices = COLONIAS.map(c => c.priceM2Num);
  const cdmxMax = Math.max(...cdmxPrices), cdmxAvg = Math.round(cdmxPrices.reduce((a, b) => a + b, 0) / cdmxPrices.length);

  // tus zonas con índice de mercado
  const mine = zones.map(z => COL[z.slug]).filter(Boolean);
  const byMomentum = [...mine].sort((a, b) => momentumNum(b.momentum) - momentumNum(a.momentum)).slice(0, 6);
  const byPrice = [...mine].sort((a, b) => b.priceM2Num - a.priceM2Num).slice(0, 6);
  const momMax = Math.max(1, ...byMomentum.map(c => momentumNum(c.momentum)));

  // radar overlay top 3
  const top3 = mine.slice(0, 3);
  const radarData = AXES.map(([k, lbl]) => { const row = { axis: lbl }; top3.forEach(c => { row[c.name] = c.scores?.[k] ?? 0; }); return row; });

  // embudo
  const fMax = Math.max(funnel.leads, funnel.resv, funnel.sold, 1);
  const convResv = funnel.leads ? Math.round(100 * funnel.resv / funnel.leads) : 0;
  const convSold = funnel.resv ? Math.round(100 * funnel.sold / funnel.resv) : 0;

  return (
    <div data-testid="market-intelligence" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
      {/* 1 · Embudo comercial (tu data) */}
      <MCard title="Embudo comercial" sub={`${funnel.leads} leads → ${funnel.resv} reservas → ${funnel.sold} ventas`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <HRow label="Leads activos" pct={100 * funnel.leads / fMax} valueLabel={`${funnel.leads}`} color={C_THEME} />
          <HRow label={`Reservadas · ${convResv}%`} pct={100 * funnel.resv / fMax} valueLabel={`${funnel.resv}`} color={C_WARM} />
          <HRow label={`Vendidas · ${convSold}%`} pct={100 * funnel.sold / fMax} valueLabel={`${funnel.sold}`} color={C_OK} />
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 10 }}>% = conversión de la etapa anterior</div>
      </MCard>

      {/* 2 · Plusvalía de tus zonas (mercado) */}
      <MCard title="Plusvalía de tus zonas" sub="momentum de precio · cuál se aprecia más rápido">
        {byMomentum.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byMomentum.map(c => (
              <HRow key={c.key} label={c.name} pct={100 * momentumNum(c.momentum) / momMax} valueLabel={c.momentum} color={c.momentumPositive ? C_OK : 'var(--hot, #F2635B)'} />
            ))}
          </div>
        ) : <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>Sin zonas con índice de mercado.</div>}
      </MCard>

      {/* 3 · Precio/m² vs CDMX (mercado) */}
      <MCard title="Precio/m² · tus zonas vs CDMX" sub={`promedio CDMX ${fmtBig(cdmxAvg)} · máx ${fmtBig(cdmxMax)}`}>
        {byPrice.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byPrice.map(c => (
              <HRow key={c.key} label={c.name} pct={100 * c.priceM2Num / cdmxMax} valueLabel={c.priceM2}
                color={c.priceM2Num >= cdmxAvg ? C_THEME : C_WARM} />
            ))}
            <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2 }}>
              <span style={{ color: C_THEME, fontWeight: 700 }}>■</span> arriba del promedio · <span style={{ color: C_WARM, fontWeight: 700 }}>■</span> debajo
            </div>
          </div>
        ) : <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>Sin zonas con índice de mercado.</div>}
      </MCard>

      {/* 4 · Calidad comparada (radar overlay) */}
      <MCard title="Calidad comparada de tus zonas" sub="6 ejes · top 3 por valor en juego">
        {top3.length ? (
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="68%">
                <PolarGrid stroke="rgba(120,120,128,0.25)" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: 'var(--cream-3)' }} />
                {top3.map((c, i) => (
                  <Radar key={c.name} name={c.name} dataKey={c.name} stroke={c.color} fill={c.color} fillOpacity={0.14} strokeWidth={1.6} />
                ))}
                <Legend wrapperStyle={{ fontSize: 10.5, fontFamily: 'DM Sans,sans-serif' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>Sin zonas con índice de mercado.</div>}
      </MCard>
    </div>
  );
}

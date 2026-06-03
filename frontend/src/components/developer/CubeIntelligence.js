// Fase 3.2 · Lente del dev sobre el cubo — su slice + mercado anónimo.
// 3 tarjetas de inteligencia REAL (read-only): Tú vs el mercado (benchmark),
// ¿qué atributo sube el precio? (amenity ranker), dónde construir (demand-gap).
import React, { useEffect, useState } from 'react';
import { getDevBenchmark, getDevAmenityRanker, getDevDemandGap } from '../../api/developer';

const onCardEnter = (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px -12px rgba(109,74,255,0.40)'; e.currentTarget.style.borderColor = 'rgba(109,74,255,0.45)'; };
const onCardLeave = (e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--asr-shadow, none)'; e.currentTarget.style.borderColor = 'var(--border-2, var(--border))'; };

const C_OK = 'var(--ok, #1FA06A)', C_WARM = 'var(--warm, #E2982E)', C_HOT = 'var(--hot, #F2635B)', C_THEME = 'var(--theme, #6D4AFF)';
const fmtTipo = (t) => String(t || '').replace(/_/g, ' ').replace('recamaras', 'rec').replace('recamara', 'rec');

function Card({ title, sub, children }) {
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

const fmtBig = (n) => {
  if (!n) return '—';
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
};

function Benchmark() {
  const [cells, setCells] = useState(null);
  useEffect(() => { getDevBenchmark().then(r => setCells(r.cells || [])).catch(() => setCells([])); }, []);
  if (!cells) return null;
  return (
    <Card title="Tú vs el mercado" sub="tu absorción y $/m² vs el mercado anónimo de tu zona">
      {cells.length === 0 ? <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>Sin datos de tu inventario aún.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {cells.slice(0, 5).map((c, i) => {
            const tone = c.abs_delta_pts >= 5 ? C_OK : c.abs_delta_pts <= -5 ? C_HOT : C_THEME;
            return (
              <div key={i} style={{ borderLeft: `3px solid ${tone}`, paddingLeft: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif', textTransform: 'capitalize' }}>{c.colonia} · {fmtTipo(c.tipologia)}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' }}>
                    tú <b style={{ color: 'var(--cream)' }}>{c.tu.absorcion_pct}%</b> vs mkt <b style={{ color: 'var(--cream)' }}>{c.mercado.absorcion_pct}%</b>
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: tone, marginTop: 1 }}>{c.veredicto}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function AmenityRanker() {
  const [d, setD] = useState(null);
  useEffect(() => { getDevAmenityRanker().then(setD).catch(() => setD({ amenity_ranker: [] })); }, []);
  if (!d) return null;
  const rk = d.amenity_ranker || [];
  const max = Math.max(1, ...rk.map(a => Math.abs(a.impacto_pct_precio_m2)));
  return (
    <Card title="¿Qué atributo sube el precio?" sub={d.r_squared ? `regresión sobre tu mercado · R² ${d.r_squared}` : 'inteligencia de mercado'}>
      {rk.length === 0 ? <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>Aún sin muestra suficiente.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {rk.map((a, i) => {
            const pos = a.impacto_pct_precio_m2 >= 0;
            const col = !a.significativo ? 'var(--cream-3)' : pos ? C_OK : C_HOT;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 52px', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.atributo}</span>
                <div style={{ height: 7, borderRadius: 4, background: 'rgba(var(--cream-rgb),0.08)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(Math.abs(a.impacto_pct_precio_m2) / max) * 100}%`, background: col, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: col, textAlign: 'right', fontFamily: 'DM Sans,sans-serif' }}>{pos ? '+' : ''}{a.impacto_pct_precio_m2}%</span>
              </div>
            );
          })}
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginTop: 2 }}>✓ = estadísticamente significativo</div>
        </div>
      )}
    </Card>
  );
}

function DemandGap() {
  const [d, setD] = useState(null);
  useEffect(() => { getDevDemandGap(6).then(setD).catch(() => setD({ cells: [] })); }, []);
  if (!d) return null;
  const cells = (d.cells || []).filter(c => c.verdict && (c.verdict.includes('construir') || c.verdict.includes('ventana')));
  const show = cells.length ? cells : (d.cells || []);
  return (
    <Card title="Dónde construir" sub="demanda alta y poco inventario · por zona y tipología">
      {show.length === 0 ? <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>Sin oportunidades claras ahora.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {show.slice(0, 5).map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif', textTransform: 'capitalize' }}>{c.colonia} · {fmtTipo(c.tipologia)}</span>
              <span style={{ fontSize: 10.5, color: C_OK, textAlign: 'right', maxWidth: '60%' }}>{c.verdict}</span>
            </div>
          ))}
          {d.demand_source === 'proxy' && <div style={{ fontSize: 10, color: 'var(--cream-3)', marginTop: 2 }}>Demanda estimada (se afina con vistas reales)</div>}
        </div>
      )}
    </Card>
  );
}

export default function CubeIntelligence() {
  return (
    <div data-testid="cube-intelligence" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
      <Benchmark />
      <AmenityRanker />
      <DemandGap />
    </div>
  );
}

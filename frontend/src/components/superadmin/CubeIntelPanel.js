// Fase 3.1 · Inteligencia del cubo en la god-view del superadmin (terminal Bloomberg).
// Surfacea las capas IA (hedónico/amenity ranker + demand-gap) sobre el cubo crudo.
// Estilo dark (superadmin): var(--cream) texto, var(--theme) acento, rgba blancos.
import React, { useEffect, useState } from 'react';
import { Sparkles, Hammer } from 'lucide-react';
import { getCubeAmenityRanker, getCubeDemandGap } from '../../api/superadminMetricsCube';

const fmtTipo = (t) => String(t || '').replace(/_/g, ' ').replace('recamaras', 'rec').replace('recamara', 'rec');
const C_OK = '#1FA06A', C_HOT = '#F2635B';

const card = {
  background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14, padding: '14px 16px',
};
const title = { fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 7 };
const sub = { fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginTop: 2, marginBottom: 12 };

function AmenityRanker() {
  const [d, setD] = useState(null);
  useEffect(() => { getCubeAmenityRanker().then(setD).catch(() => setD({ amenity_ranker: [] })); }, []);
  if (!d) return null;
  const rk = d.amenity_ranker || [];
  const max = Math.max(1, ...rk.map(a => Math.abs(a.impacto_pct_precio_m2)));
  return (
    <div style={card}>
      <div style={title}><Sparkles size={14} color="var(--theme)" /> ¿Qué atributo sube el precio/m²?</div>
      <div style={sub}>{d.r_squared ? `regresión hedónica · R² ${d.r_squared} · n=${d.sample_size}` : 'sin muestra suficiente'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rk.map((a, i) => {
          const pos = a.impacto_pct_precio_m2 >= 0;
          const col = !a.significativo ? 'rgba(240,235,224,0.4)' : pos ? C_OK : C_HOT;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 54px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, color: 'rgba(240,235,224,0.8)', fontFamily: 'DM Sans', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.atributo}</span>
              <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(Math.abs(a.impacto_pct_precio_m2) / max) * 100}%`, background: col, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: col, textAlign: 'right', fontFamily: 'DM Sans' }}>{pos ? '+' : ''}{a.impacto_pct_precio_m2}%{a.significativo ? '✓' : ''}</span>
            </div>
          );
        })}
        {rk.length === 0 && <div style={{ fontSize: 11.5, color: 'rgba(240,235,224,0.45)' }}>Backfill el átomo para ver el ranker.</div>}
      </div>
    </div>
  );
}

function DemandGap() {
  const [d, setD] = useState(null);
  useEffect(() => { getCubeDemandGap(8).then(setD).catch(() => setD({ cells: [] })); }, []);
  if (!d) return null;
  const cells = (d.cells || []).filter(c => c.verdict && (c.verdict.includes('construir') || c.verdict.includes('ventana')));
  const show = (cells.length ? cells : (d.cells || [])).slice(0, 6);
  return (
    <div style={card}>
      <div style={title}><Hammer size={14} color="var(--theme)" /> Dónde construir</div>
      <div style={sub}>demand-gap por zona × tipología{d.demand_source === 'proxy' ? ' · demanda estimada' : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {show.map((c, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', fontFamily: 'DM Sans', textTransform: 'capitalize' }}>{c.colonia} · {fmtTipo(c.tipologia)}</span>
            <span style={{ fontSize: 10.5, color: C_OK, textAlign: 'right', maxWidth: '58%' }}>{c.verdict}</span>
          </div>
        ))}
        {show.length === 0 && <div style={{ fontSize: 11.5, color: 'rgba(240,235,224,0.45)' }}>Sin oportunidades claras ahora.</div>}
      </div>
    </div>
  );
}

export default function CubeIntelPanel() {
  return (
    <div data-testid="cube-intel-panel" style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--theme)', marginBottom: 10 }}>
        Inteligencia del cubo · IA
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
        <AmenityRanker />
        <DemandGap />
      </div>
    </div>
  );
}

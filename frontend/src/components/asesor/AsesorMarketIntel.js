// Fase 3.3 · Lente del asesor sobre el cubo — inteligencia de mercado para su pitch.
// Reusa los motores del cubo (amenity ranker + demand-gap) scope-ados al asesor.
// Light theme (.portal-asesor). Enfoque: argumentos de valor + dónde hay compradores.
import React, { useEffect, useState } from 'react';
import { getAsesorAmenityRanker, getAsesorDemandGap } from '../../api/advisor';
import AsesorDemandaMapa from './AsesorDemandaMapa';

const fmtTipo = (t) => String(t || '').replace(/_/g, ' ').replace('recamaras', 'rec').replace('recamara', 'rec');
const C_OK = 'var(--ok, #1FA06A)', C_THEME = 'var(--theme, #6D4AFF)';

const onCardEnter = (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px -12px rgba(109,74,255,0.40)'; e.currentTarget.style.borderColor = 'rgba(109,74,255,0.45)'; };
const onCardLeave = (e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--asr-shadow, none)'; e.currentTarget.style.borderColor = 'var(--border-2, var(--border))'; };

function Card({ title, sub, children }) {
  return (
    <div onMouseEnter={onCardEnter} onMouseLeave={onCardLeave}
      style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--asr-shadow, none)', transition: 'transform .16s, box-shadow .16s, border-color .16s', minWidth: 0 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 1, marginBottom: 10 }}>{sub}</div>}
      {children}
    </div>
  );
}

function SellingArgs() {
  const [d, setD] = useState(null);
  useEffect(() => { getAsesorAmenityRanker().then(setD).catch(() => setD({ amenity_ranker: [] })); }, []);
  if (!d) return null;
  // solo los positivos significativos = argumentos de venta
  const pos = (d.amenity_ranker || []).filter(a => a.significativo && a.impacto_pct_precio_m2 > 0);
  return (
    <Card title="Argumentos de valor para tu pitch" sub={d.r_squared ? `qué sube el precio/m² · datos reales (R² ${d.r_squared})` : 'inteligencia de mercado'}>
      {pos.length === 0 ? <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>Aún sin señal clara de mercado.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pos.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C_OK, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', flex: 1 }}>
                Destaca <b style={{ color: 'var(--cream)' }}>{a.atributo.toLowerCase()}</b>: sube el precio/m²
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: C_OK, fontFamily: 'DM Sans,sans-serif' }}>+{a.impacto_pct_precio_m2}%</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function HotZones() {
  const [d, setD] = useState(null);
  useEffect(() => { getAsesorDemandGap(6).then(setD).catch(() => setD({ cells: [] })); }, []);
  if (!d) return null;
  const cells = (d.cells || []).filter(c => c.verdict && (c.verdict.includes('construir') || c.verdict.includes('ventana')));
  const show = (cells.length ? cells : (d.cells || [])).slice(0, 5);
  return (
    <Card title="Dónde hay compradores" sub="zonas y tipologías con demanda alta y poco inventario">
      {show.length === 0 ? <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>Sin señal clara ahora.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {show.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif', textTransform: 'capitalize' }}>{c.colonia} · {fmtTipo(c.tipologia)}</span>
              <span style={{ fontSize: 10.5, color: C_OK, textAlign: 'right', maxWidth: '58%' }}>demanda alta</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function AsesorMarketIntel() {
  return (
    <div data-testid="asesor-market-intel">
      <div className="eyebrow" style={{ marginBottom: 10 }}>INTELIGENCIA DE MERCADO · PARA VENDER</div>
      {/* Lente espacial: el MAPA de la demanda primero (antes solo tablas). Hide-if-empty. */}
      <AsesorDemandaMapa />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <SellingArgs />
        <HotZones />
      </div>
    </div>
  );
}

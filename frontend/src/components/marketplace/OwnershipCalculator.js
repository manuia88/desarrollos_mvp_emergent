// ¿Me Conviene Comprar? (comprador · A03 Rentar vs Comprar + A05 Costo Total a N años)
// Calculadora interactiva: mueve enganche y horizonte → recalcula sobre la hipoteca real
// + plusvalía y renta reales de la zona (vía /api/public/ownership). Cierra la decisión de compra.
import React, { useEffect, useState, useCallback } from 'react';
import { fetchOwnership } from '../../api/marketplace';
import { tc } from '../../lib/titleCase';

const COL = { verde: '#059669', ambar: '#B45309', rojo: '#DC2626' };   // oscuros para legibilidad en tema claro (antes pastel p/ fondo oscuro)
const BG = { verde: 'rgba(34,197,94,0.12)', ambar: 'rgba(245,158,11,0.12)', rojo: 'rgba(239,68,68,0.12)' };
const BD = { verde: 'rgba(34,197,94,0.32)', ambar: 'rgba(245,158,11,0.32)', rojo: 'rgba(239,68,68,0.32)' };
const mmx = (n) => n == null ? '—' : (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(Math.abs(n) >= 1e7 ? 1 : 2)}M` : `$${Math.round(n / 1000)}k`);
const panel = { background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 };

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <div style={{ flex: '1 1 220px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 5 }}>
        <span>{label}</span><span style={{ color: 'var(--cream)', fontWeight: 700 }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--theme, #6366F1)', cursor: 'pointer' }} />
    </div>
  );
}

// Barras comparativas comprar vs rentar (patrimonio al horizonte)
function CompareBars({ comprar, rentar }) {
  const max = Math.max(comprar, rentar, 1);
  const Row = ({ label, val, color }) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginBottom: 3 }}>
        <span>{label}</span><b style={{ color }}>{mmx(val)}</b>
      </div>
      <div style={{ height: 9, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(3, (val / max) * 100)}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
  return (
    <div style={{ marginTop: 10 }}>
      <Row label="Si compras (patrimonio)" val={comprar} color={COL.verde} />
      <Row label="Si rentas e inviertes" val={rentar} color="#a5b4fc" />
    </div>
  );
}

export default function OwnershipCalculator({ devId }) {
  const [enganche, setEnganche] = useState(20);   // %
  const [years, setYears] = useState(10);
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((eng, yrs) => {
    setBusy(true);
    fetchOwnership(devId, { engancheRatio: eng / 100, years: yrs })
      .then(setD).catch(() => setD(false)).finally(() => setBusy(false));
  }, [devId]);

  useEffect(() => {
    if (!devId) return;
    const id = setTimeout(() => load(enganche, years), 220);  // debounce sliders
    return () => clearTimeout(id);
  }, [devId, enganche, years, load]);

  if (d === false) return null;
  const rv = d && d.rent_vs_buy;
  const tco = d && d.tco;
  const sup = d && d.supuestos;

  return (
    <section data-testid="ownership-calc" style={{
      marginTop: 20, padding: '22px 24px',
      background: 'linear-gradient(180deg, rgba(99,102,241,0.06), rgba(236,72,153,0.03))',
      border: '1px solid var(--border)', borderRadius: 16,
    }}>
      <div className="eyebrow" style={{ margin: 0, letterSpacing: '0.14em' }}>{tc('Decisión de compra')}</div>
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.6vw,28px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 4px' }}>
        {tc('¿Me conviene comprar?')}
      </h2>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', margin: '0 0 16px', maxWidth: 640, lineHeight: 1.5 }}>
        Comparamos comprar contra rentar e invertir la diferencia, con la hipoteca real y la plusvalía de la zona. Mueve el enganche y los años.
      </p>

      {/* Controles */}
      <div style={{ ...panel, display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 14 }}>
        <Slider label="Enganche" value={enganche} min={10} max={50} step={5} onChange={setEnganche} fmt={v => `${v}%`} />
        <Slider label="Cuánto tiempo te quedas" value={years} min={3} max={25} step={1} onChange={setYears} fmt={v => `${v} años`} />
      </div>

      {!d ? (
        <div style={{ ...panel, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Calculando…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 14, opacity: busy ? 0.6 : 1, transition: 'opacity .15s' }}>
          {/* A03 · Rentar vs Comprar */}
          {rv && (
            <div data-testid="oc-rentvsbuy" style={{ ...panel, background: BG[rv.color], border: `1px solid ${BD[rv.color]}` }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Rentar vs comprar</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: COL[rv.color], marginTop: 7, lineHeight: 1.3 }}>{rv.lectura}</div>
              <CompareBars comprar={rv.comprar_patrimonio} rentar={rv.rentar_patrimonio} />
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 10 }}>
                Renta equivalente ~{mmx(rv.renta_mensual_estimada)}/mes{rv.renta_fuente === 'estimado' ? ' (est.)' : ''} · plusvalía ~{rv.plusvalia_anual_pct}%/año
                {rv.break_even_anio ? ` · comprar gana desde el año ${rv.break_even_anio}` : ` · rentar gana en ${rv.horizonte} años`}
              </div>
            </div>
          )}

          {/* A05 · Costo total */}
          {tco && (
            <div data-testid="oc-tco" style={panel}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Costo real de ser dueño</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)' }}>{mmx(tco.costo_real_mensual)}</span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>/mes real · {tco.anios} años (ya restando plusvalía)</span>
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tco.desglose.map((x, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 11.5 }}>
                    <span style={{ color: 'var(--cream-3)' }} title={x.nota}>{x.concepto}</span>
                    <b style={{ color: x.monto < 0 ? COL.verde : 'var(--cream-2)' }}>{x.monto < 0 ? '−' : ''}{mmx(Math.abs(x.monto))}</b>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                Al final conservas <b style={{ color: COL.verde }}>{mmx(tco.equity_final)}</b> en patrimonio. Pago de hipoteca ~{mmx(sup.pago_mensual)}/mes.
              </div>
            </div>
          )}
        </div>
      )}
      {d && <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 12, lineHeight: 1.4 }}>{d.nota}</div>}
    </section>
  );
}

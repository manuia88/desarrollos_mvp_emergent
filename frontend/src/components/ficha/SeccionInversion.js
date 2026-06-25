/**
 * SeccionInversion — análisis de inversión PERSONA + INSTITUCIONAL (de cero, en nuestro diseño). Reusa el motor real
 * POST /api/inversion-v4/analyze (TIR/MIRR/cap rate/NOI/cash-on-cash/equity multiple + nivel fondo: TVPI/TWR/DSCR/spread vs
 * CETES/descomposición) por UNIDAD. Veredicto honesto + alertas (no oversell). Toggle simple ↔ institucional.
 */
import React, { useState, useEffect } from 'react';
import { Card, Stat, SERIF, SANS, HEAD } from './ui';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n != null && !isNaN(n) ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');
const pct = (n) => (n != null && !isNaN(n) ? `${Number(n).toFixed(1)}%` : '—');
const SEM = { verde: '#059669', amarillo: '#B45309', rojo: '#DC2626' };

export default function SeccionInversion({ dev, unit }) {
  const base = unit ? { price: unit.price, label: `Unidad ${unit.unit_number}` } : { price: dev.price_from, label: 'Precio desde' };
  const [eng, setEng] = useState(20);
  const [horizonte, setHorizonte] = useState(10);
  const [renta, setRenta] = useState(Math.round(base.price * 0.0045));
  const [inst, setInst] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // re-prefill renta al cambiar de unidad
  useEffect(() => { setRenta(Math.round(base.price * 0.0045)); }, [base.price]);

  useEffect(() => {
    let alive = true; setLoading(true);
    const t = setTimeout(() => {
      fetch(`${API}/api/inversion-v4/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor_propiedad: base.price, enganche_pct: eng / 100, plazo_anios: 20, horizonte_anios: horizonte, renta_mensual: renta, colonia: dev.colonia_id || dev.colonia }),
      }).then((r) => r.json()).then((d) => { if (alive) { setData(d && d.ok ? d : null); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [base.price, eng, horizonte, renta, dev.colonia_id, dev.colonia]);

  const v = data && data.veredicto;
  const ai = (data && data.analisis_institucional) || {};
  const fondo = ai.metricas_fondo || {};
  const desc = ai.descomposicion_retorno_pct || {};
  const alertas = (data && data.alertas) || {};
  const sem = v ? (SEM[v.semaforo] || '#B45309') : '#B45309';
  const cocNeg = data && data.cash_on_cash_pct != null && data.cash_on_cash_pct < 0;

  const Input = ({ label, children }) => (
    <div style={{ minWidth: 150 }}>
      <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(20px,2.4vw,26px)', color: 'var(--cream)' }}>Si lo compras para invertir</div>
        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: unit ? 'var(--theme)' : 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{base.label} · {money(base.price)}</div>
      </div>

      {/* inputs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, margin: '16px 0 20px', paddingBottom: 18, borderBottom: '1px solid var(--card-border, var(--border))' }}>
        <Input label={`Enganche · ${eng}%`}><input type="range" min={10} max={50} step={5} value={eng} onChange={(e) => setEng(+e.target.value)} style={{ width: 160, accentColor: 'var(--theme)' }} /></Input>
        <Input label="Renta mensual estimada"><input type="number" value={renta} onChange={(e) => setRenta(Math.max(0, +e.target.value))} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)', fontFamily: HEAD, fontSize: 14, color: 'var(--cream)', width: 130 }} /></Input>
        <Input label="Horizonte"><div style={{ display: 'flex', gap: 6 }}>{[5, 10, 15].map((h) => <button key={h} onClick={() => setHorizonte(h)} style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${horizonte === h ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: horizonte === h ? 'rgba(99,102,241,0.08)' : 'transparent', color: horizonte === h ? 'var(--theme)' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{h} años</button>)}</div></Input>
      </div>

      {/* veredicto honesto */}
      {v && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 9999, background: sem }} />
            <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: sem, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inversión {v.nivel}</span>
          </div>
          <p style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, margin: 0, maxWidth: 720 }}>{v.parrafo}</p>
        </div>
      )}

      {/* métricas persona */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 'clamp(14px,2vw,26px)', opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
        <Stat value={data ? pct(data.tir_pct) : '—'} label="TIR (con crédito)" accent="var(--theme)" sub={data && data.tir_desapalancada_pct != null ? `${pct(data.tir_desapalancada_pct)} sin crédito` : null} />
        <Stat value={data ? pct(data.cap_rate_pct) : '—'} label="Cap rate" sub="renta neta ÷ precio" />
        <Stat value={data ? `${Number(data.equity_multiple).toFixed(2)}x` : '—'} label="Multiplica tu capital" />
        <Stat value={data ? money(data.noi) : '—'} label="Renta neta al año (NOI)" />
        <Stat value={data ? pct(data.cash_on_cash_pct) : '—'} label="Cash-on-cash" accent={cocNeg ? '#DC2626' : '#059669'} sub={data && data.flujo_mensual_1 != null ? `${money(data.flujo_mensual_1)}/mes de flujo` : null} />
      </div>

      {/* toggle institucional */}
      <button onClick={() => setInst((x) => !x)} style={{ marginTop: 18, padding: '10px 16px', borderRadius: 11, border: '1px solid var(--card-border, var(--border))', background: inst ? 'rgba(99,102,241,0.06)' : 'transparent', color: 'var(--theme)', fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
        {inst ? 'Ocultar nivel institucional ▲' : '🏛️ Ver nivel institucional (fondo) ▾'}
      </button>

      {inst && data && (
        <div style={{ marginTop: 16, paddingTop: 18, borderTop: '1px solid var(--card-border, var(--border))' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 'clamp(14px,2vw,24px)' }}>
            <Stat value={fondo.tvpi != null ? `${Number(fondo.tvpi).toFixed(2)}x` : '—'} label="TVPI (valor total / invertido)" />
            <Stat value={fondo.twr_unlev_pct != null ? pct(fondo.twr_unlev_pct) : '—'} label="TWR sin apalancar" />
            <Stat value={data.mirr_pct != null ? pct(data.mirr_pct) : '—'} label="MIRR" />
            <Stat value={ai.spread_vs_cetes_pts != null ? `${ai.spread_vs_cetes_pts > 0 ? '+' : ''}${ai.spread_vs_cetes_pts} pts` : '—'} label="Spread vs CETES" accent={ai.spread_vs_cetes_pts >= 0 ? '#059669' : '#DC2626'} />
            <Stat value={ai.yield_on_cost_pct != null ? pct(ai.yield_on_cost_pct) : '—'} label="Yield-on-cost" />
            <Stat value={ai.prestamo_max_dscr12 != null ? money(ai.prestamo_max_dscr12) : '—'} label={`Préstamo máx · DSCR ${ai.dscr_objetivo || 1.2}`} />
          </div>

          {/* descomposición del retorno */}
          {(desc.renta != null || desc.plusvalia != null) && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>De dónde viene el retorno</div>
              <div style={{ display: 'flex', height: 12, borderRadius: 9999, overflow: 'hidden', background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))' }}>
                {[['plusvalia', '#6366F1'], ['patrimonio', '#059669'], ['renta', '#B45309']].map(([k, c]) => {
                  const val = Math.max(0, desc[k] || 0);
                  return val > 0 ? <div key={k} style={{ width: `${Math.min(100, val)}%`, background: c }} title={`${k} ${val}%`} /> : null;
                })}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)' }}>
                <span><span style={{ color: '#6366F1' }}>●</span> Plusvalía {pct(desc.plusvalia)}</span>
                <span><span style={{ color: '#059669' }}>●</span> Pago de capital {pct(desc.patrimonio)}</span>
                <span><span style={{ color: '#B45309' }}>●</span> Renta {pct(desc.renta)}</span>
              </div>
            </div>
          )}

          {/* TWR por horizonte */}
          {fondo.twr_horizontes_pct && (
            <div style={{ marginTop: 16, fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)' }}>
              <strong style={{ color: 'var(--cream)' }}>TWR por horizonte:</strong> {Object.entries(fondo.twr_horizontes_pct).map(([y, p]) => `${y}a ${pct(p)}`).join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* alertas honestas */}
      {(alertas.coc_negativo || alertas.dscr_bajo_1 || alertas.cap_bajo_cetes) && (
        <div style={{ marginTop: 18, padding: '13px 16px', borderRadius: 12, background: 'rgba(180,83,9,0.06)', border: '1px solid rgba(180,83,9,0.2)' }}>
          <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 13, color: '#B45309', marginBottom: 6 }}>⚠️ Lo que debes considerar</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.7 }}>
            {alertas.coc_negativo && <li>Hoy la renta no cubre el crédito: pondrías de tu bolsa cada mes.</li>}
            {alertas.dscr_bajo_1 && <li>El ingreso por renta no alcanza para el servicio de la deuda (DSCR &lt; 1).</li>}
            {alertas.cap_bajo_cetes && <li>El cap rate va por debajo de CETES: a esta tasa, conviene más al contado o esperar.</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}

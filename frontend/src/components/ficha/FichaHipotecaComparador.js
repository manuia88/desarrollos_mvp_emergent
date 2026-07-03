/**
 * FichaHipotecaComparador — comparador de crédito hipotecario estilo CONDUSEF/Banxico,
 * re-vestido al look v4 (light + degradado morado). Datos REALES publicados (jul 2026,
 * fuentes: comparador.banxico.org.mx + folletos Ley de Transparencia de cada banco).
 * Cálculo 100% cliente (amortización francesa) — referencial, no oferta vinculante.
 */
import React, { useState, useMemo } from 'react';
import { V4, HEAD, SANS, GRAD, fmtMXN, fmtPct, inpV4, cardV4, BtnV4, Field, CalcHeader, Disclaimer } from './calcV4';

// Datos oficiales publicados (jul 2026). tasa = referencia "desde"/perfil típico a 20 años.
const BANCOS = [
  { banco: 'Banorte', producto: 'Hipoteca Fuerte', tasa: 8.80, cat: 12.4, comision_pct: 1.0, seg_danos: 0.28, seg_vida: 0.60, edad_min: 25, edad_max: 69, ingreso_min: 10000, fin_max: 0.90, antig_lab: '2 años comprobables', antig_res: 'No especificada', pago_tardio: '5% + IVA sobre saldo vencido (desde 4º mes); moratoria 17.6–21.6%', prepago: 'Sin penalización (primeros 3 años)', plazos: '5, 10, 15, 20 años' },
  { banco: 'BBVA', producto: 'Hipoteca Fija', tasa: 9.15, cat: 13.2, comision_pct: 1.0, seg_danos: 0.1593, seg_vida: 0.60, edad_min: 26, edad_max: 85, ingreso_min: 0, fin_max: 0.90, antig_lab: '3 meses a 2 años según valor', antig_res: '6 meses (Tu Opción México)', pago_tardio: 'El menor entre 70 UDI o el monto del incumplimiento + IVA', prepago: 'Sin penalización', plazos: '10, 15, 20 años' },
  { banco: 'Citibanamex', producto: 'La Hipoteca a tu Medida', tasa: 9.48, cat: 12.3, comision_pct: 1.5, seg_danos: 0.30, seg_vida: 0.5154, edad_min: 23, edad_max: 59, ingreso_min: 15000, fin_max: 0.90, antig_lab: '1 año asalariados / 2 años independientes', antig_res: 'Comprobante menor a 3 meses', pago_tardio: 'Intereses moratorios', prepago: 'Sin penalización', plazos: '10, 15, 20 años', nota: 'Comisión de apertura en promoción 0% (hasta 30-sep-2026). Avalúo reembolsable 100%.' },
  { banco: 'HSBC', producto: 'Crédito Hipotecario Pago Fijo', tasa: 9.95, cat: 12.4, comision_pct: 0.75, seg_danos: 0.2955, seg_vida: 0.44, edad_min: 25, edad_max: 80, ingreso_min: 8500, fin_max: 0.97, antig_lab: '6 meses asalariados / 2 años no asalariados', antig_res: '1 año en domicilio actual', pago_tardio: '$480 + IVA por evento', prepago: '0% en algunos productos; 1.5–2.5% + IVA en otros (primeros 60 meses)', plazos: '5, 10, 15, 20, 25 años' },
  { banco: 'Scotiabank', producto: 'Adquisición (Valora)', tasa: 10.42, cat: 12.9, comision_pct: 1.25, seg_danos: 0.31, seg_vida: 0.60, edad_min: 25, edad_max: 80, ingreso_min: 10000, fin_max: 0.95, antig_lab: '2 años entre empleo actual y anterior', antig_res: 'Comprobante menor a 3 meses', pago_tardio: '$500 + IVA por evento', prepago: 'Sin penalización si ya se pagó la comisión; si no, 3% + IVA', plazos: '5, 7, 10, 15, 20 años' },
];

const pagoFrances = (monto, tasaAnual, meses) => { const r = tasaAnual / 100 / 12; return r === 0 ? monto / meses : monto * (r / (1 - Math.pow(1 + r, -meses))); };

const SORTS = [['cat', 'CAT'], ['tasa', 'Tasa de interés'], ['pago', 'Pago mensual'], ['total', 'Pago total']];

function DetalleGrid({ b }) {
  const secc = (title, rows) => (
    <div style={{ ...cardV4, padding: 16 }}>
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: V4.theme, marginBottom: 8 }}>{title}</div>
      {rows.filter(Boolean).map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: i ? `1px solid ${V4.line}` : 'none', fontFamily: SANS, fontSize: 12.5 }}><span style={{ color: V4.ink2 }}>{k}</span><span style={{ fontWeight: 700, color: V4.ink, textAlign: 'right' }}>{v}</span></div>
      ))}
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 12 }}>
      {secc('Pago inicial', [['Enganche', fmtMXN(b.enganche)], ['Comisión de apertura', fmtMXN(b.comision)], ['Gastos notariales (est.)', fmtMXN(b.notariales)], ['Total del pago inicial', fmtMXN(b.pago_inicial)]])}
      {secc('Requisitos', [['Edad', `${b.edad_min}–${b.edad_max} años`], ['Ingreso mensual mínimo', b.ingreso_min ? fmtMXN(b.ingreso_min) : 'No publicado'], ['Antigüedad laboral', b.antig_lab], ['Antigüedad residencial', b.antig_res], ['Financiamiento máximo', `${Math.round(b.fin_max * 100)}%`], ['Score de crédito', 'Buen historial (Buró) — sin score numérico']])}
      {secc('Seguros (mensual)', [['Seguro de daños', `${b.seg_danos} por millar`], ['Seguro de vida/desempleo', `${b.seg_vida} por millar`], ['Seguros incluidos en tu pago', fmtMXN(b.seguros_mes)]])}
      {secc('Comisiones y penalizaciones', [['Comisión de apertura', `${b.comision_pct}%`], ['Pago tardío', b.pago_tardio], ['Prepago anticipado', b.prepago], ['Plazos disponibles', b.plazos]])}
    </div>
  );
}

export default function FichaHipotecaComparador({ basePrice = 0, devName }) {
  const [precio, setPrecio] = useState(basePrice || '');
  const [enganchePct, setEnganchePct] = useState(20);
  const [plazo, setPlazo] = useState(20);
  const [ingreso, setIngreso] = useState('');
  const [sort, setSort] = useState('pago');
  const [ran, setRan] = useState(false);
  const [openBank, setOpenBank] = useState(null);
  const [error, setError] = useState(null);

  const results = useMemo(() => {
    const P = Number(precio) || 0, eng = P * (Number(enganchePct) / 100), meses = Number(plazo) * 12, ing = Number(ingreso) || 0;
    if (!P) return [];
    return BANCOS.map((b) => {
      const monto = P - eng;
      const cuota = pagoFrances(monto, b.tasa, meses);
      const seguros_mes = monto * (b.seg_danos + b.seg_vida) / 1000;
      const pago = cuota + seguros_mes;
      const comision = monto * b.comision_pct / 100;
      const notariales = Math.round(P * 0.06);
      const pago_inicial = eng + comision + notariales;
      const total = pago * meses + pago_inicial;
      const dti = ing ? pago / ing : null;
      const viable = (!b.ingreso_min || ing >= b.ingreso_min) && (monto <= P * b.fin_max + 1) && (dti == null || dti <= 0.35);
      return { ...b, monto, enganche: eng, pago, seguros_mes, comision, notariales, pago_inicial, total, dti, viable, tasa_val: b.tasa, cat_val: b.cat };
    });
  }, [precio, enganchePct, plazo, ingreso]);

  const sorted = useMemo(() => {
    const key = { cat: 'cat_val', tasa: 'tasa_val', pago: 'pago', total: 'total' }[sort];
    return [...results].sort((a, b) => a[key] - b[key]);
  }, [results, sort]);

  const avgPago = results.length ? results.reduce((s, b) => s + b.pago, 0) / results.length : 0;
  const metricVal = (b) => ({ cat: b.cat_val, tasa: b.tasa_val, pago: b.pago, total: b.total }[sort]);
  const metricFmt = (b) => ({ cat: fmtPct(b.cat_val), tasa: fmtPct(b.tasa_val), pago: fmtMXN(b.pago), total: fmtMXN(b.total) }[sort]);
  const min = sorted.length ? metricVal(sorted[0]) : 0, max = sorted.length ? metricVal(sorted[sorted.length - 1]) : 1;

  const run = () => { setError(null); if (!precio || Number(precio) <= 0) { setError('Ingresa el valor de la vivienda'); return; } if (!ingreso || Number(ingreso) <= 0) { setError('Ingresa tu ingreso mensual — se necesita para evaluar tu viabilidad.'); return; } setRan(true); setOpenBank(null); };

  return (
    <div style={{ ...cardV4, padding: 24 }}>
      <CalcHeader eyebrow="Comparador de crédito hipotecario" title={`Encuentra tu mejor crédito${devName ? ` para ${devName}` : ''}`} subtitle="Compara los principales bancos de México con tasas y CAT publicados." />
      <div className="comp-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '14px 16px', marginBottom: 16 }}>
        <Field label="Valor de la vivienda" required><input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} style={inpV4} /></Field>
        <Field label="Enganche %"><input type="number" value={enganchePct} onChange={(e) => setEnganchePct(e.target.value)} style={inpV4} /></Field>
        <Field label="Plazo (años)"><input type="number" value={plazo} onChange={(e) => setPlazo(e.target.value)} style={inpV4} /></Field>
        <Field label="Ingreso mensual" required><input type="number" value={ingreso} onChange={(e) => setIngreso(e.target.value)} style={inpV4} /></Field>
      </div>
      {error && <div style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 12, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.22)', fontFamily: SANS, fontSize: 12.5, color: V4.red }}>{error}</div>}
      <BtnV4 full onClick={run}>Comparar bancos</BtnV4>

      {ran && precio > 0 && ingreso > 0 && (
        <div style={{ marginTop: 20 }}>
          {/* criterios */}
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink2, marginBottom: 14 }}>
            Vivienda de <b style={{ color: V4.theme }}>{fmtMXN(Number(precio))}</b> · enganche <b style={{ color: V4.theme }}>{fmtMXN(Number(precio) * enganchePct / 100)}</b> ({enganchePct}%) · plazo <b style={{ color: V4.theme }}>{plazo} años</b> · ingreso <b style={{ color: V4.theme }}>{fmtMXN(Number(ingreso))}</b>
          </div>
          {/* sort tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink3 }}>Ordenar por:</span>
            {SORTS.map(([k, l]) => <button key={k} onClick={() => setSort(k)} style={{ padding: '7px 14px', borderRadius: 9999, border: 'none', background: sort === k ? GRAD : '#f1eefe', color: sort === k ? '#fff' : V4.theme, fontFamily: SANS, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{l}</button>)}
          </div>
          {/* gradient range bar */}
          <div style={{ margin: '6px 0 18px' }}>
            <div style={{ position: 'relative', height: 10, borderRadius: 9999, background: 'linear-gradient(90deg,#0E9F6E 0%,#E0A33E 55%,#DC2626 100%)' }}>
              {sorted.map((b, i) => { const t = max > min ? (metricVal(b) - min) / (max - min) : 0; return <div key={i} title={b.banco} style={{ position: 'absolute', left: `calc(${t * 100}% - 6px)`, top: -3, width: 12, height: 16, borderRadius: 4, background: '#fff', border: `2px solid ${V4.ink}`, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />; })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontSize: 10.5, color: V4.ink3, marginTop: 5 }}><span>Más barato · {metricFmt(sorted[0])}</span><span>Más caro · {metricFmt(sorted[sorted.length - 1])}</span></div>
          </div>
          {/* result cards */}
          <div className="comp-res" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
            {sorted.map((b, i) => { const below = b.pago < avgPago; const open = openBank === b.banco; return (
              <div key={b.banco} className="dmx-card" style={{ ...cardV4, padding: 0, overflow: 'hidden', borderColor: b.viable ? 'rgba(109,74,255,0.28)' : V4.line, gridColumn: open ? '1 / -1' : 'auto' }}>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: V4.ink }}>{i + 1}. {b.banco}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 9999, fontFamily: SANS, fontWeight: 700, fontSize: 9, textTransform: 'uppercase', color: b.viable ? V4.green : V4.red, background: b.viable ? 'rgba(14,159,110,0.1)' : 'rgba(220,38,38,0.08)' }}>{b.viable ? 'Viable' : 'No viable'}</span>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11.5, color: V4.ink3, marginBottom: 8 }}>{b.producto}</div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontFamily: SANS, fontSize: 12 }}>
                    <span>Tasa <b style={{ color: V4.ink }}>{b.tasa}%</b></span>
                    <span>CAT <b style={{ color: V4.ink }}>{b.cat}%</b></span>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: below ? 'rgba(14,159,110,0.08)' : V4.surface, border: `1px solid ${below ? 'rgba(14,159,110,0.25)' : V4.line}` }}>
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.ink3 }}>Tu pago mensual</div>
                    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: below ? V4.green : V4.theme }}>{fmtMXN(b.pago)}</div>
                    {below && <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.green, fontWeight: 700 }}>◎ Abajo del promedio</div>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: SANS, fontSize: 12, color: V4.ink2 }}><span>Pago total</span><b style={{ color: V4.ink }}>{fmtMXN(b.total)}</b></div>
                  {!b.viable && b.dti != null && b.dti > 0.35 && <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.amber, marginTop: 6 }}>Tu pago supera el 35% de tu ingreso (DTI {Math.round(b.dti * 100)}%). Sube enganche o plazo.</div>}
                  {!b.viable && b.ingreso_min > 0 && Number(ingreso) < b.ingreso_min && <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.amber, marginTop: 6 }}>Ingreso mínimo de este banco: {fmtMXN(b.ingreso_min)}.</div>}
                  <button className="dmx-press" onClick={() => setOpenBank(open ? null : b.banco)} style={{ marginTop: 10, width: '100%', padding: '9px', borderRadius: 10, border: `1px solid ${V4.theme}`, background: open ? V4.theme : '#fff', color: open ? '#fff' : V4.theme, fontFamily: SANS, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{open ? 'Ocultar desglose' : 'Ver desglose →'}</button>
                </div>
                {open && (
                  <div style={{ padding: '0 16px 16px', background: V4.surface }}>
                    {b.nota && <div style={{ fontFamily: SANS, fontSize: 11.5, color: V4.theme, padding: '10px 0 2px', fontWeight: 600 }}>ℹ️ {b.nota}</div>}
                    <DetalleGrid b={b} />
                  </div>
                )}
              </div>
            ); })}
          </div>
          <div style={{ marginTop: 16 }}><Disclaimer>Comparativo referencial con tasas y CAT publicados (jul 2026) por cada banco y el comparador de Banxico. La tasa, el CAT y las condiciones definitivas dependen del estudio de crédito de cada solicitante y no constituyen una oferta vinculante.</Disclaimer></div>
        </div>
      )}
      <style>{`@media(max-width:640px){ .comp-grid{ grid-template-columns:1fr 1fr !important; } .comp-res{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

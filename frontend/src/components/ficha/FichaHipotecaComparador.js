/**
 * FichaHipotecaComparador — comparador de crédito hipotecario estilo CONDUSEF/Banxico,
 * re-vestido al look v4 (light + degradado morado). Datos REALES publicados (jul 2026,
 * fuentes: comparador.banxico.org.mx + folletos Ley de Transparencia de cada banco).
 * Cálculo 100% cliente (amortización francesa) — referencial, no oferta vinculante.
 */
import React, { useState, useMemo } from 'react';
import { V4, HEAD, SANS, GRAD, fmtMXN, inpV4, cardV4, BtnV4, Field, CalcHeader, Disclaimer } from './calcV4';

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

// Globito de ayuda (tooltip) — hover o click
function Tip({ text }) {
  const [on, setOn] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOn((o) => !o); }} aria-label="Más información" style={{ width: 16, height: 16, borderRadius: 9999, border: `1px solid ${V4.ink3}`, background: '#fff', color: V4.ink3, fontSize: 10, fontWeight: 800, cursor: 'help', fontFamily: SANS, lineHeight: 1, padding: 0 }}>?</button>
      {on && <span style={{ position: 'absolute', bottom: '145%', left: '50%', transform: 'translateX(-50%)', width: 230, background: V4.ink, color: '#fff', fontFamily: SANS, fontSize: 11.5, lineHeight: 1.45, padding: '9px 11px', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.28)', zIndex: 20, fontWeight: 500, textTransform: 'none', letterSpacing: 0, textAlign: 'left' }}>{text}<span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', borderWidth: 5, borderStyle: 'solid', borderColor: `${V4.ink} transparent transparent transparent` }} /></span>}
    </span>
  );
}

const SORT_INFO = {
  cat: { label: 'CAT', long: 'CAT (Costo Anual Total)', tip: 'El CAT resume en un solo % TODO lo que pagas al año: tasa de interés + comisiones + seguros. Entre más bajo, más barato el crédito en total.' },
  tasa: { label: 'Tasa de interés', long: 'Tasa de interés anual', tip: 'El % anual que el banco cobra sobre el saldo del crédito. Es la tasa "desde" (mejor perfil publicado); la definitiva depende de tu estudio de crédito.' },
  pago: { label: 'Pago mensual', long: 'Pago mensual', tip: 'Lo que pagarías cada mes: capital + intereses + seguros. Debe caber holgadamente en tu ingreso.' },
  total: { label: 'Pago total', long: 'Pago total', tip: 'La suma de todo lo que habrás pagado al final del plazo: mensualidades + enganche + comisiones + gastos notariales.' },
};

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

      {ran && precio > 0 && ingreso > 0 && (() => {
        const si = SORT_INFO[sort];
        const heroOf = (b) => ({ cat: `${b.cat}%`, tasa: `${b.tasa}%`, pago: fmtMXN(b.pago), total: fmtMXN(b.total) }[sort]);
        const metricRow = (b) => [['Tasa', `${b.tasa}%`, 'tasa'], ['CAT', `${b.cat}%`, 'cat'], ['Pago mensual', fmtMXN(b.pago), 'pago'], ['Pago total', fmtMXN(b.total), 'total']];
        return (
        <div style={{ marginTop: 22 }}>
          {/* criterios */}
          <div style={{ ...cardV4, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink2 }}>Vivienda <b style={{ color: V4.ink }}>{fmtMXN(Number(precio))}</b> · enganche <b style={{ color: V4.ink }}>{fmtMXN(Number(precio) * enganchePct / 100)}</b> ({enganchePct}%) · plazo <b style={{ color: V4.ink }}>{plazo} años</b> · ingreso <b style={{ color: V4.ink }}>{fmtMXN(Number(ingreso))}</b></span>
            <span style={{ marginLeft: 'auto', fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: V4.theme }}>{BANCOS.length} bancos comparados</span>
          </div>

          {/* ordenar por — segmentado grande + explicación dinámica */}
          <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: V4.ink2, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>Ordenar del más conveniente al menos conveniente por: <Tip text={si.tip} /></div>
          <div style={{ display: 'flex', gap: 6, background: '#f4f2fd', borderRadius: 12, padding: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            {SORTS.map(([k, l]) => <button key={k} onClick={() => setSort(k)} style={{ flex: '1 1 120px', padding: '10px 12px', borderRadius: 9, border: 'none', background: sort === k ? GRAD : 'transparent', color: sort === k ? '#fff' : V4.ink2, fontFamily: HEAD, fontWeight: sort === k ? 800 : 600, fontSize: 13, cursor: 'pointer', boxShadow: sort === k ? '0 4px 12px rgba(109,74,255,0.28)' : 'none' }}>{l}</button>)}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: V4.ink3, marginBottom: 14 }}>Mostrando del <b style={{ color: V4.green }}>más barato</b> al <b style={{ color: V4.red }}>más caro</b> por <b style={{ color: V4.theme }}>{si.long}</b>. El <b>#1</b> es tu mejor opción por {si.label}.</div>

          {/* result cards */}
          <div className="comp-res" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 14 }}>
            {sorted.map((b, i) => { const open = openBank === b.banco; const best = i === 0; return (
              <div key={b.banco} className="dmx-card" style={{ ...cardV4, padding: 0, overflow: 'hidden', border: best ? '1.5px solid transparent' : `1px solid ${V4.line}`, backgroundImage: best ? `linear-gradient(#fff,#fff), ${GRAD}` : undefined, backgroundOrigin: best ? 'border-box' : undefined, backgroundClip: best ? 'padding-box, border-box' : undefined, gridColumn: open ? '1 / -1' : 'auto' }}>
                {best && <div style={{ background: GRAD, color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '5px 14px', textAlign: 'center' }}>★ Más conveniente por {si.label}</div>}
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 9999, background: best ? GRAD : '#eee', color: best ? '#fff' : V4.ink2, fontFamily: HEAD, fontWeight: 800, fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: V4.ink }}>{b.banco}</span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 9999, fontFamily: SANS, fontWeight: 700, fontSize: 9, textTransform: 'uppercase', color: b.viable ? V4.green : V4.red, background: b.viable ? 'rgba(14,159,110,0.1)' : 'rgba(220,38,38,0.08)' }}>{b.viable ? 'Sí calificas' : 'No calificas'}</span>
                      <Tip text={b.viable ? 'Con tu ingreso y enganche calificas: tu pago mensual no rebasa el 35% de tu ingreso y cumples el ingreso mínimo del banco.' : 'Con estos datos NO calificas: tu pago rebasa el 35% de tu ingreso o no llegas al ingreso mínimo del banco. Sube enganche, alarga el plazo o aumenta el ingreso comprobable.'} />
                    </span>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11.5, color: V4.ink3, marginBottom: 12 }}>{b.producto}</div>
                  {/* HERO = la métrica que ordenas */}
                  <div style={{ padding: '12px 14px', borderRadius: 12, background: best ? 'rgba(109,74,255,0.06)' : V4.surface, border: `1px solid ${best ? 'rgba(109,74,255,0.2)' : V4.line}`, marginBottom: 12 }}>
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.ink3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{si.long}</div>
                    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: V4.theme, letterSpacing: '-0.02em' }}>{heroOf(b)}</div>
                  </div>
                  {/* las 4 métricas — la ordenada resaltada */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                    {metricRow(b).map(([lbl, val, key]) => { const act = key === sort; return (
                      <div key={key} style={{ padding: '7px 9px', borderRadius: 8, background: act ? 'rgba(109,74,255,0.09)' : '#fafafb', border: `1px solid ${act ? 'rgba(109,74,255,0.25)' : V4.line}` }}>
                        <div style={{ fontFamily: SANS, fontSize: 9.5, color: V4.ink3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{lbl}</div>
                        <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 13, color: act ? V4.theme : V4.ink }}>{val}</div>
                      </div>
                    ); })}
                  </div>
                  {!b.viable && b.dti != null && b.dti > 0.35 && <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.amber, marginBottom: 8 }}>Tu pago sería el {Math.round(b.dti * 100)}% de tu ingreso (máx. recomendado 35%). Sube enganche o alarga el plazo.</div>}
                  {!b.viable && b.ingreso_min > 0 && Number(ingreso) < b.ingreso_min && <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.amber, marginBottom: 8 }}>Este banco pide ingreso mínimo de {fmtMXN(b.ingreso_min)}.</div>}
                  <button className="dmx-press" onClick={() => setOpenBank(open ? null : b.banco)} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${V4.theme}`, background: open ? V4.theme : '#fff', color: open ? '#fff' : V4.theme, fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{open ? '▲ Ocultar desglose' : '▼ Ver desglose completo'}</button>
                </div>
                {open && (
                  <div style={{ padding: '4px 16px 18px', background: V4.surface, borderTop: `1px solid ${V4.line}` }}>
                    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: V4.ink, padding: '14px 0 2px' }}>Desglose completo · {b.banco}</div>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: V4.ink3, marginBottom: 4 }}>{b.producto}</div>
                    {b.nota && <div style={{ fontFamily: SANS, fontSize: 11.5, color: V4.theme, padding: '6px 0 2px', fontWeight: 600 }}>ℹ️ {b.nota}</div>}
                    <DetalleGrid b={b} />
                  </div>
                )}
              </div>
            ); })}
          </div>
          <div style={{ marginTop: 16 }}><Disclaimer>Tasas "desde" (mejor perfil publicado) y CAT vigentes a jul 2026 por cada banco y el comparador de Banxico. La tasa, el CAT y las condiciones definitivas dependen del estudio de crédito de cada solicitante y no constituyen una oferta vinculante.</Disclaimer></div>
        </div>
        );
      })()}
      <style>{`@media(max-width:640px){ .comp-grid{ grid-template-columns:1fr 1fr !important; } .comp-res{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

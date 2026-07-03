/**
 * FichaHipotecaComparador — comparador de crédito hipotecario estilo CONDUSEF/Banxico,
 * re-vestido al look v4 (light + degradado morado). Datos REALES publicados por cada banco
 * (fuentes: comparador.banxico.org.mx + folletos Ley de Transparencia de cada banco).
 * La FECHA de referencia en pantalla es dinámica: la del "Promedio de mercado" (Banxico CF303).
 * Cálculo 100% cliente (amortización francesa) — referencial, no oferta vinculante.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { V4, HEAD, SANS, GRAD, fmtMXN, inpV4, cardV4, BtnV4, Field, CalcHeader, Disclaimer, gradBorder } from './calcV4';

// Fecha "2026-04" → "abril 2026" · "2026-05-22" → "22 mayo 2026" (referencia única en pantalla)
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fmtMes = (s) => {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return s;
  const mo = parseInt(m[2], 10) - 1;
  if (mo < 0 || mo > 11) return s;
  return m[3] ? `${parseInt(m[3], 10)} ${MESES[mo]} ${m[1]}` : `${MESES[mo]} ${m[1]}`;
};

// Datos oficiales publicados por cada banco. tasa = PROMEDIO/típica (punto medio del rango publicado):
// la tasa "desde" casi nadie la alcanza (requiere score alto). tasa_desde/tasa_hasta = rango real publicado.
const BANCOS = [
  { banco: 'Banorte', producto: 'Hipoteca Fuerte', tasa: 10.9, tasa_desde: 8.80, tasa_hasta: 12.99, cat: 12.4, comision_pct: 1.0, seg_danos: 0.28, seg_vida: 0.60, edad_min: 25, edad_max: 69, ingreso_min: 10000, fin_max: 0.90, antig_lab: '2 años comprobables', antig_res: 'No especificada', pago_tardio: '5% + IVA sobre saldo vencido (desde 4º mes); moratoria 17.6–21.6%', prepago: 'Sin penalización (primeros 3 años)', plazos: '5, 10, 15, 20 años' },
  { banco: 'BBVA', producto: 'Hipoteca Fija', tasa: 10.2, tasa_desde: 9.15, tasa_hasta: 11.20, cat: 13.2, comision_pct: 1.0, seg_danos: 0.1593, seg_vida: 0.60, edad_min: 26, edad_max: 85, ingreso_min: 0, fin_max: 0.90, antig_lab: '3 meses a 2 años según valor', antig_res: '6 meses (Tu Opción México)', pago_tardio: 'El menor entre 70 UDI o el monto del incumplimiento + IVA', prepago: 'Sin penalización', plazos: '10, 15, 20 años' },
  { banco: 'Citibanamex', producto: 'La Hipoteca a tu Medida', tasa: 10.1, tasa_desde: 9.48, tasa_hasta: 10.70, cat: 12.3, comision_pct: 1.5, seg_danos: 0.30, seg_vida: 0.5154, edad_min: 23, edad_max: 59, ingreso_min: 15000, fin_max: 0.90, antig_lab: '1 año asalariados / 2 años independientes', antig_res: 'Comprobante menor a 3 meses', pago_tardio: 'Intereses moratorios', prepago: 'Sin penalización', plazos: '10, 15, 20 años', nota: 'Comisión de apertura en promoción 0% (hasta 30-sep-2026). Avalúo reembolsable 100%.' },
  { banco: 'HSBC', producto: 'Crédito Hipotecario Pago Fijo', tasa: 11.1, tasa_desde: 9.95, tasa_hasta: 12.25, cat: 12.4, comision_pct: 0.75, seg_danos: 0.2955, seg_vida: 0.44, edad_min: 25, edad_max: 80, ingreso_min: 8500, fin_max: 0.97, antig_lab: '6 meses asalariados / 2 años no asalariados', antig_res: '1 año en domicilio actual', pago_tardio: '$480 + IVA por evento', prepago: '0% en algunos productos; 1.5–2.5% + IVA en otros (primeros 60 meses)', plazos: '5, 10, 15, 20, 25 años' },
  { banco: 'Scotiabank', producto: 'Adquisición (Valora)', tasa: 10.42, tasa_desde: 10.42, tasa_hasta: 11.50, cat: 12.9, comision_pct: 1.25, seg_danos: 0.31, seg_vida: 0.60, edad_min: 25, edad_max: 80, ingreso_min: 10000, fin_max: 0.95, antig_lab: '2 años entre empleo actual y anterior', antig_res: 'Comprobante menor a 3 meses', pago_tardio: '$500 + IVA por evento', prepago: 'Sin penalización si ya se pagó la comisión; si no, 3% + IVA', plazos: '5, 7, 10, 15, 20 años' },
];

// Avalúo bancario escalonado por valor de vivienda (promedio nacional, ref. tabuladores HSBC/BBVA/Scotiabank).
// El banco lo exige para autorizar el crédito. Escrituración/ISAI/registro NO van aquí: se calculan en el Proyector de impuestos.
const avaluoEstimado = (valor) => { if (valor <= 1500000) return 3000; if (valor <= 3000000) return 6000; if (valor <= 6000000) return 12000; if (valor <= 12000000) return 22000; return 35000; };

const pagoFrances = (monto, tasaAnual, meses) => { const r = tasaAnual / 100 / 12; return r === 0 ? monto / meses : monto * (r / (1 - Math.pow(1 + r, -meses))); };

// Input de dinero: muestra "$1,000,000" mientras se escribe; guarda el número puro (string de dígitos).
function MoneyInput({ value, onChange, placeholder, style }) {
  const display = (value === '' || value == null || isNaN(Number(value))) ? '' : `$${Number(value).toLocaleString('es-MX')}`;
  return (
    <input type="text" inputMode="numeric" value={display} placeholder={placeholder || '$0'}
      onChange={(e) => { const digits = e.target.value.replace(/[^\d]/g, ''); onChange(digits); }}
      style={style || inpV4} />
  );
}

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
  const rango = (b.tasa_desde != null && b.tasa_hasta != null) ? `${b.tasa_desde}%–${b.tasa_hasta}%` : '—';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 12 }}>
      {secc('El crédito', [
        ['Tasa usada (promedio)', `${b.tasa}%`],
        ['Rango publicado', rango],
        ['CAT', `${b.cat}%`],
        ['Monto del crédito', fmtMXN(b.monto)],
        ['Aforo (LTV = crédito / valor)', `${Math.round((b.aforo || 0) * 100)}%`],
        b.interes_total != null && ['Intereses en todo el plazo', fmtMXN(b.interes_total)],
      ])}
      {secc('Desembolso inicial al banco', [
        ['Enganche', fmtMXN(b.enganche)],
        ['Comisión de apertura', fmtMXN(b.comision)],
        ['Avalúo bancario (est.)', fmtMXN(b.avaluo)],
        ['Total al banco', fmtMXN(b.pago_inicial)],
        ['Escrituración e ISAI', 'Se calcula abajo →'],
      ])}
      {secc('Requisitos', [['Edad', `${b.edad_min}–${b.edad_max} años`], ['Ingreso mensual mínimo', b.ingreso_min ? fmtMXN(b.ingreso_min) : 'No publicado'], ['Antigüedad laboral', b.antig_lab], ['Antigüedad residencial', b.antig_res], ['Financiamiento máximo', `${Math.round(b.fin_max * 100)}%`], ['Score de crédito', 'Buen historial (Buró) — sin score numérico']])}
      {secc('Seguros (mensual)', [['Seguro de daños', `${b.seg_danos} por millar`], ['Seguro de vida/desempleo', `${b.seg_vida} por millar`], ['Seguros incluidos en tu pago', fmtMXN(b.seguros_mes)]])}
      {secc('Comisiones y penalizaciones', [['Comisión de apertura', `${b.comision_pct}%`], ['Pago tardío', b.pago_tardio], ['Prepago anticipado', b.prepago], ['Plazos disponibles', b.plazos]])}
    </div>
  );
}

// Globito de ayuda (tooltip) — hover o click. Se renderiza en un PORTAL a document.body con
// position:fixed, para que NUNCA lo recorte el overflow:hidden de las tarjetas del ranking.
function Tip({ text }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  const [pos, setPos] = useState(null);
  const W = 240;
  const show = () => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 150;                 // si está muy arriba, abre hacia abajo
    const left = Math.min(Math.max(r.left + r.width / 2, W / 2 + 10), window.innerWidth - W / 2 - 10);
    setPos({ left, top: below ? r.bottom + 9 : r.top - 9, below });
    setOn(true);
  };
  const hide = () => setOn(false);
  useEffect(() => {
    if (!on) return;
    const close = () => setOn(false);
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOn(false); }; // click fuera cierra
    window.addEventListener('scroll', close, true);   // capture: el scroll NO burbujea (cierra ante cualquier contenedor)
    window.addEventListener('resize', close);
    window.addEventListener('pointerdown', onDown, true);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('pointerdown', onDown, true); };
  }, [on]);
  const canPortal = typeof document !== 'undefined' && !!document.body;
  return (
    <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center' }} onMouseEnter={show} onMouseLeave={hide}>
      <button type="button" onClick={(e) => { e.stopPropagation(); if (on) hide(); else show(); }} aria-label="Más información" style={{ width: 16, height: 16, borderRadius: 9999, border: `1px solid ${V4.ink3}`, background: '#fff', color: V4.ink3, fontSize: 10, fontWeight: 800, cursor: 'help', fontFamily: SANS, lineHeight: 1, padding: 0 }}>?</button>
      {on && pos && canPortal && ReactDOM.createPortal(
        <span style={{ position: 'fixed', left: pos.left, top: pos.top, transform: pos.below ? 'translate(-50%,0)' : 'translate(-50%,-100%)', width: W, background: V4.ink, color: '#fff', fontFamily: SANS, fontSize: 11.5, lineHeight: 1.45, padding: '9px 11px', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.30)', zIndex: 99999, fontWeight: 500, textTransform: 'none', letterSpacing: 0, textAlign: 'left', pointerEvents: 'none' }}>
          {text}
          <span style={{ position: 'absolute', [pos.below ? 'bottom' : 'top']: '100%', left: '50%', transform: 'translateX(-50%)', borderWidth: 5, borderStyle: 'solid', borderColor: pos.below ? `transparent transparent ${V4.ink} transparent` : `${V4.ink} transparent transparent transparent` }} />
        </span>, document.body)}
    </span>
  );
}

const SORT_INFO = {
  cat: { label: 'CAT', long: 'CAT (Costo Anual Total)', tip: 'El CAT resume en un solo % TODO lo que pagas al año: tasa de interés + comisiones + seguros. Entre más bajo, más barato el crédito en total.' },
  tasa: { label: 'Tasa de interés', long: 'Tasa de interés anual', tip: 'El % anual que el banco cobra sobre el saldo. Usamos la tasa PROMEDIO/típica (punto medio del rango publicado): la tasa "desde" que anuncian casi nadie la alcanza, exige score alto e historial impecable. Tu tasa definitiva sale de tu estudio de crédito.' },
  pago: { label: 'Pago mensual', long: 'Pago mensual', tip: 'Lo que pagarías cada mes: capital + intereses + seguros. Debe caber holgadamente en tu ingreso.' },
  total: { label: 'Pago total', long: 'Pago total', tip: 'La suma de todo lo que le pagas al banco por el crédito al final del plazo: mensualidades + enganche + comisión de apertura + avalúo. No incluye escrituración ni ISAI (esos van en el Proyector de impuestos).' },
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
  const [liveRate, setLiveRate] = useState(null);   // tasa hipotecaria de Banxico (CF303) o null
  const [banxCat, setBanxCat] = useState(null);     // CAT promedio de Banxico (CF303) o null
  const [banxFecha, setBanxFecha] = useState(null);
  const [banxFuente, setBanxFuente] = useState(null);

  // Ancla Banxico: tasa hipotecaria promedio del sistema (cuadro CF303). Fail-open: si no responde, null → media de bancos.
  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const base = process.env.REACT_APP_BACKEND_URL || '';
        const r = await fetch(`${base}/api/public/mortgage/market-rate`);
        if (!r.ok) return;
        const d = await r.json();
        if (activo && d && d.ok && typeof d.tasa_pct === 'number') {
          setLiveRate(d.tasa_pct); setBanxFecha(d.fecha || null); setBanxFuente(d.fuente || null);
          if (typeof d.cat_pct === 'number') setBanxCat(d.cat_pct);
        }
      } catch { /* fail-open: se promedian los 5 bancos */ }
    })();
    return () => { activo = false; };
  }, []);

  // Calcula un crédito completo para una tasa/CAT dados (amortización + costos iniciales enriquecidos)
  const calcCredito = (b, P, eng, meses, ing) => {
    const monto = P - eng;
    const cuota = pagoFrances(monto, b.tasa, meses);
    const seguros_mes = monto * (b.seg_danos + b.seg_vida) / 1000;
    const pago = cuota + seguros_mes;
    const interes_total = cuota * meses - monto;               // intereses pagados en todo el plazo
    const comision = monto * b.comision_pct / 100;
    const avaluo = avaluoEstimado(P);
    // Desembolso inicial AL BANCO por el crédito. Escrituración/ISAI/registro NO aquí (se calculan
    // en el Proyector de impuestos, misma pestaña) para no duplicar y porque en preventa no hay catastral.
    const pago_inicial = eng + comision + avaluo;
    const total = pago * meses + pago_inicial;
    const dti = ing ? pago / ing : null;
    const aforo = P > 0 ? monto / P : 0;                        // LTV = crédito / valor
    return { ...b, monto, enganche: eng, aforo, cuota, seguros_mes, interes_total, pago, comision, avaluo, pago_inicial, total, dti, tasa_val: b.tasa, cat_val: b.cat, meses };
  };

  const results = useMemo(() => {
    const P = Number(precio) || 0, eng = P * (Number(enganchePct) / 100), meses = Number(plazo) * 12, ing = Number(ingreso) || 0;
    if (!P) return [];
    return BANCOS.map((b) => {
      const c = calcCredito(b, P, eng, meses, ing);
      c.viable = (!b.ingreso_min || ing >= b.ingreso_min) && (c.aforo <= b.fin_max + 0.001) && (c.dti == null || c.dti <= 0.35);
      return c;
    });
  }, [precio, enganchePct, plazo, ingreso]);

  // Ancla "Promedio de mercado": tasa anclada a Banxico (CF303) si hay dato vivo, si no media de los 5 bancos.
  const mercado = useMemo(() => {
    const P = Number(precio) || 0, eng = P * (Number(enganchePct) / 100), meses = Number(plazo) * 12, ing = Number(ingreso) || 0;
    if (!P) return null;
    const avg = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
    const tasaProm = liveRate != null ? Number(liveRate) : Number(avg(BANCOS.map((b) => b.tasa)).toFixed(2));
    // CAT del sistema (Banxico) cuando hay dato oficial; si no, media de los 5 bancos
    const catProm = (liveRate != null && banxCat != null) ? Number(banxCat) : Number(avg(BANCOS.map((b) => b.cat)).toFixed(1));
    const b = { banco: 'Promedio de mercado', tasa: tasaProm, cat: catProm, comision_pct: 1.1, seg_danos: 0.29, seg_vida: 0.54, fin_max: 0.90 };
    const c = calcCredito(b, P, eng, meses, ing);
    c.esBanxico = liveRate != null;               // el número viene del cuadro oficial (mensual) de Banxico
    c.fecha = banxFecha; c.fuente = banxFuente;
    return c;
  }, [precio, enganchePct, plazo, ingreso, liveRate, banxCat, banxFecha, banxFuente]);

  const sorted = useMemo(() => {
    const key = { cat: 'cat_val', tasa: 'tasa_val', pago: 'pago', total: 'total' }[sort];
    return [...results].sort((a, b) => a[key] - b[key]);
  }, [results, sort]);


  const run = () => { setError(null); if (!precio || Number(precio) <= 0) { setError('Ingresa el valor de la vivienda'); return; } if (!ingreso || Number(ingreso) <= 0) { setError('Ingresa tu ingreso mensual — se necesita para evaluar tu viabilidad.'); return; } setRan(true); setOpenBank(null); };

  return (
    <div style={{ ...cardV4, padding: 24 }}>
      <CalcHeader eyebrow="Comparador de crédito hipotecario" title={`Encuentra tu mejor crédito${devName ? ` para ${devName}` : ''}`} subtitle="Compara los principales bancos de México con tasas y CAT publicados." />
      <div className="comp-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '14px 16px', marginBottom: 16 }}>
        <Field label="Valor de la vivienda" required><MoneyInput value={precio} onChange={setPrecio} placeholder="$5,800,000" /></Field>
        <Field label="Enganche %"><input type="number" value={enganchePct} onChange={(e) => setEnganchePct(e.target.value)} style={inpV4} /></Field>
        <Field label="Plazo (años)"><input type="number" value={plazo} onChange={(e) => setPlazo(e.target.value)} style={inpV4} /></Field>
        <Field label="Ingreso mensual" required><MoneyInput value={ingreso} onChange={setIngreso} placeholder="$60,000" /></Field>
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

          {/* Ancla: Promedio de mercado (Banxico CF303 vivo o media de los 5) — referencia, NO rankeable */}
          {mercado && (
            <div style={{ ...gradBorder('#faf9ff', 14), padding: '13px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 190 }}>
                {(() => {
                  // CF303 es un cuadro MENSUAL de Banxico: nunca es "en vivo" tick-a-tick. Por honestidad
                  // siempre lo etiquetamos como dato oficial mensual con su fecha, sin prometer tiempo real.
                  const banx = mercado.esBanxico;                   // dato oficial de Banxico (mensual)
                  const fechaRef = fmtMes(mercado.fecha);           // referencia ÚNICA en pantalla (ej. "abril 2026")
                  const badgeTxt = banx ? `Banxico oficial${fechaRef ? ` · ${fechaRef}` : ''}` : 'Media de bancos';
                  const col = banx ? V4.theme : V4.ink3;
                  const bg = banx ? 'rgba(109,74,255,0.10)' : 'rgba(154,160,174,0.12)';
                  const bd = banx ? 'rgba(109,74,255,0.28)' : 'rgba(154,160,174,0.30)';
                  const tip = banx
                    ? `Tasa hipotecaria promedio de TODO el sistema, publicada por Banxico en su cuadro CF303${fechaRef ? ` (${fechaRef})` : ''}. Es un dato MENSUAL (no en tiempo real). Incluye todos los perfiles, por eso suele ser algo más alta que la de los grandes bancos. Es la referencia oficial —y la fecha— de todo este comparador.`
                    : 'Media simple de la tasa de los 5 bancos (Banxico no respondió). Es solo una referencia; no es un banco al que puedas ir a solicitar.';
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 13.5, color: V4.ink }}>Promedio de mercado</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, background: bg, border: `1px solid ${bd}`, fontFamily: SANS, fontSize: 10, fontWeight: 800, color: col, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{badgeTxt}</span>
                        <Tip text={tip} />
                      </div>
                      <span style={{ fontFamily: SANS, fontSize: 11, color: V4.ink3 }}>{banx ? (mercado.fuente || 'Banxico · cuadro CF303 (tasa fija prom.)') : 'Referencia · promedia los 5 bancos'}</span>
                    </>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', gap: 20, marginLeft: 'auto', flexWrap: 'wrap' }}>
                {[['Tasa prom.', `${mercado.tasa}%`], ['CAT prom.', `${mercado.cat}%`], ['Pago mensual', fmtMXN(mercado.pago)]].map(([k, v]) => (
                  <div key={k} style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.ink2, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{k}</div>
                    <div style={{ fontFamily: HEAD, fontSize: 18, fontWeight: 800, color: V4.ink, lineHeight: 1.1 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ordenar por — segmentado grande + explicación dinámica (se ocultan en modo enfoque) */}
          {!openBank && (<>
            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: V4.ink2, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>Ordenar del más conveniente al menos conveniente por: <Tip text={si.tip} /></div>
            <div style={{ display: 'flex', gap: 6, background: '#f4f2fd', borderRadius: 12, padding: 4, marginBottom: 12, flexWrap: 'wrap' }}>
              {SORTS.map(([k, l]) => <button key={k} onClick={() => setSort(k)} style={{ flex: '1 1 120px', padding: '10px 12px', borderRadius: 9, border: 'none', background: sort === k ? GRAD : 'transparent', color: sort === k ? '#fff' : V4.ink2, fontFamily: HEAD, fontWeight: sort === k ? 800 : 600, fontSize: 13, cursor: 'pointer', boxShadow: sort === k ? '0 4px 12px rgba(109,74,255,0.28)' : 'none' }}>{l}</button>)}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: V4.ink3, marginBottom: 14 }}>Mostrando del <b style={{ color: V4.green }}>más barato</b> al <b style={{ color: V4.red }}>más caro</b> por <b style={{ color: V4.theme }}>{si.long}</b>. El <b>#1</b> es tu mejor opción por {si.label}.</div>
          </>)}

          {/* barra "ver otras opciones" en modo enfoque */}
          {openBank && (
            <button className="dmx-press" onClick={() => setOpenBank(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', marginBottom: 12, borderRadius: 10, border: `1px solid ${V4.line}`, background: '#fff', color: V4.theme, fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>← Ver las {sorted.length} opciones</button>
          )}

          {/* result cards */}
          <div className="comp-res" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 14 }}>
            {sorted.map((b, i) => { if (openBank && b.banco !== openBank) return null; const open = openBank === b.banco; const best = i === 0; return (
              <div key={b.banco} className="dmx-card" style={{ ...cardV4, padding: 0, overflow: 'hidden', border: best ? '1.5px solid transparent' : `1px solid ${V4.line}`, backgroundImage: best ? `linear-gradient(#fff,#fff), ${GRAD}` : undefined, backgroundOrigin: best ? 'border-box' : undefined, backgroundClip: best ? 'padding-box, border-box' : undefined, gridColumn: open ? '1 / -1' : 'auto' }}>
                {best && <div style={{ background: GRAD, color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '5px 14px', textAlign: 'center' }}>★ Más conveniente por {si.label}</div>}
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 9999, background: best ? GRAD : '#eee', color: best ? '#fff' : V4.ink2, fontFamily: HEAD, fontWeight: 800, fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: V4.ink }}>{b.banco}</span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 9999, fontFamily: SANS, fontWeight: 800, fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap', color: b.viable ? V4.green : '#8A5A12', background: b.viable ? 'rgba(14,159,110,0.1)' : 'rgba(224,163,62,0.18)' }}>{b.viable ? 'A tu alcance' : 'Por ajustar'}</span>
                      <Tip text={b.viable ? 'A tu alcance: con tu ingreso y enganche, el pago mensual cabe holgado (no rebasa el 35% de tu ingreso) y cumples el ingreso mínimo del banco.' : 'Por ajustar: con estos datos el pago te queda alto (arriba del 35% de tu ingreso) o aún no llegas al ingreso mínimo del banco. Sube el enganche, alarga el plazo o suma un coacreditado y vuelve a comparar.'} />
                    </span>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11.5, color: V4.ink3, marginBottom: 12 }}>{b.producto}</div>
                  {/* HERO = la métrica que ordenas */}
                  <div style={{ padding: '12px 14px', borderRadius: 12, background: best ? 'rgba(109,74,255,0.06)' : V4.surface, border: `1px solid ${best ? 'rgba(109,74,255,0.2)' : V4.line}`, marginBottom: 12 }}>
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.ink2, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{si.long}</div>
                    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: V4.theme, letterSpacing: '-0.02em' }}>{heroOf(b)}</div>
                  </div>
                  {/* las 4 métricas — la ordenada resaltada */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                    {metricRow(b).map(([lbl, val, key]) => { const act = key === sort; return (
                      <div key={key} style={{ padding: '7px 9px', borderRadius: 8, background: act ? 'rgba(109,74,255,0.09)' : '#fafafb', border: `1px solid ${act ? 'rgba(109,74,255,0.25)' : V4.line}` }}>
                        <div style={{ fontFamily: SANS, fontSize: 9.5, color: V4.ink2, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{lbl}</div>
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
                    <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 10, background: 'rgba(109,74,255,0.05)', border: `1px solid rgba(109,74,255,0.16)`, fontFamily: SANS, fontSize: 11.5, color: V4.ink2, lineHeight: 1.5 }}>
                      Esto es solo el desembolso <b>al banco</b>. Los gastos de <b>escrituración, ISAI y registro</b> se calculan aparte en el <b>Proyector de impuestos</b>, aquí abajo. En preventa aún no hay valor catastral, así que el proyector usa el <b>precio de compra</b> como base.
                    </div>
                  </div>
                )}
              </div>
            ); })}
          </div>
          <div style={{ marginTop: 16 }}><Disclaimer>Usamos la <b>tasa promedio/típica</b> de cada banco (punto medio del rango publicado), no la tasa "desde": esa mejor tasa casi nadie la alcanza porque exige score alto e historial impecable. La <b>fecha de referencia</b> de todo el comparador es la del "Promedio de mercado", anclado a la tasa del sistema de Banxico (cuadro CF303). El avalúo y el aforo son estimados; los gastos de <b>escrituración e ISAI se calculan en el Proyector de impuestos</b>, aquí abajo. Tu tasa, CAT y condiciones definitivas salen de tu estudio de crédito y no constituyen una oferta vinculante.</Disclaimer></div>
        </div>
        );
      })()}
      <style>{`@media(max-width:640px){ .comp-grid{ grid-template-columns:1fr 1fr !important; } .comp-res{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

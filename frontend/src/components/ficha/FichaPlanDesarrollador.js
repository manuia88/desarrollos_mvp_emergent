/**
 * FichaPlanDesarrollador — Tab ① de "Planes de pago": el plan de pagos DEL DESARROLLADOR.
 * Eliges una unidad, ajustas enganche/mensualidades/escritura (si editas 2, el 3º se ajusta
 * solo para dar 100%) y ves CUÁNDO pagas cada parte (línea de tiempo). Dos salidas: al crédito
 * hipotecario (②) y directo a escrituración/ISAI (③, para quien paga de contado). Look v4.
 * REUSA breakdown() de paymentSchemes (espejo del motor payment_schemes.py) — no duplica cálculo.
 * Emite el plan hacia arriba (onPlanChange) para el resumen final del cierre.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { V4, HEAD, SANS, GRAD, fmtMXN, inpV4, cardV4, BtnV4, Field, CalcHeader, Disclaimer } from './calcV4';
import { breakdown } from '../../utils/paymentSchemes';

const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fmtMes = (ym) => {
  if (!ym || typeof ym !== 'string') return null;
  const m = ym.match(/^(\d{4})-(\d{2})/);
  if (!m) return ym;
  const mo = parseInt(m[2], 10) - 1;
  return (mo >= 0 && mo <= 11) ? `${MESL[mo]} ${m[1]}` : ym;
};
const toYM = (s) => (s ? String(s).slice(0, 7) : '');
const monthsBetween = (a, b) => {
  const pa = a && a.match(/^(\d{4})-(\d{2})/), pb = b && b.match(/^(\d{4})-(\d{2})/);
  if (!pa || !pb) return null;
  return Math.max(0, (+pb[1] - +pa[1]) * 12 + (+pb[2] - +pa[2]));
};
const clampPct = (v) => Math.max(0, Math.min(100, Math.round(parseFloat(v) || 0)));

// Rampa de marca morado→rosa a lo largo de la línea de tiempo (firma → obra → escritura)
const SEG = { eng: '#6D4AFF', mens: '#9A50C8', esc: '#C63FAE' };
const NO_VENTA = new Set(['vendido', 'bloqueado']);
const STAGE_INMEDIATA = new Set(['entrega_inmediata', 'terminado']);

export default function FichaPlanDesarrollador({ dev, units, unitInicial, schemes, fechaInicio, fechaEntrega, onPlanChange, onGoCredito, onGoEscrituracion }) {
  const lista = (Array.isArray(schemes) && schemes.length)
    ? (schemes.find((s) => /precio de lista/i.test(s.nombre || '') || !s.descuento_pct) || schemes[0])
    : null;
  const apartado = lista && lista.apartado_mxn != null ? lista.apartado_mxn : 0;
  const inmediata = STAGE_INMEDIATA.has(dev.stage);

  // unidad elegida — solo comprables (no vendidas/bloqueadas), sin duplicar por clave
  const opts = [];
  (units || []).forEach((u) => {
    if (!u || !u.price || NO_VENTA.has(u.status)) return;
    if (!opts.some((x) => x.unit_number === u.unit_number)) opts.push(u);
  });
  const initUnit = (unitInicial && !NO_VENTA.has(unitInicial.status) ? unitInicial : null) || opts.find((u) => u.status === 'disponible') || opts[0] || null;
  const [unitNo, setUnitNo] = useState(initUnit ? initUnit.unit_number : '');
  const unit = opts.find((u) => u.unit_number === unitNo) || initUnit || null;
  const price = (unit && unit.price) || dev.price_from || 0;

  // fechas de obra (editables) — sin inicio publicado, asumimos que arranca este mes
  const nowYM = new Date().toISOString().slice(0, 7);
  const [fIni, setFIni] = useState(toYM(fechaInicio || dev.fecha_lanzamiento) || nowYM);
  const [fEnt, setFEnt] = useState(toYM(fechaEntrega || dev.delivery_estimate) || '');
  const meses = inmediata ? 0 : (monthsBetween(fIni, fEnt) ?? 0);

  // porcentajes: plan oficial (del esquema) vs a mi medida (editable, auto-100%)
  const [modo, setModo] = useState('oficial');
  const [pct, setPct] = useState({
    eng: lista ? Number(lista.firma_pct) || 10 : 10,
    mens: lista ? Number(lista.mensualidades_pct) || 20 : 20,
    esc: lista ? Number(lista.escritura_pct) || 70 : 70,
  });
  const [orden, setOrden] = useState(['mens', 'eng', 'esc']); // front=recién editado · back=el que se ajusta solo
  const auto = orden[2];

  const editPct = (field, raw) => {
    const nuevoOrden = [field, ...orden.filter((k) => k !== field)];
    const otro = nuevoOrden[1], aut = nuevoOrden[2];
    let v = clampPct(raw);
    v = Math.min(v, 100 - pct[otro]);
    const p = { ...pct, [field]: v };
    p[aut] = Math.max(0, 100 - v - pct[otro]);
    setPct(p); setOrden(nuevoOrden);
  };

  const bd = useMemo(() => breakdown(price, {
    firma_pct: pct.eng, mensualidades_pct: pct.mens, escritura_pct: pct.esc,
    descuento_pct: 0, apartado_mxn: apartado, meses_override: inmediata ? 1 : (meses || ''),
  }, fIni, fEnt), [price, pct, apartado, inmediata, meses, fIni, fEnt]);

  // emitir el plan hacia arriba (para el resumen del cierre y el prefill del crédito)
  useEffect(() => {
    if (!onPlanChange) return;
    onPlanChange({
      unit, price, eng: pct.eng, mens: pct.mens, esc: pct.esc,
      firma: bd.firma, mensualidad: bd.mensualidad, mensualidades_total: bd.mensualidades_total,
      meses, escrituracion: bd.escrituracion, apartado, fEnt, fIni, inmediata,
      enganchePctCredito: pct.eng + pct.mens,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price, pct.eng, pct.mens, pct.esc, meses, fEnt, unitNo]);

  const F = ['eng', 'mens', 'esc'];
  const LBL = { eng: 'Enganche', mens: 'Mensualidades', esc: 'Al escriturar' };

  // pasos de la línea de tiempo (cuándo pagas cada parte)
  const pasos = [
    apartado ? { ic: '🔒', t: 'Apartas', v: fmtMXN(apartado), w: 'hoy', c: '#8A63FF' } : null,
    { ic: '✍️', t: 'Al firmar', v: fmtMXN(bd.firma), w: `enganche ${pct.eng}%`, c: SEG.eng },
    { ic: '📅', t: 'Mensualidades', v: (meses > 0 && bd.mensualidad > 0) ? `${fmtMXN(bd.mensualidad)}/mes` : (inmediata ? 'No aplica' : '—'), w: (meses > 0 && bd.mensualidad > 0) ? `${meses} pagos · durante obra` : (inmediata ? 'entrega inmediata' : 'define fechas'), c: SEG.mens },
    { ic: '🔑', t: 'Al escriturar', v: fmtMXN(bd.escrituracion), w: `${pct.esc}% · en la entrega`, c: SEG.esc },
  ].filter(Boolean);

  return (
    <div style={{ ...cardV4, padding: 24 }}>
      <CalcHeader eyebrow="Plan de pagos del desarrollador" title="Arma tu plan de pagos"
        subtitle="Elige tu unidad y ajusta enganche, mensualidades y escritura. Los tres siempre suman 100%." />

      {/* unidad + fechas */}
      <div className="plan-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '14px 16px', marginBottom: 16 }}>
        <Field label="Unidad" required>
          <select value={unitNo} onChange={(e) => setUnitNo(e.target.value)} style={{ ...inpV4, cursor: 'pointer' }}>
            {opts.length === 0 && <option value="">Sin unidades disponibles</option>}
            {opts.map((u) => (
              <option key={u.unit_number} value={u.unit_number}>
                {u.unit_number} · {fmtMXN(u.price)}{u.status && u.status !== 'disponible' ? ` · ${u.status}` : ''}
              </option>
            ))}
          </select>
        </Field>
        {!inmediata && (<>
          <Field label="Inicio de obra"><input type="month" value={fIni} onChange={(e) => setFIni(e.target.value)} style={inpV4} /></Field>
          <Field label="Entrega estimada"><input type="month" value={fEnt} onChange={(e) => setFEnt(e.target.value)} style={inpV4} /></Field>
        </>)}
      </div>

      {/* modo */}
      <div style={{ display: 'flex', gap: 6, background: '#f4f2fd', borderRadius: 12, padding: 4, marginBottom: 16, maxWidth: 340 }}>
        {[['oficial', 'Plan oficial'], ['manual', 'Ajustar a mi medida']].map(([k, l]) => (
          <button key={k} onClick={() => { setModo(k); if (k === 'oficial' && lista) setPct({ eng: Number(lista.firma_pct) || 10, mens: Number(lista.mensualidades_pct) || 20, esc: Number(lista.escritura_pct) || 70 }); }}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: 'none', background: modo === k ? GRAD : 'transparent', color: modo === k ? '#fff' : V4.ink2, fontFamily: HEAD, fontWeight: modo === k ? 800 : 600, fontSize: 13, cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {/* % editables (manual) o fijos (oficial) */}
      <div className="plan-pcts" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
        {F.map((k) => (
          <div key={k} style={{ borderRadius: 12, padding: '12px 14px', background: '#fff', border: `1px solid ${modo === 'manual' && auto === k ? 'rgba(109,74,255,0.4)' : V4.line}`, borderLeft: `4px solid ${SEG[k]}` }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: V4.ink2, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>{LBL[k]}</div>
            {modo === 'manual' ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <input type="number" min="0" max="100" value={pct[k]} onChange={(e) => editPct(k, e.target.value)}
                  style={{ ...inpV4, padding: '6px 9px', fontFamily: HEAD, fontWeight: 800, fontSize: 20, width: 82 }} />
                <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: V4.ink2 }}>%</span>
              </div>
            ) : (
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, color: V4.ink }}>{pct[k]}%</div>
            )}
            {modo === 'manual' && auto === k && <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.theme, marginTop: 3 }}>se ajusta solo</div>}
          </div>
        ))}
      </div>

      {/* barra de proporción — rampa de marca */}
      <div style={{ display: 'flex', height: 14, borderRadius: 9999, overflow: 'hidden', marginBottom: 18, boxShadow: 'inset 0 0 0 1px rgba(16,18,28,0.06)' }}>
        {F.map((k) => <div key={k} title={`${LBL[k]} ${pct[k]}%`} style={{ width: `${pct[k]}%`, background: SEG[k], transition: 'width .2s ease' }} />)}
      </div>

      {/* línea de tiempo: CUÁNDO pagas cada parte */}
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: V4.ink, marginBottom: 10 }}>Así pagas tu unidad</div>
      <div className="plan-timeline" style={{ display: 'grid', gridTemplateColumns: `repeat(${pasos.length},1fr)`, gap: 10, position: 'relative' }}>
        {pasos.map((p, i) => (
          <div key={i} className="dmx-card" style={{ ...cardV4, padding: '14px 15px', boxShadow: 'none', borderTop: `3px solid ${p.c}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ fontSize: 15 }}>{p.ic}</span>
              <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: V4.ink2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.t}</span>
            </div>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: V4.ink, letterSpacing: '-0.01em' }}>{p.v}</div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: V4.ink3, marginTop: 2 }}>{p.w}</div>
          </div>
        ))}
      </div>

      {/* precio total */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, padding: '12px 16px', borderRadius: 12, ...{ background: 'rgba(109,74,255,0.05)', border: '1px solid rgba(109,74,255,0.16)' } }}>
        <span style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink2 }}>Precio de la unidad{unit ? ` ${unit.unit_number}` : ''}{modo === 'oficial' ? ' · plan oficial del desarrollador' : ''}</span>
        <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: V4.theme, letterSpacing: '-0.01em' }}>{fmtMXN(bd.precio_aplicado)}</span>
      </div>

      {/* salidas */}
      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <BtnV4 onClick={() => onGoCredito && onGoCredito({ price, enganchePct: pct.eng + pct.mens, unit })}>
          Calcular mi crédito hipotecario →
        </BtnV4>
        <button className="dmx-press" onClick={() => onGoEscrituracion && onGoEscrituracion({ price, montoCredito: bd.escrituracion, unit, conCredito: false })}
          style={{ background: '#fff', color: V4.theme, border: `1.5px solid ${V4.theme}`, borderRadius: 12, fontFamily: HEAD, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 13, padding: '13px 22px', cursor: 'pointer' }}>
          Pago de contado · ver escrituración →
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <Disclaimer>
          El plan lo define el desarrollador; aquí lo calculas con sus porcentajes oficiales o lo ajustas a tu medida. Al escriturar puedes pagar de <b>contado</b> o con un <b>crédito hipotecario</b> (botones de arriba). Los gastos de <b>escrituración e ISAI</b> se estiman en la pestaña ③; {inmediata ? 'en entrega inmediata suele haber valor catastral, lo que hace el ISAI más exacto.' : 'en preventa aún no hay valor catastral, así que el ISAI usa el precio de compra.'} Cifras referenciales, no constituyen oferta vinculante.
        </Disclaimer>
      </div>

      <style>{`@media(max-width:640px){ .plan-grid{ grid-template-columns:1fr !important; } .plan-pcts{ grid-template-columns:1fr !important; } .plan-timeline{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

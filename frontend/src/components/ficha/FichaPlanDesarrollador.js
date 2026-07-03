/**
 * FichaPlanDesarrollador — Tab A de "Planes de pago": el plan de pagos DEL DESARROLLADOR.
 * Eliges una unidad, ajustas enganche/mensualidades/escritura (si editas 2, el 3º se ajusta
 * solo para dar 100%) y ves tu desglose. Dos botones enlazan la unidad al crédito hipotecario
 * y a los gastos de escrituración (ISAI). Look v4 (calcV4). REUSA breakdown() de paymentSchemes
 * (espejo del motor backend payment_schemes.py) — no duplica cálculo.
 */
import React, { useState, useMemo } from 'react';
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
const toYM = (s) => (s ? String(s).slice(0, 7) : '');        // "2027-10-01" | "2027-10" → "2027-10"
const monthsBetween = (a, b) => {
  const pa = a && a.match(/^(\d{4})-(\d{2})/), pb = b && b.match(/^(\d{4})-(\d{2})/);
  if (!pa || !pb) return null;
  return Math.max(0, (+pb[1] - +pa[1]) * 12 + (+pb[2] - +pa[2]));
};
const clampPct = (v) => Math.max(0, Math.min(100, Math.round(parseFloat(v) || 0)));

const SEG = { eng: V4.theme, mens: V4.amber, esc: V4.green };
const STAGE_INMEDIATA = new Set(['entrega_inmediata', 'terminado']);

export default function FichaPlanDesarrollador({ dev, units, unitInicial, schemes, fechaInicio, fechaEntrega, onGoCredito, onGoEscrituracion }) {
  const lista = (Array.isArray(schemes) && schemes.length)
    ? (schemes.find((s) => /precio de lista/i.test(s.nombre || '') || !s.descuento_pct) || schemes[0])
    : null;
  const apartado = lista && lista.apartado_mxn != null ? lista.apartado_mxn : 0;
  const inmediata = STAGE_INMEDIATA.has(dev.stage);

  // unidad elegida
  const opts = (units || []).filter((u) => u && u.price);
  const initUnit = unitInicial || opts.find((u) => u.status === 'disponible') || opts[0] || null;
  const [unitNo, setUnitNo] = useState(initUnit ? initUnit.unit_number : '');
  const unit = opts.find((u) => u.unit_number === unitNo) || initUnit || null;
  const price = (unit && unit.price) || dev.price_from || 0;

  // fechas de obra (editables) — para entrega inmediata no aplican. Si el dev no publicó inicio,
  // asumimos que la obra arranca este mes (preventa vendiéndose hoy); el usuario puede ajustarlo.
  const nowYM = new Date().toISOString().slice(0, 7);
  const [fIni, setFIni] = useState(toYM(fechaInicio || dev.fecha_lanzamiento) || nowYM);
  const [fEnt, setFEnt] = useState(toYM(fechaEntrega || dev.delivery_estimate) || '');
  const meses = inmediata ? 0 : (monthsBetween(fIni, fEnt) ?? 0);

  // porcentajes: prediseñada (del esquema) vs manual (editable, auto-100%)
  const [modo, setModo] = useState('predisenada');
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
    v = Math.min(v, 100 - pct[otro]);           // no dejar que la suma pase de 100
    const p = { ...pct, [field]: v };
    p[aut] = Math.max(0, 100 - v - pct[otro]);
    setPct(p); setOrden(nuevoOrden);
  };

  // desglose (reusa el espejo del motor backend)
  const bd = useMemo(() => breakdown(price, {
    firma_pct: pct.eng, mensualidades_pct: pct.mens, escritura_pct: pct.esc,
    descuento_pct: 0, apartado_mxn: apartado, meses_override: inmediata ? 1 : (meses || ''),
  }, fIni, fEnt), [price, pct, apartado, inmediata, meses, fIni, fEnt]);

  const F = ['eng', 'mens', 'esc'];
  const LBL = { eng: 'Enganche', mens: 'Mensualidades', esc: 'Al escriturar' };

  return (
    <div style={{ ...cardV4, padding: 24 }}>
      <CalcHeader eyebrow="Plan de pagos del desarrollador" title="Arma tu plan de pagos"
        subtitle="Elige tu unidad y ajusta enganche, mensualidades y escritura. Los tres siempre suman 100%." />

      {/* unidad + fechas */}
      <div className="plan-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '14px 16px', marginBottom: 16 }}>
        <Field label="Unidad" required>
          <select value={unitNo} onChange={(e) => setUnitNo(e.target.value)} style={{ ...inpV4, cursor: 'pointer' }}>
            {opts.length === 0 && <option value="">Sin unidades</option>}
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

      {/* modo prediseñada / manual */}
      <div style={{ display: 'flex', gap: 6, background: '#f4f2fd', borderRadius: 12, padding: 4, marginBottom: 14, maxWidth: 320 }}>
        {[['predisenada', 'Plan oficial'], ['manual', 'Ajustar a mi medida']].map(([k, l]) => (
          <button key={k} onClick={() => { setModo(k); if (k === 'predisenada' && lista) setPct({ eng: Number(lista.firma_pct) || 10, mens: Number(lista.mensualidades_pct) || 20, esc: Number(lista.escritura_pct) || 70 }); }}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: 'none', background: modo === k ? GRAD : 'transparent', color: modo === k ? '#fff' : V4.ink2, fontFamily: HEAD, fontWeight: modo === k ? 800 : 600, fontSize: 13, cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {/* barra de proporción */}
      <div style={{ display: 'flex', height: 12, borderRadius: 9999, overflow: 'hidden', marginBottom: 6, border: `1px solid ${V4.line}` }}>
        {F.map((k) => <div key={k} style={{ width: `${pct[k]}%`, background: SEG[k], transition: 'width .18s ease' }} />)}
      </div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        {F.map((k) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: SANS, fontSize: 11.5, color: V4.ink2 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: SEG[k] }} />{LBL[k]} {pct[k]}%</span>)}
      </div>

      {/* % editables (manual) o fijos (prediseñada) */}
      <div className="plan-pcts" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 8 }}>
        {F.map((k) => (
          <div key={k} style={{ ...cardV4, padding: 14, boxShadow: 'none', borderColor: modo === 'manual' && auto === k ? 'rgba(109,74,255,0.35)' : V4.line }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: SEG[k] }} />
              <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: V4.ink2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{LBL[k]}</span>
            </div>
            {modo === 'manual' ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <input type="number" min="0" max="100" value={pct[k]} onChange={(e) => editPct(k, e.target.value)}
                  style={{ ...inpV4, padding: '8px 10px', fontFamily: HEAD, fontWeight: 800, fontSize: 20, width: 88 }} />
                <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: V4.ink2 }}>%</span>
              </div>
            ) : (
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, color: V4.ink }}>{pct[k]}%</div>
            )}
            {modo === 'manual' && auto === k && <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.theme, marginTop: 4 }}>se ajusta solo</div>}
          </div>
        ))}
      </div>
      {modo === 'predisenada' && lista && <div style={{ fontFamily: SANS, fontSize: 11.5, color: V4.ink3, marginBottom: 14 }}>Plan oficial del desarrollador · valores fijos.{inmediata ? ' Entrega inmediata.' : ''}</div>}

      {/* resultado */}
      <div className="plan-res" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 8 }}>
        {[
          { l: 'Precio final', v: fmtMXN(bd.precio_aplicado), s: unit ? `Unidad ${unit.unit_number}` : null, accent: true },
          { l: 'Al firmar', v: fmtMXN(bd.firma), s: `Enganche ${pct.eng}%${apartado ? ` · aparta con ${fmtMXN(apartado)}` : ''}` },
          { l: 'Mensualidad', v: (meses && bd.mensualidad) ? `${fmtMXN(bd.mensualidad)}/mes` : (inmediata ? 'No aplica' : '—'), s: (meses && bd.mensualidad) ? `${meses} mensualidades · entrega ${fmtMes(fEnt) || '—'}` : (inmediata ? 'Entrega inmediata' : 'Define las fechas de obra') },
          { l: 'Al escriturar', v: fmtMXN(bd.escrituracion), s: `${pct.esc}% del valor` },
        ].map((c, i) => (
          <div key={i} className="dmx-card" style={{ ...cardV4, padding: 16, position: 'relative', overflow: 'hidden' }}>
            {c.accent && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: GRAD }} />}
            <div style={{ fontFamily: SANS, fontSize: 11, color: V4.ink2, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{c.l}</div>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: c.accent ? V4.theme : V4.ink, marginTop: 3, letterSpacing: '-0.01em' }}>{c.v}</div>
            {c.s && <div style={{ fontFamily: SANS, fontSize: 11, color: V4.ink3, marginTop: 3 }}>{c.s}</div>}
          </div>
        ))}
      </div>

      {/* botones de enlace */}
      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <BtnV4 onClick={() => onGoCredito && onGoCredito({ price, enganchePct: Math.round(pct.eng + pct.mens), unit })}>
          Calcula tu crédito hipotecario →
        </BtnV4>
        <button className="dmx-press" onClick={() => onGoEscrituracion && onGoEscrituracion({ price, montoCredito: bd.escrituracion, unit })}
          style={{ background: '#fff', color: V4.theme, border: `1.5px solid ${V4.theme}`, borderRadius: 12, fontFamily: HEAD, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 13, padding: '13px 22px', cursor: 'pointer' }}>
          Calcular gastos de escrituración →
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <Disclaimer>
          El plan lo define el desarrollador; aquí lo calculas a partir de sus porcentajes oficiales. Al escriturar puedes pagar de contado o con un <b>crédito hipotecario</b> (botón de arriba). Los gastos de <b>escrituración e ISAI</b> se estiman aparte; {inmediata ? 'en entrega inmediata suele existir valor catastral, lo que hace el ISAI más exacto.' : 'en preventa aún no hay valor catastral, así que el cálculo usa el precio de compra.'} Cifras referenciales, no constituyen oferta vinculante.
        </Disclaimer>
      </div>

      <style>{`@media(max-width:640px){ .plan-grid{ grid-template-columns:1fr !important; } .plan-pcts{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

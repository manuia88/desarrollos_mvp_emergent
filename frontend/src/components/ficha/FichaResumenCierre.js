/**
 * FichaResumenCierre — el cierre del embudo de "Planes de pago": junta TODO en un solo lugar.
 * La unidad, el plan de pagos (cuándo pagas cada parte), el crédito elegido (o contado), los
 * impuestos/gastos de cierre y el GRAN TOTAL (inversión en la propiedad). Look v4 (calcV4).
 * Lee estado ya calculado por los otros componentes; no recalcula motores.
 */
import React from 'react';
import { V4, HEAD, SANS, fmtMXN, cardV4, CalcHeader, gradBorder } from './calcV4';

function Row({ k, v, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: `1px solid ${V4.line}` }}>
      <span style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink2 }}>{k}</span>
      <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: strong ? 800 : 700, color: strong ? V4.theme : V4.ink, textAlign: 'right' }}>{v}</span>
    </div>
  );
}
function Section({ n, title, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 9999, background: 'rgba(109,74,255,0.12)', color: V4.theme, fontFamily: HEAD, fontWeight: 800, fontSize: 11 }}>{n}</span>
        <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: V4.ink }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function FichaResumenCierre({ plan, credito, cierre }) {
  if (!plan || !plan.price) {
    return (
      <div style={{ ...cardV4, padding: 22, fontFamily: SANS, fontSize: 13, color: V4.ink3 }}>
        Arma tu plan en la pestaña ① y calcula el ISAI arriba para ver aquí el resumen completo de tu compra.
      </div>
    );
  }
  const precio = plan.price;
  const closing = cierre && cierre.closing;
  const cierreTotal = closing ? closing.total : null;
  const isai = closing ? closing.isai : null;
  const inversionTotal = cierreTotal != null ? precio + cierreTotal : null;

  return (
    <div style={{ ...cardV4, padding: 24 }}>
      <CalcHeader eyebrow="Resumen" title="Tu compra, de principio a fin"
        subtitle="La unidad, tu plan, tu crédito y los impuestos — todo junto." />

      <Section n="1" title="La unidad">
        <Row k="Unidad" v={plan.unit ? plan.unit.unit_number : '—'} />
        <Row k="Precio" v={fmtMXN(precio)} strong />
      </Section>

      <Section n="2" title="Tu plan de pagos">
        {plan.apartado ? <Row k="Apartas (hoy)" v={fmtMXN(plan.apartado)} /> : null}
        <Row k={`Al firmar · enganche ${plan.eng}%`} v={fmtMXN(plan.firma)} />
        {plan.meses > 0 && plan.mensualidad > 0
          ? <Row k={`Mensualidades · ${plan.meses} durante obra`} v={`${fmtMXN(plan.mensualidad)}/mes`} />
          : <Row k="Mensualidades" v="No aplica" />}
        <Row k={`Al escriturar · ${plan.esc}%`} v={fmtMXN(plan.escrituracion)} />
      </Section>

      <Section n="3" title="Cómo pagas la escritura">
        {credito ? (<>
          <Row k="Con crédito" v={credito.banco} />
          <Row k="Tasa · CAT" v={`${credito.tasa}% · ${credito.cat}%`} />
          <Row k="Monto financiado" v={fmtMXN(credito.monto)} />
          <Row k="Pago mensual del crédito" v={`${fmtMXN(credito.pago)}/mes`} strong />
        </>) : (
          <Row k="De contado" v="Sin crédito · cubres la escritura completa" />
        )}
      </Section>

      <Section n="4" title="Impuestos y gastos de cierre">
        {closing ? (<>
          <Row k="ISAI (impuesto de adquisición)" v={fmtMXN(isai)} />
          {closing.notario_fees != null && <Row k="Notario" v={fmtMXN(closing.notario_fees)} />}
          {closing.registro != null && <Row k="Registro (RPP)" v={fmtMXN(closing.registro)} />}
          {closing.hipoteca && closing.hipoteca.aplica && <Row k="Constitución de hipoteca" v={fmtMXN(closing.hipoteca.total)} />}
          <Row k="Total de escrituración y cierre" v={fmtMXN(cierreTotal)} strong />
        </>) : (
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink3, padding: '9px 0', borderTop: `1px solid ${V4.line}` }}>
            Presiona <b>“Calcular ISAI y cierre”</b> arriba para completar esta sección.
          </div>
        )}
      </Section>

      {inversionTotal != null && (
        <div style={{ ...gradBorder('#faf9ff', 16), padding: '18px 20px', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, color: V4.ink2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Inversión total en la propiedad</div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: V4.ink3, marginTop: 2 }}>Precio {fmtMXN(precio)} + escrituración y cierre {fmtMXN(cierreTotal)}</div>
          </div>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, color: V4.theme, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{fmtMXN(inversionTotal)}</div>
        </div>
      )}

      {credito && (() => {
        const anios = credito.meses ? Math.round(credito.meses / 12) : null;
        const pagadoBanco = (credito.pago && credito.meses) ? credito.pago * credito.meses : null;   // solo mensualidades al banco
        const intereses = (pagadoBanco != null && credito.monto != null) ? pagadoBanco - credito.monto : null;
        return (
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(109,74,255,0.05)', border: '1px solid rgba(109,74,255,0.16)', fontFamily: SANS, fontSize: 11.5, color: V4.ink2, lineHeight: 1.55 }}>
            Con crédito no pagas todo hoy: cubres el enganche y las mensualidades durante la obra, y <b>financias {fmtMXN(credito.monto)}</b> de la escritura a ≈ <b>{fmtMXN(credito.pago)}/mes</b>{anios ? ` durante ${anios} años` : ''}.
            {pagadoBanco != null && <> Le pagas al banco ≈ <b>{fmtMXN(pagadoBanco)}</b> en total{intereses != null ? <> (≈ <b>{fmtMXN(intereses)}</b> de intereses)</> : null}.</>}
          </div>
        );
      })()}

      <div style={{ marginTop: 14, borderLeft: `3px solid ${V4.theme}`, paddingLeft: 11, fontFamily: SANS, fontSize: 11, color: V4.ink3, lineHeight: 1.5 }}>
        Estimación de referencia con los motores de DesarrollosMX. El notario emite el cálculo definitivo del ISAI y la escritura; el banco define tu tasa según tu estudio de crédito.
      </div>
    </div>
  );
}

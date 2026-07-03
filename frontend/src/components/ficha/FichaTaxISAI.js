/**
 * FichaTaxISAI — proyector de impuestos (ISAI comprador + costos de cierre) standalone, re-vestido v4.
 * MOTOR INTACTO: POST /api/tax/isai-comprador y /api/tax/closing-cost-total (getIsaiComprador/getClosingCost).
 * Surfacea el desglose de tramos que el motor ya calcula (cuota fija, excedente, marginal, tasa efectiva).
 * Reemplaza al IsaiCalc reducido anterior. No duplica motor.
 */
import React, { useState } from 'react';
import { getIsaiComprador, getClosingCost } from '../../api/tax_projector';
import { V4, HEAD, SANS, fmtMXN, fmtPct, inpV4, cardV4, BtnV4, Field, CalcHeader, ResultCard, Disclaimer } from './calcV4';

function BreakdownRow({ k, v, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: `1px solid ${V4.line}` }}>
      <span style={{ fontFamily: SANS, fontSize: 13, color: V4.ink2 }}>{k}</span>
      <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: strong ? 800 : 700, color: strong ? V4.theme : V4.ink }}>{v}</span>
    </div>
  );
}

export default function FichaTaxISAI({ basePrice = 0, conCreditoInicial = false, montoCreditoInicial, unitLabel, preventa }) {
  const [precio, setPrecio] = useState(basePrice || '');
  const [catastral, setCatastral] = useState('');
  const [conCredito, setConCredito] = useState(!!conCreditoInicial);
  const [monto, setMonto] = useState(montoCreditoInicial != null ? String(Math.round(montoCreditoInicial)) : '');
  const [loading, setLoading] = useState(false); const [error, setError] = useState(null);
  const [isai, setIsai] = useState(null); const [closing, setClosing] = useState(null);

  const run = async () => {
    setError(null);
    const pv = Number(precio);
    if (!pv || pv <= 0) { setError('Ingresa un precio de compra válido'); return; }
    const vc = Number(catastral) || 0;
    setLoading(true);
    try {
      const [i, c] = await Promise.all([
        getIsaiComprador({ precio_venta: pv, valor_catastral: vc, year: 2026 }),
        getClosingCost({ precio_venta: pv, valor_catastral: vc, year: 2026, con_credito_hipotecario: conCredito, monto_credito: conCredito ? (Number(monto) || null) : null }),
      ]);
      setIsai(i); setClosing(c);
    } catch (e) { setError(e?.body?.detail || e?.message || 'Error al calcular'); }
    setLoading(false);
  };

  const b = isai && isai.breakdown;
  const enAdelante = b && b.limite_superior != null && b.limite_superior >= 1e17;
  return (
    <div style={{ ...cardV4, padding: 24 }}>
      <CalcHeader eyebrow="Proyector de impuestos" title="ISAI y costos de cierre" subtitle="Tarifa oficial CDMX 2026 (progresiva). El notario emite el cálculo definitivo." />
      {unitLabel && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 14, borderRadius: 10, background: 'rgba(109,74,255,0.06)', border: '1px solid rgba(109,74,255,0.18)', fontFamily: SANS, fontSize: 12.5, color: V4.ink2 }}>
          🔗 Vinculado a tu plan: <b style={{ color: V4.ink }}>{unitLabel}</b>.{preventa ? ' En preventa aún no hay valor catastral: dejándolo vacío usamos el precio de compra.' : ' Si conoces el valor catastral, el ISAI será más exacto.'}
        </div>
      )}
      <div className="isaiv4-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
        <Field label="Precio de compra (MXN)" required>
          <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} style={inpV4} />
        </Field>
        <Field label="Valor catastral (MXN)" hint="Opcional — si lo omites usamos el precio.">
          <input type="number" value={catastral} onChange={(e) => setCatastral(e.target.value)} placeholder="0" style={inpV4} />
        </Field>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontFamily: SANS, fontSize: 13, color: V4.ink2, cursor: 'pointer' }}>
        <input type="checkbox" checked={conCredito} onChange={(e) => setConCredito(e.target.checked)} style={{ accentColor: V4.theme }} /> Compro con crédito hipotecario (suma gastos de constitución de hipoteca)
      </label>
      {conCredito && (
        <div style={{ marginTop: 12, maxWidth: 320 }}>
          <Field label="Monto del crédito (MXN)" hint="Opcional — si lo omites usamos 80% del precio.">
            <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="80% del precio" style={inpV4} />
          </Field>
        </div>
      )}
      {error && <div style={{ padding: '10px 12px', borderRadius: 10, margin: '14px 0 0', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.22)', fontFamily: SANS, fontSize: 12.5, color: V4.red }}>{error}</div>}
      <div style={{ marginTop: 16 }}><BtnV4 onClick={run} disabled={loading}>{loading ? 'Calculando…' : 'Calcular ISAI y cierre'}</BtnV4></div>

      {(isai || closing) && (
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="isaiv4-cards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {isai && (
              <ResultCard eyebrow="Impuesto ISAI" value={fmtMXN(isai.isai)} sub={`Base: ${fmtMXN(isai.base)} (${b && b.base_usada === 'valor_catastral' ? 'valor catastral' : 'precio de venta'})`}
                lines={b ? [
                  ['Cuota fija del tramo', fmtMXN(b.cuota_fija)],
                  ['Excedente', fmtMXN(b.excedente)],
                  ['Tasa marginal', fmtPct(b.marginal_pct)],
                  ['Tasa efectiva', fmtPct(b.tasa_efectiva_pct)],
                ] : []} accent={V4.theme} />
            )}
            {closing && (
              <ResultCard eyebrow="Total de cierre" value={fmtMXN(closing.total)} sub="ISAI + notario + registro + avalúo + gestorías + IVA"
                lines={[
                  ['ISAI', fmtMXN(closing.isai)],
                  ['Notario', fmtMXN(closing.notario_fees)],
                  ['Registro (RPP)', fmtMXN(closing.registro)],
                  ['Avalúo', fmtMXN(closing.avaluo)],
                  ['Gestorías', fmtMXN(closing.gestorias)],
                  ['IVA', fmtMXN(closing.iva)],
                  closing.hipoteca && closing.hipoteca.aplica && ['Constitución de hipoteca', fmtMXN(closing.hipoteca.total)],
                ]} accent={V4.ink} />
            )}
          </div>

          {b && (
            <div style={{ ...cardV4 }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: V4.ink, marginBottom: 4 }}>Cómo se calcula el ISAI</div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink2, marginBottom: 6 }}>Tarifa progresiva por tramos (Gaceta CDMX 2026).</div>
              <div>
                <BreakdownRow k="Precio de venta" v={fmtMXN(b.precio_venta)} />
                <BreakdownRow k="Valor catastral" v={fmtMXN(b.valor_catastral)} />
                <BreakdownRow k="Base gravable" v={`${fmtMXN(isai.base)} · ${b.base_usada === 'valor_catastral' ? 'valor catastral' : 'precio'}`} />
                <BreakdownRow k="Tramo aplicable" v={enAdelante ? `${fmtMXN(b.limite_inferior)} en adelante` : `${fmtMXN(b.limite_inferior)} – ${fmtMXN(b.limite_superior)}`} />
                <BreakdownRow k="Cuota fija" v={fmtMXN(b.cuota_fija)} />
                <BreakdownRow k="Excedente sobre límite inferior" v={fmtMXN(b.excedente)} />
                <BreakdownRow k="Tasa marginal" v={fmtPct(b.marginal_pct)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '13px 0 2px', marginTop: 4, borderTop: `2px solid ${V4.ink}` }}>
                  <span style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink2 }}>{fmtMXN(b.cuota_fija)} + ({fmtMXN(b.excedente)} × {fmtPct(b.marginal_pct)})</span>
                  <span style={{ fontFamily: HEAD, fontSize: 18, fontWeight: 800, color: V4.theme }}>{fmtMXN(isai.isai)}</span>
                </div>
                <BreakdownRow k="Tasa efectiva sobre la base" v={fmtPct(b.tasa_efectiva_pct)} />
              </div>
            </div>
          )}
          <Disclaimer>Cálculo referencial con los motores fiscales de DesarrollosMX. No reemplaza la asesoría fiscal ni el avalúo/cálculo notarial definitivo.</Disclaimer>
        </div>
      )}
      <style>{`@media(max-width:640px){ .isaiv4-grid{ grid-template-columns:1fr !important; } .isaiv4-cards{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

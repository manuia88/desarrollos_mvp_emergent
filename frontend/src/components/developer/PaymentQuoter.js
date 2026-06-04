/**
 * PaymentQuoter — cotizador flexible + comparador de esquemas para una unidad.
 * - Comparador: cada esquema configurado (precio final · $/mes · ahorro) [servidor].
 * - Cotizador no-fijo: slider de enganche libre → descuento interpolado [servidor].
 */
import React, { useEffect, useState, useCallback } from 'react';
import { paymentQuote } from '../../api/developer';
import { X } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const fmtMXN = (v) => v == null ? '—' : `$${Number(v).toLocaleString('es-MX')}`;

export default function PaymentQuoter({ devId, schemes, units, onClose }) {
  const withPrice = (units || []).filter(u => u.price > 0);
  const [unitId, setUnitId] = useState(withPrice[0]?.id || '');
  const unit = withPrice.find(u => u.id === unitId) || withPrice[0];
  const base = unit?.price || 0;

  const [compare, setCompare] = useState([]);
  const [loadingCmp, setLoadingCmp] = useState(false);
  const [enganche, setEnganche] = useState(20);
  const [escritura, setEscritura] = useState(70);
  const [meses, setMeses] = useState('');
  const [quote, setQuote] = useState(null);

  // Comparador: una llamada por esquema (al abrir / cambiar unidad).
  useEffect(() => {
    if (!base || !schemes?.length) { setCompare([]); return; }
    let cancel = false;
    setLoadingCmp(true);
    Promise.all(schemes.map(s =>
      paymentQuote(devId, { precio_base: base, scheme_id: s.id })
        .then(r => ({ scheme: s, bd: r.breakdown }))
        .catch(() => null)
    )).then(rows => { if (!cancel) { setCompare(rows.filter(Boolean)); setLoadingCmp(false); } });
    return () => { cancel = true; };
  }, [devId, base, schemes]);

  // Cotizador: enganche/escritura/meses libres → desglose (debounced).
  const runQuote = useCallback((eng, escr, mss) => {
    if (!base) return;
    const body = { precio_base: base, enganche_pct: eng, escritura_pct: escr };
    if (mss !== '' && mss != null) body.meses = +mss;
    paymentQuote(devId, body).then(r => setQuote(r.breakdown)).catch(() => setQuote(null));
  }, [devId, base]);

  useEffect(() => {
    const t = setTimeout(() => runQuote(enganche, escritura, meses), 220);
    return () => clearTimeout(t);
  }, [enganche, escritura, meses, runQuote]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL,
      background: 'rgba(var(--bg-rgb),0.78)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} data-testid="payment-quoter" style={{
        width: 'min(720px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 22,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 18, fontWeight: 800, color: 'var(--cream)' }}>
            Cotizador de formas de pago
          </h3>
          <button onClick={onClose} style={{ background: 'rgba(var(--cream-rgb),0.08)', border: 'none', color: 'var(--cream)', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>

        {/* Unidad */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream-2)' }}>Unidad:</span>
          <select value={unitId} onChange={e => setUnitId(e.target.value)}
            style={{ background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 8, color: 'var(--cream)', fontSize: 13, padding: '7px 10px' }}>
            {withPrice.map(u => <option key={u.id} value={u.id} style={{ background: '#fff', color: 'var(--cream)' }}>{u.unit_number} · {fmtMXN(u.price)}</option>)}
          </select>
        </div>

        {!base ? (
          <div style={{ color: 'var(--cream-3)', fontSize: 13 }}>No hay unidades con precio para cotizar.</div>
        ) : (
          <>
            {/* Comparador */}
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--theme)', marginBottom: 8 }}>
              Comparar formas configuradas
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'rgba(var(--cream-rgb),0.06)' }}>
                    {['Forma', 'Enganche', 'Precio final', 'Mensualidad', 'Ahorro'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: 'var(--cream-2)', textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingCmp && <tr><td colSpan={5} style={{ padding: 16, color: 'var(--cream-3)' }}>Calculando…</td></tr>}
                  {!loadingCmp && compare.map(({ scheme, bd }) => (
                    <tr key={scheme.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--cream)', fontWeight: 600 }}>{scheme.nombre}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--cream-2)' }}>{bd.firma_pct}%</td>
                      <td style={{ padding: '8px 12px', color: 'var(--cream)', fontWeight: 700 }}>{fmtMXN(bd.precio_aplicado)}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--cream-2)' }}>
                        {bd.mensualidades_total > 0 ? (bd.meses ? `${fmtMXN(bd.mensualidad)}/mes × ${bd.meses}` : `${fmtMXN(bd.mensualidades_total)}`) : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: bd.ahorro > 0 ? '#22c55e' : 'var(--cream-3)', fontWeight: 600 }}>
                        {bd.ahorro > 0 ? fmtMXN(bd.ahorro) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cotizador no-fijo */}
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--theme)', marginBottom: 8 }}>
              Cotizador a la medida
            </div>
            <div style={{ background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.2)', borderRadius: 12, padding: 16 }}>
              {/* Enganche */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>Enganche</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit' }}>{enganche}%</span>
              </div>
              <input type="range" min={5} max={50} step={1} value={enganche}
                onChange={e => setEnganche(+e.target.value)}
                data-testid="quoter-enganche"
                style={{ width: '100%', accentColor: 'var(--theme)', colorScheme: 'light' }} />

              {/* Al escriturar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 6px' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>Al escriturar</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit' }}>{escritura}%</span>
              </div>
              <input type="range" min={0} max={Math.max(0, 100 - enganche)} step={1} value={Math.min(escritura, 100 - enganche)}
                onChange={e => setEscritura(+e.target.value)}
                style={{ width: '100%', accentColor: 'var(--theme)', colorScheme: 'light' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--cream-2)' }}>
                  Mensualidades: <strong style={{ color: 'var(--cream)' }}>{Math.max(0, 100 - enganche - Math.min(escritura, 100 - enganche))}%</strong>
                </span>
                <label style={{ fontSize: 12, color: 'var(--cream-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Meses
                  <input type="number" min={1} value={meses} placeholder="auto"
                    onChange={e => setMeses(e.target.value)}
                    style={{ width: 70, background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.28)', borderRadius: 6, color: 'var(--cream)', fontSize: 12, padding: '3px 6px' }} />
                </label>
              </div>

              {quote && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginTop: 14 }}>
                  <QField label="Precio final" value={fmtMXN(quote.precio_aplicado)} strong
                    hint={quote.ahorro > 0 ? `ahorra ${fmtMXN(quote.ahorro)}` : null} />
                  <QField label="Al firmar" value={fmtMXN(quote.firma)} hint={`${quote.firma_pct}%`} />
                  <QField label="Mensualidad"
                    value={quote.mensualidades_total > 0 ? (quote.meses ? `${fmtMXN(quote.mensualidad)}/mes` : fmtMXN(quote.mensualidades_total)) : '—'}
                    hint={quote.meses && quote.mensualidades_total > 0
                      ? `× ${quote.meses} meses${quote.meses_transcurridos != null ? ` · restan ${quote.meses_restantes}` : ''}`
                      : null} />
                  <QField label="Al escriturar" value={fmtMXN(quote.escrituracion)} hint={`${quote.escritura_pct}%`} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function QField({ label, value, hint, strong }) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 10, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--cream-2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: strong ? 17 : 14, fontWeight: strong ? 800 : 600, color: 'var(--cream)', fontFamily: 'Outfit' }}>{value}</div>
      {hint && <div style={{ fontSize: 10.5, color: strong ? '#15803d' : 'var(--cream-2)', marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

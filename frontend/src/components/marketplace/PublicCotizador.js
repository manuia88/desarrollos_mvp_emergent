// B2.2 · Cotizador público — formas de pago que configuró el desarrollador.
// El comprador elige un plan y ve enganche / mensualidades / escritura / precio con descuento.
// Cálculo 100% client-side con la fórmula oficial (utils/paymentSchemes.breakdown).
// Fail-open: sin formas_pago, no renderiza nada.
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { breakdown } from '../../utils/paymentSchemes';
import { sendBuyerSignal } from '../../lib/buyerSignal';

const mxn = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
};

// "2027-10" → mes/año en español. Para los meses del plan usamos hoy → fecha de entrega.
function currentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function Row({ label, value, hint, strong, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontFamily: 'DM Sans', fontWeight: strong ? 700 : 500, fontSize: strong ? 15 : 13.5, color: 'var(--cream)' }}>{label}</div>
        {hint && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: strong ? 800 : 700, fontSize: strong ? 20 : 15,
        color: tone || (strong ? 'var(--cream)' : 'var(--cream-2)'), whiteSpace: 'nowrap',
      }}>{value}</div>
    </div>
  );
}

export default function PublicCotizador({ formasPago, basePrice, fechaInicio, fechaEntrega, devId, colonia }) {
  const schemes = Array.isArray(formasPago) ? formasPago : [];
  const [idx, setIdx] = useState(0);
  const base = Number(basePrice) || 0;

  const selected = schemes[idx] || null;
  // Calendario REAL del desarrollador (inicio de ventas → entrega); cae a hoy si no lo configuró.
  const fIni = useMemo(() => (fechaInicio ? String(fechaInicio).slice(0, 7) : currentYM()), [fechaInicio]);

  const bd = useMemo(() => {
    if (!selected || !base) return null;
    return breakdown(base, selected, fIni, fechaEntrega);
  }, [selected, base, fIni, fechaEntrega]);

  // Captura la EXPLORACIÓN financiera (antes invisible): qué esquema/enganche/mensualidad explora el comprador.
  const fired = useRef(new Set());
  useEffect(() => {
    if (!bd || !selected) return;
    const k = `${devId || ''}|${idx}`;
    if (fired.current.has(k)) return;
    fired.current.add(k);
    try {
      sendBuyerSignal('payment_explore', {
        entity_id: devId, colonia, value: String(selected.nombre || selected.label || idx),
        meta: { esquema: selected.nombre || selected.label, enganche_pct: bd.firma_pct, mensualidad: bd.mensualidad, meses: bd.meses, precio: base },
      });
    } catch (_) { /* noop */ }
  }, [bd, selected, idx, devId, colonia, base]);

  if (!schemes.length || !base) return null;

  return (
    <section data-testid="public-cotizador" style={{
      marginTop: 20, background: 'rgba(var(--cream-rgb),0.03)',
      border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px',
    }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: 0 }}>Calcula tu plan de pago</h3>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginTop: 4 }}>
          Elige cómo te gustaría pagar. Precios desde {mxn(base)}.
        </div>
      </div>

      {/* Selector de plan */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {schemes.map((s, i) => {
          const active = i === idx;
          const desc = Number(s.descuento_pct) || 0;
          return (
            <button key={i} data-testid={`plan-${i}`} onClick={() => setIdx(i)} style={{
              padding: '10px 16px', borderRadius: 12, cursor: 'pointer',
              background: active ? 'var(--grad)' : 'rgba(var(--cream-rgb),0.03)',
              border: active ? 'none' : '1px solid var(--border)',
              color: active ? '#fff' : 'var(--cream-2)',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
            }}>
              <span>{s.nombre || `Plan ${i + 1}`}</span>
              {desc > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: active ? 'rgba(255,255,255,0.9)' : '#86efac' }}>
                  −{desc}% de descuento
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Desglose */}
      {bd && (
        <div data-testid="cotizador-breakdown">
          {bd.descuento_pct > 0 && (
            <Row label="Precio de lista" value={mxn(bd.precio_base)} tone="var(--cream-3)" />
          )}
          <Row
            label="Precio con tu plan"
            value={mxn(bd.precio_aplicado)}
            hint={bd.ahorro > 0 ? `Ahorras ${mxn(bd.ahorro)}` : 'Precio de lista'}
            strong tone="var(--cream)"
          />
          <Row label="Apartado" value={mxn(bd.apartado)} hint="Para reservar tu unidad" />
          <Row label={`Enganche (${bd.firma_pct}%)`} value={mxn(bd.firma)} hint="A la firma del contrato" />
          <Row
            label={`Mensualidades (${bd.mensualidades_pct}%)`}
            value={bd.meses ? `${mxn(bd.mensualidad)} / mes` : mxn(bd.mensualidades_total)}
            hint={bd.meses ? `${bd.meses} mensualidades hasta la entrega · ${mxn(bd.mensualidades_total)} en total` : 'Durante la obra'}
          />
          <Row label={`Escrituración (${bd.escritura_pct}%)`} value={mxn(bd.escrituracion)} hint="Al recibir tu unidad" />

          {/* Cierra el ciclo: el comprador expresa interés en ESTE plan → lead con el plan que eligió */}
          <button
            type="button"
            data-testid="cotizador-interes-btn"
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent('lead_capture_trigger', {
                  detail: {
                    audience: 'investor',
                    intent: {
                      tipo: 'cotizador',
                      plan: selected?.nombre || `Plan ${idx + 1}`,
                      precio: bd.precio_aplicado,
                      enganche_pct: bd.firma_pct,
                      descuento_pct: bd.descuento_pct || 0,
                    },
                  },
                }));
              } catch { /* noop */ }
            }}
            style={{
              marginTop: 16, width: '100%', padding: '13px 0', borderRadius: 12,
              background: 'var(--grad)', border: 'none', color: '#fff', cursor: 'pointer',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
            }}
          >
            Me interesa este plan · hablar con un asesor
          </button>

          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.5 }}>
              Estimación informativa con base en las formas de pago del desarrollador
              {fechaEntrega ? ` y la entrega estimada (${fechaEntrega}).` : '.'} El plan final se firma con tu asesor.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

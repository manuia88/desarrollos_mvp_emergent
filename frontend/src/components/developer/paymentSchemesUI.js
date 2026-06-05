/**
 * paymentSchemesUI — tarjeta de forma de pago compartida (ficha PaymentSchemesConfig ↔ wizard Step Pagos).
 * Presentacional puro sobre estado local: recibe el esquema + callbacks, no llama API.
 * Extraído de PaymentSchemesConfig para no duplicar (B1.4).
 */
import React from 'react';
import { schemeSum, schemeSumOk, breakdown } from '../../utils/paymentSchemes';

export const fmtMXN = (v) => v == null ? '—' : `$${Number(v).toLocaleString('es-MX')}`;

const lbl = { fontSize: 10, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', display: 'block', marginBottom: 5 };
const inp = {
  width: '100%', background: '#fff', border: '1px solid var(--border)',
  borderRadius: 9, color: 'var(--cream)', fontSize: 13, padding: '8px 10px',
  fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box',
};

export function NumField({ label, value, onChange, suffix, step = 1, min = 0 }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input type="number" value={value} step={step} min={min}
          onChange={e => onChange(e.target.value)} style={inp} />
        {suffix && <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 12, color: 'var(--cream-3)', fontWeight: 700 }}>{suffix}</span>}
      </div>
    </div>
  );
}

/** Tarjeta editable de una forma de pago + preview en vivo. */
export function SchemeCard({ scheme: s, index: i, sample, fIni, fEnt, onUpdate, onRemove }) {
  const sum = schemeSum(s);
  const ok = schemeSumOk(s);
  const bd = breakdown(sample, s, fIni, fEnt);
  return (
    <div data-testid={`scheme-card-${i}`} className="dmx-card" style={{
      background: '#fff', border: `1.5px solid ${ok ? 'var(--border)' : '#F2635B'}`,
      borderRadius: 14, padding: 16,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, fontFamily: 'Outfit' }}>{i + 1}</span>
        <input value={s.nombre} onChange={e => onUpdate(i, 'nombre', e.target.value)}
          placeholder={`Forma ${i + 1} (ej: Contado, Enganche 30%)`}
          style={{ ...inp, flex: 1, fontWeight: 700, fontSize: 14 }} />
        <button onClick={() => onRemove(i)} title="Quitar"
          style={{ background: '#fff', border: '1px solid var(--border)', color: '#DC2626', borderRadius: 9, padding: '7px 13px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          Quitar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 11 }}>
        <NumField label="Firma / enganche" value={s.firma_pct} suffix="%" onChange={v => onUpdate(i, 'firma_pct', v)} />
        <NumField label="Mensualidades" value={s.mensualidades_pct} suffix="%" onChange={v => onUpdate(i, 'mensualidades_pct', v)} />
        <NumField label="Al escriturar" value={s.escritura_pct} suffix="%" onChange={v => onUpdate(i, 'escritura_pct', v)} />
        <NumField label="Descuento de precio" value={s.descuento_pct} suffix="%" onChange={v => onUpdate(i, 'descuento_pct', v)} />
        <NumField label="Apartado" value={s.apartado_mxn} suffix="$" step={1000} onChange={v => onUpdate(i, 'apartado_mxn', v)} />
        <NumField label="Meses (opcional)" value={s.meses_override ?? ''} onChange={v => onUpdate(i, 'meses_override', v)} />
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <span style={{
          fontSize: 11, fontWeight: 800, padding: '4px 11px', borderRadius: 999,
          background: ok ? 'rgba(31,160,106,0.12)' : 'rgba(242,99,91,0.12)',
          color: ok ? '#15803d' : '#DC2626',
        }}>
          Suma {sum}% {ok ? '✓' : '· debe ser 100%'}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--cream-2)' }}>
          Precio: <b style={{ color: 'var(--cream)' }}>{fmtMXN(bd.precio_aplicado)}</b>
          {bd.ahorro > 0 && <span style={{ color: '#15803d', fontWeight: 700 }}> (ahorra {fmtMXN(bd.ahorro)})</span>}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>
          Firma {fmtMXN(bd.firma)} · {bd.mensualidades_total > 0
            ? <>{bd.meses
                ? `${fmtMXN(bd.mensualidad)}/mes × ${bd.meses}${bd.meses_transcurridos != null ? ` (restan ${bd.meses_restantes})` : ''}`
                : `${fmtMXN(bd.mensualidades_total)} (define meses)`}</>
            : 'sin mensualidades'} · Escritura {fmtMXN(bd.escrituracion)}
        </span>
      </div>
    </div>
  );
}

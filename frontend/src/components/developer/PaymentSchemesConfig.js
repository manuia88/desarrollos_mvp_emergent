/**
 * PaymentSchemesConfig — configura hasta 5 formas de pago por proyecto.
 * Lógica R3: firma% + mensualidades% + escritura% = 100; a mayor enganche, menor
 * precio. Mensualidades ÷ meses (auto de fechas obra→entrega, con override).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { getPaymentSchemes, putPaymentSchemes } from '../../api/developer';
import {
  SCHEME_MAX, schemeSum, schemeSumOk, breakdown, autoMonths, emptyScheme,
} from '../../utils/paymentSchemes';
import { Z } from '../../styles/zIndex';

const fmtMXN = (v) => v == null ? '—' : `$${Number(v).toLocaleString('es-MX')}`;

const lbl = { fontSize: 10, color: 'var(--cream-3)', fontWeight: 600, display: 'block', marginBottom: 3 };
const inp = {
  width: '100%', background: 'rgba(var(--bg-rgb),0.5)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--cream)', fontSize: 13, padding: '7px 9px',
  fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box',
};

function NumField({ label, value, onChange, suffix, step = 1, min = 0 }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input type="number" value={value} step={step} min={min}
          onChange={e => onChange(e.target.value)} style={inp} />
        {suffix && <span style={{ position: 'absolute', right: 9, top: 8, fontSize: 12, color: 'var(--cream-3)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

export default function PaymentSchemesConfig({ devId }) {
  const [schemes, setSchemes] = useState([]);
  const [fIni, setFIni] = useState('');
  const [fEnt, setFEnt] = useState('');
  const [sample, setSample] = useState(1000000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getPaymentSchemes(devId);
      setSchemes(d.schemes || []);
      setFIni(d.fecha_inicio ? String(d.fecha_inicio).slice(0, 10) : '');
      setFEnt(d.fecha_entrega ? String(d.fecha_entrega).slice(0, 10) : '');
    } catch (e) {
      setToast({ type: 'error', msg: 'No se pudieron cargar las formas de pago' });
    } finally { setLoading(false); }
  }, [devId]);

  useEffect(() => { load(); }, [load]);

  const mesesAuto = autoMonths(fIni, fEnt);

  const update = (i, key, val) => setSchemes(s => s.map((x, j) => j === i ? { ...x, [key]: val } : x));
  const remove = (i) => setSchemes(s => s.filter((_, j) => j !== i));
  const add = () => setSchemes(s => s.length < SCHEME_MAX ? [...s, emptyScheme()] : s);

  const allValid = schemes.length > 0 && schemes.every(s => (s.nombre || '').trim() && schemeSumOk(s));

  const save = async () => {
    if (!allValid) { setToast({ type: 'error', msg: 'Revisa: cada forma necesita nombre y sumar 100%' }); return; }
    setSaving(true);
    try {
      await putPaymentSchemes(devId, { schemes, fecha_inicio: fIni || null, fecha_entrega: fEnt || null });
      setToast({ type: 'ok', msg: 'Formas de pago guardadas' });
      setTimeout(() => setToast(null), 2600);
    } catch (e) {
      setToast({ type: 'error', msg: e.body?.detail || 'Error al guardar' });
    } finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 30, color: 'var(--cream-3)', fontSize: 13 }}>Cargando formas de pago…</div>;

  return (
    <div data-testid="payment-schemes-config">
      {/* Intro */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontFamily: 'Outfit', fontSize: 17, fontWeight: 700, color: 'var(--cream)' }}>
          Formas de pago
        </h3>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5, maxWidth: 640 }}>
          Define hasta {SCHEME_MAX} formas de pago. Cada una reparte el precio en <strong>firma</strong> (enganche),
          <strong> mensualidades</strong> y <strong>escrituración</strong> (deben sumar 100%). A mayor enganche puedes
          dar un <strong>descuento</strong>. El comprador verá el precio cambiar según la forma que elija.
        </p>
      </div>

      {/* Fechas para mensualidades */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16,
        padding: 12, background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)', borderRadius: 10,
      }}>
        <div style={{ flex: '1 1 160px' }}>
          <label style={lbl}>Inicio de obra</label>
          <input type="date" value={fIni} onChange={e => setFIni(e.target.value)} style={inp} />
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={lbl}>Entrega estimada</label>
          <input type="date" value={fEnt} onChange={e => setFEnt(e.target.value)} style={inp} />
        </div>
        <div style={{ flex: '1 1 160px', fontSize: 12, color: 'var(--cream-2)' }}>
          {mesesAuto
            ? <>Plazo de mensualidades: <strong style={{ color: 'var(--cream)' }}>{mesesAuto} meses</strong></>
            : <span style={{ color: 'var(--amber)' }}>Completa las fechas para calcular los meses</span>}
        </div>
      </div>

      {/* Precio de ejemplo para el preview */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 12, color: 'var(--cream-3)' }}>
        <span>Ver con un precio de ejemplo:</span>
        <input type="number" value={sample} step={100000} min={0}
          onChange={e => setSample(+e.target.value)}
          style={{ ...inp, width: 160 }} />
      </div>

      {/* Esquemas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {schemes.map((s, i) => {
          const sum = schemeSum(s);
          const ok = schemeSumOk(s);
          const bd = breakdown(sample, s, fIni, fEnt);
          return (
            <div key={s.id || i} data-testid={`scheme-card-${i}`} style={{
              border: `1px solid ${ok ? 'var(--border)' : 'rgba(239,68,68,0.4)'}`,
              borderRadius: 12, padding: 14, background: 'rgba(var(--cream-rgb),0.02)',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <input value={s.nombre} onChange={e => update(i, 'nombre', e.target.value)}
                  placeholder={`Forma ${i + 1} (ej: Contado, Enganche 30%)`}
                  style={{ ...inp, flex: 1, fontWeight: 600 }} />
                <button onClick={() => remove(i)} title="Quitar"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>
                  Quitar
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
                <NumField label="Firma / enganche" value={s.firma_pct} suffix="%" onChange={v => update(i, 'firma_pct', v)} />
                <NumField label="Mensualidades" value={s.mensualidades_pct} suffix="%" onChange={v => update(i, 'mensualidades_pct', v)} />
                <NumField label="Al escriturar" value={s.escritura_pct} suffix="%" onChange={v => update(i, 'escritura_pct', v)} />
                <NumField label="Descuento de precio" value={s.descuento_pct} suffix="%" onChange={v => update(i, 'descuento_pct', v)} />
                <NumField label="Apartado" value={s.apartado_mxn} suffix="$" step={1000} onChange={v => update(i, 'apartado_mxn', v)} />
                <NumField label="Meses (opcional)" value={s.meses_override ?? ''} onChange={v => update(i, 'meses_override', v)} />
              </div>

              {/* Suma + preview */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 9999,
                  background: ok ? 'rgba(21,128,61,0.97)' : 'rgba(239,68,68,0.14)',
                  color: ok ? '#22c55e' : 'var(--red)',
                }}>
                  Suma {sum}% {ok ? '✓' : '· debe ser 100%'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--cream-2)' }}>
                  Precio: <strong style={{ color: 'var(--cream)' }}>{fmtMXN(bd.precio_aplicado)}</strong>
                  {bd.ahorro > 0 && <span style={{ color: '#22c55e' }}> (ahorra {fmtMXN(bd.ahorro)})</span>}
                </span>
                <span style={{ fontSize: 12, color: 'var(--cream-3)' }}>
                  Firma {fmtMXN(bd.firma)} · {bd.mensualidades_total > 0
                    ? <>{bd.meses
                        ? `${fmtMXN(bd.mensualidad)}/mes × ${bd.meses}${bd.meses_transcurridos != null ? ` (restan ${bd.meses_restantes})` : ''}`
                        : `${fmtMXN(bd.mensualidades_total)} (define meses)`}</>
                    : 'sin mensualidades'} · Escritura {fmtMXN(bd.escrituracion)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
        {schemes.length < SCHEME_MAX && (
          <button onClick={add} data-testid="scheme-add"
            style={{ background: 'rgba(var(--cream-rgb),0.06)', border: '1px solid var(--border)', color: 'var(--cream-2)', borderRadius: 9999, padding: '9px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
            + Agregar forma de pago
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={save} disabled={saving || !allValid} data-testid="scheme-save"
          style={{
            background: (saving || !allValid) ? 'rgba(148,163,184,0.25)' : 'var(--grad)',
            border: 'none', color: '#fff', borderRadius: 9999, padding: '9px 20px',
            cursor: (saving || !allValid) ? 'not-allowed' : 'pointer', fontSize: 12.5, fontWeight: 700,
          }}>
          {saving ? 'Guardando…' : 'Guardar formas de pago'}
        </button>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: Z.STICKY,
          padding: '12px 18px', borderRadius: 14,
          background: toast.type === 'ok' ? 'rgba(21,128,61,0.97)' : 'rgba(185,28,28,0.97)',
          border: `1px solid ${toast.type === 'ok' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.type === 'ok' ? '#86efac' : '#fca5a5', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

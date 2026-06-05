/**
 * PaymentSchemesConfig — configura hasta 5 formas de pago por proyecto.
 * Lógica R3: firma% + mensualidades% + escritura% = 100; a mayor enganche, menor
 * precio. Mensualidades ÷ meses (auto de fechas obra→entrega, con override).
 * Estilo alineado a los cockpits: tarjetas blancas, inputs limpios, chips con tinte.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { getPaymentSchemes, putPaymentSchemes } from '../../api/developer';
import {
  SCHEME_MAX, schemeSumOk, autoMonths, emptyScheme,
} from '../../utils/paymentSchemes';
import { SchemeCard } from './paymentSchemesUI';
import { Z } from '../../styles/zIndex';

const lbl = { fontSize: 10, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', display: 'block', marginBottom: 5 };
const inp = {
  width: '100%', background: '#fff', border: '1px solid var(--border)',
  borderRadius: 9, color: 'var(--cream)', fontSize: 13, padding: '8px 10px',
  fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box',
};
const gradBtn = { background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', border: 'none', color: '#fff', borderRadius: 10, padding: '9px 20px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
const ghostBtn = { background: '#fff', border: '1px solid var(--border)', color: 'var(--cream-2)', borderRadius: 10, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };

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
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 4px', fontFamily: 'Outfit', fontSize: 17.5, fontWeight: 800, color: 'var(--cream)' }}>
          Formas de pago
        </h3>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5, maxWidth: 660 }}>
          Define hasta {SCHEME_MAX} formas de pago. Cada una reparte el precio en <b>firma</b> (enganche),
          <b> mensualidades</b> y <b>escrituración</b> (deben sumar 100%). A mayor enganche puedes
          dar un <b>descuento</b>. El comprador verá el precio cambiar según la forma que elija.
        </p>
      </div>

      {/* Fechas + precio de ejemplo */}
      <div className="dmx-card" style={{ background: '#fff', padding: 14, marginBottom: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 160px' }}>
          <label style={lbl}>Inicio de obra</label>
          <input type="date" value={fIni} onChange={e => setFIni(e.target.value)} style={inp} />
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={lbl}>Entrega estimada</label>
          <input type="date" value={fEnt} onChange={e => setFEnt(e.target.value)} style={inp} />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label style={lbl}>Ver con precio de ejemplo</label>
          <input type="number" value={sample} step={100000} min={0} onChange={e => setSample(+e.target.value)} style={inp} />
        </div>
        <div style={{ flex: '1 1 150px', fontSize: 12, color: 'var(--cream-2)', paddingBottom: 9 }}>
          {mesesAuto
            ? <>Plazo de mensualidades: <span style={{ fontWeight: 800, color: 'var(--theme)' }}>{mesesAuto} meses</span></>
            : <span style={{ color: 'var(--warm, #E2982E)' }}>Completa las fechas para calcular los meses</span>}
        </div>
      </div>

      {/* Esquemas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {schemes.map((s, i) => (
          <SchemeCard key={s.id || i} scheme={s} index={i} sample={sample}
            fIni={fIni} fEnt={fEnt} onUpdate={update} onRemove={remove} />
        ))}
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
        {schemes.length < SCHEME_MAX && (
          <button onClick={add} data-testid="scheme-add" style={ghostBtn}>+ Agregar forma de pago</button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={save} disabled={saving || !allValid} data-testid="scheme-save"
          style={{ ...gradBtn, ...(saving || !allValid ? { background: 'rgba(var(--cream-rgb),0.18)', color: 'var(--cream-3)', cursor: 'not-allowed' } : {}) }}>
          {saving ? 'Guardando…' : 'Guardar formas de pago'}
        </button>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: Z.STICKY,
          padding: '12px 18px', borderRadius: 12,
          background: toast.type === 'ok' ? '#1E2230' : '#B91C1C',
          color: '#fff', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

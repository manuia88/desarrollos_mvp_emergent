/**
 * PaymentQuoter — cotizador flexible + comparador EDITABLE de esquemas para una unidad.
 * - Comparador: cada forma configurada es editable click-to-edit (nombre, enganche, escritura,
 *   descuento). Mensualidades se calcula solo (100 − enganche − escritura). Guarda al instante.
 * - "+ Agregar forma": crea una forma nueva editable (hasta 5).
 * - Cotizador no-fijo: enganche/escritura/meses libres → desglose [servidor]. Botón
 *   "Guardar como forma de pago" convierte la cotización en una forma configurada.
 * - Meses: se calculan solos del calendario de obra (inicio → entrega).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { paymentQuote, getPaymentSchemes, putPaymentSchemes, quotePdf, ASSET_BASE } from '../../api/developer';
import { X, Plus, Trash, Check, Download } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const MAX_SCHEMES = 5;
const fmtMXN = (v) => v == null ? '—' : `$${Number(v).toLocaleString('es-MX')}`;
const waOpen = (text) => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');

// Logo oficial de WhatsApp (glifo monocromo, usa currentColor).
const WaLogo = ({ size = 15 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.511 5.26l-.999 3.648 3.736-.979.241.272zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
  </svg>
);

// Porcentaje click-to-edit (cotizador a la medida).
function PctField({ label, value, color, onSave, testid }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const start = () => { setV(value); setEditing(true); };
  const finish = () => { setEditing(false); const nv = Math.max(0, Math.min(100, +v || 0)); if (nv !== value) onSave(nv); };
  return (
    <div style={{ flex: 1, minWidth: 110, background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.14)', borderRadius: 10, padding: '9px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      {editing ? (
        <input autoFocus type="number" data-testid={testid} value={v} onChange={e => setV(e.target.value)} onBlur={finish}
          onKeyDown={e => { if (e.key === 'Enter') finish(); if (e.key === 'Escape') setEditing(false); }}
          style={{ width: 74, fontSize: 18, fontWeight: 800, fontFamily: 'Outfit', color: 'var(--cream)', border: `1px solid ${color}`, borderRadius: 6, padding: '2px 6px' }} />
      ) : (
        <div data-testid={testid} onClick={start} title="Toca para editar"
          style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit', color: 'var(--cream)', cursor: 'pointer', borderBottom: `1px dashed ${color}99`, display: 'inline-block', lineHeight: 1.15 }}>{value}%</div>
      )}
    </div>
  );
}

// Meses entre inicio de obra y entrega (yyyy-mm), espejo de auto_months del backend.
function computeMonths(fi, fe) {
  if (!fi || !fe) return null;
  const [ay, am] = String(fi).split('-').map(Number);
  const [by, bm] = String(fe).split('-').map(Number);
  if (!ay || !by) return null;
  return Math.max(1, (by - ay) * 12 + (bm - am));
}
const dateInp = { background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 6, color: 'var(--cream)', fontSize: 11.5, padding: '2px 6px', colorScheme: 'light' };

// Desglose local instantáneo (espejo de compute_breakdown del backend, para feedback inmediato).
function localBreakdown(base, s, meses) {
  const desc = Math.max(0, Math.min(100, +s.descuento_pct || 0));
  const firma = Math.max(0, Math.min(100, +s.firma_pct || 0));
  const escr = Math.max(0, Math.min(100 - firma, +s.escritura_pct || 0));
  const mens = Math.max(0, 100 - firma - escr);
  const precio = Math.round(base * (1 - desc / 100));
  const firmaM = Math.round(precio * firma / 100);
  const mensM = Math.round(precio * mens / 100);
  const escrM = precio - firmaM - mensM;
  const mensualidad = (meses && mensM) ? Math.round(mensM / meses) : 0;
  return { mensPct: mens, precio, firmaM, mensM, escrM, mensualidad, ahorro: Math.round(base) - precio };
}

export default function PaymentQuoter({ devId, schemes: initialSchemes, units, onClose, onSchemesSaved, initialScope = 'proyecto', initialUnitId = null }) {
  const withPrice = (units || []).filter(u => u.price > 0);
  const [scope, setScope] = useState(initialScope);         // 'proyecto' | 'unidad'
  const [unitId, setUnitId] = useState(initialUnitId || withPrice[0]?.id || '');
  const [precioRef, setPrecioRef] = useState('');           // precio de referencia (modo proyecto)
  const [cliente, setCliente] = useState('');
  const unit = withPrice.find(u => u.id === unitId) || withPrice[0];
  // Base: en 'unidad' el precio de la unidad; en 'proyecto' el precio de referencia (opcional).
  const base = scope === 'unidad' ? (unit?.price || 0) : (precioRef !== '' ? +precioRef : 0);

  const [schemes, setSchemes] = useState(initialSchemes || []);
  const [fechaInicio, setFechaInicio] = useState(null);
  const [fechaEntrega, setFechaEntrega] = useState(null);
  const [mesesAuto, setMesesAuto] = useState(null);
  const [savedId, setSavedId] = useState(null);   // flash ✓ en la fila recién guardada
  const [err, setErr] = useState('');

  const [enganche, setEnganche] = useState(20);
  const [escritura, setEscritura] = useState(70);
  const [meses, setMeses] = useState('');
  const [quote, setQuote] = useState(null);

  // Carga formas + calendario de obra (meses auto) al abrir.
  useEffect(() => {
    let cancel = false;
    getPaymentSchemes(devId).then(d => {
      if (cancel) return;
      if (Array.isArray(d.schemes)) setSchemes(d.schemes);
      setFechaInicio(d.fecha_inicio || null);
      setFechaEntrega(d.fecha_entrega || null);
      setMesesAuto(d.meses_auto || null);
    }).catch(() => {});
    return () => { cancel = true; };
  }, [devId]);

  // Persiste TODO el arreglo (el endpoint reemplaza). mens se deriva para sumar 100.
  const persist = useCallback(async (next, flashId) => {
    const clean = next.map(s => {
      const firma = Math.max(0, Math.min(100, +s.firma_pct || 0));
      const escr = Math.max(0, Math.min(100 - firma, +s.escritura_pct || 0));
      return { ...s, firma_pct: firma, escritura_pct: escr, mensualidades_pct: Math.max(0, 100 - firma - escr) };
    });
    setSchemes(clean);
    setErr('');
    try {
      await putPaymentSchemes(devId, { schemes: clean, fecha_inicio: fechaInicio, fecha_entrega: fechaEntrega });
      if (flashId) { setSavedId(flashId); setTimeout(() => setSavedId(null), 1100); }
      onSchemesSaved && onSchemesSaved();
    } catch (e) {
      setErr(e.body?.detail || 'No se pudo guardar. Revisa que los nombres no se repitan.');
    }
  }, [devId, fechaInicio, fechaEntrega, onSchemesSaved]);

  const editScheme = (id, field, value) => {
    const next = schemes.map(s => s.id === id ? { ...s, [field]: value } : s);
    persist(next, id);
  };
  const removeScheme = (id) => persist(schemes.filter(s => s.id !== id), null);

  // Guarda las fechas de obra → recalcula meses al instante (sin tocar las formas).
  const saveDates = (fi, fe) => {
    setFechaInicio(fi || null); setFechaEntrega(fe || null);
    setMesesAuto(computeMonths(fi, fe));
    putPaymentSchemes(devId, { schemes, fecha_inicio: fi || null, fecha_entrega: fe || null })
      .then(() => onSchemesSaved && onSchemesSaved()).catch(() => {});
  };
  const addScheme = () => {
    if (schemes.length >= MAX_SCHEMES) return;
    const n = schemes.length + 1;
    const nuevo = { id: `tmp_${n}_${schemes.length}`, nombre: `Forma ${n}`, firma_pct: 20, escritura_pct: 70, mensualidades_pct: 10, descuento_pct: 0, apartado_mxn: 0, meses_override: null };
    persist([...schemes, nuevo], nuevo.id);
  };

  // Guarda la cotización a la medida actual como una forma configurada.
  const saveCustomAsScheme = () => {
    if (schemes.length >= MAX_SCHEMES || !quote) return;
    const mensPct = Math.max(0, 100 - enganche - Math.min(escritura, 100 - enganche));
    const nuevo = {
      id: `tmp_custom_${schemes.length}`,
      nombre: `Personalizada (${enganche}%)`,
      firma_pct: enganche,
      escritura_pct: Math.min(escritura, 100 - enganche),
      mensualidades_pct: mensPct,
      descuento_pct: quote.descuento_pct || 0,
      apartado_mxn: 0,
      meses_override: meses !== '' ? +meses : null,
    };
    persist([...schemes, nuevo], nuevo.id);
  };

  // Cotizador: enganche/escritura/meses libres → desglose (debounced).
  const runQuote = useCallback((eng, escr, mss) => {
    if (!base) { setQuote(null); return; }
    const body = { precio_base: base, enganche_pct: eng, escritura_pct: escr };
    if (mss !== '' && mss != null) body.meses = +mss;
    paymentQuote(devId, body).then(r => setQuote(r.breakdown)).catch(() => setQuote(null));
  }, [devId, base]);

  useEffect(() => {
    const t = setTimeout(() => runQuote(enganche, escritura, meses), 220);
    return () => clearTimeout(t);
  }, [enganche, escritura, meses, runQuote]);

  // Cuerpos para el PDF/WhatsApp (proyecto general o por unidad).
  const baseBody = () => ({
    scope,
    unit_id: scope === 'unidad' ? unitId : null,
    unit_number: scope === 'unidad' ? (unit?.unit_number || null) : null,
    precio_base: base || null,
    cliente: cliente || null,
  });
  const formsBody = () => ({ ...baseBody(), mode: 'forms' });
  const customBody = () => ({ ...baseBody(), mode: 'custom', enganche_pct: enganche, escritura_pct: Math.min(escritura, 100 - enganche), meses: meses !== '' ? +meses : null });

  // Cotizador a la medida click-to-edit: enganche + mensualidades + escritura = 100.
  const mensPct = Math.max(0, 100 - enganche - escritura);
  const onEng = (v) => { const e = Math.max(0, Math.min(100, v)); setEnganche(e); if (e + escritura > 100) setEscritura(100 - e); };
  const onEscr = (v) => { setEscritura(Math.max(0, Math.min(100 - enganche, v))); };
  const onMens = (v) => { const m = Math.max(0, Math.min(100 - enganche, v)); setEscritura(100 - enganche - m); };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL,
      background: 'rgba(var(--bg-rgb),0.78)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} data-testid="payment-quoter" style={{
        width: 'min(820px, 96vw)', maxHeight: '92vh', overflowY: 'auto',
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

        {/* Alcance + cliente + calendario de obra */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'inline-flex', alignSelf: 'flex-start', background: 'rgba(var(--cream-rgb),0.06)', border: '1px solid rgba(var(--cream-rgb),0.14)', borderRadius: 9999, padding: 3 }}>
            {[['proyecto', 'Proyecto general'], ['unidad', 'Por unidad']].map(([k, lbl]) => (
              <button key={k} data-testid={`scope-${k}`} onClick={() => setScope(k)}
                style={{ background: scope === k ? 'var(--grad)' : 'transparent', color: scope === k ? '#fff' : 'var(--cream-2)', border: 'none', borderRadius: 9999, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {scope === 'unidad' ? (
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream-2)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                Unidad:
                <select value={unitId} onChange={e => setUnitId(e.target.value)}
                  style={{ background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 8, color: 'var(--cream)', fontSize: 13, padding: '7px 10px' }}>
                  {withPrice.map(u => <option key={u.id} value={u.id} style={{ background: '#fff', color: 'var(--cream)' }}>{u.unit_number} · {fmtMXN(u.price)}</option>)}
                </select>
              </label>
            ) : (
              <label style={{ fontSize: 12, color: 'var(--cream-2)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                Precio de referencia:
                <input type="number" value={precioRef} placeholder="opcional · ej. 14800000" onChange={e => setPrecioRef(e.target.value)}
                  style={{ width: 170, background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 8, color: 'var(--cream)', fontSize: 13, padding: '7px 10px' }} />
              </label>
            )}
            <label style={{ fontSize: 12, color: 'var(--cream-2)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              Cliente:
              <input value={cliente} placeholder="opcional" onChange={e => setCliente(e.target.value)}
                style={{ width: 150, background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 8, color: 'var(--cream)', fontSize: 13, padding: '7px 10px' }} />
            </label>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--cream-2)', background: 'rgba(var(--theme-rgb),0.07)', border: '1px solid rgba(var(--theme-rgb),0.2)', borderRadius: 9999, padding: '4px 11px' }}>
              📅 Obra:
              <input type="month" value={fechaInicio || ''} onChange={e => saveDates(e.target.value, fechaEntrega)} style={dateInp} title="Inicio de obra" />
              →
              <input type="month" value={fechaEntrega || ''} onChange={e => saveDates(fechaInicio, e.target.value)} style={dateInp} title="Entrega estimada" />
              {mesesAuto != null
                ? <strong style={{ color: 'var(--theme)' }}>= {mesesAuto} meses (auto)</strong>
                : <span style={{ color: 'var(--cream-3)' }}>pon ambas fechas para meses auto</span>}
            </span>
          </div>
        </div>

        {err && (
          <div style={{ background: 'rgba(185,28,28,0.10)', border: '1px solid rgba(185,28,28,0.3)', color: '#b91c1c', borderRadius: 9, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
            {err}
          </div>
        )}

        {(scope === 'unidad' && !unit) ? (
          <div style={{ color: 'var(--cream-3)', fontSize: 13 }}>No hay unidades con precio para cotizar.</div>
        ) : (
          <>
            {scope === 'proyecto' && !base && (
              <div style={{ color: 'var(--cream-3)', fontSize: 11.5, marginBottom: 10 }}>
                Mostrando las formas como porcentajes. Pon un precio de referencia para ver montos en pesos.
              </div>
            )}
            {/* Comparador EDITABLE */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--theme)' }}>
                Formas configuradas · toca un valor para editarlo
              </div>
              <button data-testid="add-scheme" onClick={addScheme} disabled={schemes.length >= MAX_SCHEMES}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: schemes.length >= MAX_SCHEMES ? 'rgba(var(--cream-rgb),0.08)' : 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.3)', color: schemes.length >= MAX_SCHEMES ? 'var(--cream-3)' : 'var(--theme)', borderRadius: 9999, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, cursor: schemes.length >= MAX_SCHEMES ? 'not-allowed' : 'pointer' }}>
                <Plus size={13} /> Agregar forma
              </button>
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 22 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 660 }}>
                <thead>
                  <tr style={{ background: 'rgba(var(--cream-rgb),0.06)' }}>
                    {['Forma', 'Enganche', 'Mensual.', 'Escritura', 'Descuento', 'Precio final', '$/mes', ''].map(h => (
                      <th key={h} style={{ textAlign: h === 'Forma' ? 'left' : 'center', padding: '8px 10px', fontSize: 9.5, color: 'var(--cream-2)', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schemes.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: 'var(--cream-3)', textAlign: 'center' }}>Sin formas. Agrega una con “+ Agregar forma”.</td></tr>}
                  {schemes.map(s => {
                    const bd = localBreakdown(base, s, mesesAuto);
                    const flash = savedId === s.id;
                    return (
                      <tr key={s.id} style={{ borderTop: '1px solid var(--border)', background: flash ? 'rgba(34,197,94,0.08)' : 'transparent', transition: 'background 0.4s' }}>
                        <td style={{ padding: '6px 10px' }}>
                          <EditCell value={s.nombre} type="text" w={130} align="left" bold onSave={v => editScheme(s.id, 'nombre', v)} />
                        </td>
                        <td style={{ padding: '6px 6px', textAlign: 'center' }}><EditCell value={s.firma_pct} suffix="%" onSave={v => editScheme(s.id, 'firma_pct', v)} /></td>
                        <td style={{ padding: '6px 6px', textAlign: 'center', color: 'var(--cream-3)', fontVariantNumeric: 'tabular-nums' }}>{bd.mensPct}%</td>
                        <td style={{ padding: '6px 6px', textAlign: 'center' }}><EditCell value={s.escritura_pct} suffix="%" onSave={v => editScheme(s.id, 'escritura_pct', v)} /></td>
                        <td style={{ padding: '6px 6px', textAlign: 'center' }}><EditCell value={s.descuento_pct} suffix="%" accent="#15803d" onSave={v => editScheme(s.id, 'descuento_pct', v)} /></td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--cream)', fontWeight: 800, whiteSpace: 'nowrap' }}>
                          {base ? fmtMXN(bd.precio) : '—'}
                          {base > 0 && bd.ahorro > 0 && <div style={{ fontSize: 10, color: '#15803d', fontWeight: 700 }}>ahorra {fmtMXN(bd.ahorro)}</div>}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--cream-2)', whiteSpace: 'nowrap' }}>
                          {bd.mensM > 0 ? (mesesAuto ? `${fmtMXN(bd.mensualidad)}` : fmtMXN(bd.mensM)) : '—'}
                          {bd.mensM > 0 && mesesAuto ? <div style={{ fontSize: 9.5, color: 'var(--cream-3)' }}>× {mesesAuto} meses</div> : null}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {flash
                            ? <Check size={15} style={{ color: '#15803d' }} />
                            : <button onClick={() => removeScheme(s.id)} title="Eliminar forma" style={{ background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', display: 'inline-flex' }}><Trash size={14} /></button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ExportBar devId={devId} getBody={formsBody} idp="forms" disabled={schemes.length === 0} />

            {/* Cotizador no-fijo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--theme)' }}>
                Cotizador a la medida
              </div>
              <button data-testid="save-custom-scheme" onClick={saveCustomAsScheme} disabled={schemes.length >= MAX_SCHEMES || !quote}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: (schemes.length >= MAX_SCHEMES || !quote) ? 'rgba(var(--cream-rgb),0.08)' : 'var(--grad)', border: 'none', color: (schemes.length >= MAX_SCHEMES || !quote) ? 'var(--cream-3)' : '#fff', borderRadius: 9999, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: (schemes.length >= MAX_SCHEMES || !quote) ? 'not-allowed' : 'pointer' }}>
                <Plus size={13} /> Guardar como forma de pago
              </button>
            </div>
            <div style={{ background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.2)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 10 }}>Toca un porcentaje para editarlo · los tres siempre suman 100%.</div>
              {/* Barra de proporción enganche / mensualidades / escritura */}
              <div style={{ display: 'flex', height: 12, borderRadius: 9999, overflow: 'hidden', marginBottom: 14, border: '1px solid rgba(var(--cream-rgb),0.14)' }}>
                <div style={{ width: `${enganche}%`, background: 'var(--theme)', transition: 'width 0.2s' }} title={`Enganche ${enganche}%`} />
                <div style={{ width: `${mensPct}%`, background: '#C77F12', transition: 'width 0.2s' }} title={`Mensualidades ${mensPct}%`} />
                <div style={{ width: `${escritura}%`, background: '#15803d', transition: 'width 0.2s' }} title={`Al escriturar ${escritura}%`} />
              </div>
              {/* 3 valores click-to-edit + meses */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
                <PctField label="Enganche" value={enganche} color="var(--theme)" onSave={onEng} testid="cust-enganche" />
                <PctField label="Mensualidades" value={mensPct} color="#C77F12" onSave={onMens} testid="cust-mens" />
                <PctField label="Al escriturar" value={escritura} color="#15803d" onSave={onEscr} testid="cust-escr" />
                <div style={{ flex: 1, minWidth: 110, background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.14)', borderRadius: 10, padding: '9px 12px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Meses</div>
                  <input type="number" min={1} value={meses} placeholder={mesesAuto ? `${mesesAuto} (auto)` : 'auto'}
                    onChange={e => setMeses(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.2)', borderRadius: 6, color: 'var(--cream)', fontSize: 16, fontWeight: 700, fontFamily: 'Outfit', padding: '2px 6px' }} />
                </div>
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
              <ExportBar devId={devId} getBody={customBody} idp="custom" disabled={!quote} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Celda click-to-edit compacta para el comparador.
function EditCell({ value, suffix = '', onSave, w = 54, type = 'num', align = 'center', bold = false, accent }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const start = () => { setV(value); setEditing(true); };
  const finish = () => {
    setEditing(false);
    const nv = type === 'num' ? (v === '' ? 0 : Math.max(0, Math.min(100, +v))) : String(v).trim();
    if (nv !== value && !(type === 'text' && !nv)) onSave(nv);
  };
  if (editing) {
    return (
      <input autoFocus type={type === 'num' ? 'number' : 'text'} value={v}
        onChange={e => setV(e.target.value)} onBlur={finish}
        onKeyDown={e => { if (e.key === 'Enter') finish(); if (e.key === 'Escape') setEditing(false); }}
        style={{ width: type === 'text' ? w : w, textAlign: align, background: '#fff', border: '1px solid var(--theme)', borderRadius: 6, color: 'var(--cream)', fontSize: 12.5, padding: '4px 6px', fontWeight: bold ? 700 : 500 }} />
    );
  }
  return (
    <span onClick={start} title="Toca para editar"
      style={{ display: 'inline-block', minWidth: type === 'num' ? 36 : w, textAlign: align, cursor: 'pointer', padding: '3px 6px', borderRadius: 6, borderBottom: '1px dashed rgba(var(--theme-rgb),0.45)', color: accent || 'var(--cream)', fontWeight: bold ? 700 : 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {value}{suffix}
    </span>
  );
}

// Barra de exportar: Descargar PDF · WhatsApp PDF (link) · WhatsApp texto.
function ExportBar({ devId, getBody, idp, disabled }) {
  const [busy, setBusy] = useState(false);
  const run = async (mode) => {
    setBusy(true);
    try {
      if (mode === 'text') {
        const r = await quotePdf(devId, { ...getBody(), text_only: true });
        if (r.wa_text) waOpen(r.wa_text);
      } else {
        const r = await quotePdf(devId, getBody());
        const url = (ASSET_BASE || '') + r.pdf_url;
        if (mode === 'wapdf') waOpen(`${r.wa_text}\n\nVer cotización (PDF): ${url}`);
        else window.open(url, '_blank');
      }
    } catch (e) { /* noop */ } finally { setBusy(false); }
  };
  const btnStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.22)', color: 'var(--cream)', borderRadius: 9999, padding: '7px 13px', fontSize: 11.5, fontWeight: 700, cursor: (disabled || busy) ? 'not-allowed' : 'pointer', opacity: (disabled || busy) ? 0.55 : 1 };
  const waStyle = { ...btnStyle, background: '#25D366', borderColor: '#25D366', color: '#fff' };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <button data-testid={`exp-pdf-${idp}`} onClick={() => run('pdf')} disabled={disabled || busy} style={btnStyle}><Download size={13} /> Descargar PDF</button>
      <button data-testid={`exp-wapdf-${idp}`} onClick={() => run('wapdf')} disabled={disabled || busy} style={waStyle}><WaLogo size={14} /> WhatsApp PDF</button>
      <button data-testid={`exp-text-${idp}`} onClick={() => run('text')} disabled={disabled || busy} style={waStyle}><WaLogo size={14} /> WhatsApp texto</button>
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

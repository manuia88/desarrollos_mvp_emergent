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
import { paymentQuote, getPaymentSchemes, putPaymentSchemes } from '../../api/developer';
import { X, Plus, Trash, Check } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const MAX_SCHEMES = 5;
const fmtMXN = (v) => v == null ? '—' : `$${Number(v).toLocaleString('es-MX')}`;

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

export default function PaymentQuoter({ devId, schemes: initialSchemes, units, onClose, onSchemesSaved }) {
  const withPrice = (units || []).filter(u => u.price > 0);
  const [unitId, setUnitId] = useState(withPrice[0]?.id || '');
  const unit = withPrice.find(u => u.id === unitId) || withPrice[0];
  const base = unit?.price || 0;

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

        {/* Unidad + calendario de obra */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream-2)' }}>Unidad:</span>
          <select value={unitId} onChange={e => setUnitId(e.target.value)}
            style={{ background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 8, color: 'var(--cream)', fontSize: 13, padding: '7px 10px' }}>
            {withPrice.map(u => <option key={u.id} value={u.id} style={{ background: '#fff', color: 'var(--cream)' }}>{u.unit_number} · {fmtMXN(u.price)}</option>)}
          </select>
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

        {err && (
          <div style={{ background: 'rgba(185,28,28,0.10)', border: '1px solid rgba(185,28,28,0.3)', color: '#b91c1c', borderRadius: 9, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
            {err}
          </div>
        )}

        {!base ? (
          <div style={{ color: 'var(--cream-3)', fontSize: 13 }}>No hay unidades con precio para cotizar.</div>
        ) : (
          <>
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
                          {fmtMXN(bd.precio)}
                          {bd.ahorro > 0 && <div style={{ fontSize: 10, color: '#15803d', fontWeight: 700 }}>ahorra {fmtMXN(bd.ahorro)}</div>}
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
                  <input type="number" min={1} value={meses} placeholder={mesesAuto ? `${mesesAuto} (auto)` : 'auto'}
                    onChange={e => setMeses(e.target.value)}
                    style={{ width: 96, background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.28)', borderRadius: 6, color: 'var(--cream)', fontSize: 12, padding: '3px 6px' }} />
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

function QField({ label, value, hint, strong }) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 10, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--cream-2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: strong ? 17 : 14, fontWeight: strong ? 800 : 600, color: 'var(--cream)', fontFamily: 'Outfit' }}>{value}</div>
      {hint && <div style={{ fontSize: 10.5, color: strong ? '#15803d' : 'var(--cream-2)', marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

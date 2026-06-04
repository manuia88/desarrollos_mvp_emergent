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
import { X, Plus, Download } from '../../components/icons';
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
    <div className="dmx-card" style={{ flex: 1, minWidth: 110, background: '#fff', padding: '9px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      {editing ? (
        <input autoFocus type="number" data-testid={testid} value={v} onChange={e => setV(e.target.value)} onBlur={finish}
          onKeyDown={e => { if (e.key === 'Enter') finish(); if (e.key === 'Escape') setEditing(false); }}
          style={{ width: 74, fontSize: 18, fontWeight: 800, fontFamily: 'Outfit', color: 'var(--cream)', background: '#fff', colorScheme: 'light', border: `1px solid ${color}`, borderRadius: 6, padding: '2px 6px' }} />
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

// Meses que faltan de HOY a la entrega (para "N mensualidades de $X").
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function mesesRestantes(fe) {
  if (!fe) return null;
  const [y, m] = String(fe).split('-').map(Number);
  if (!y || !m) return null;
  const n = new Date();
  return Math.max(1, (y - n.getFullYear()) * 12 + (m - (n.getMonth() + 1)));
}
function fmtEntrega(fe) {
  if (!fe) return '';
  const [y, m] = String(fe).split('-').map(Number);
  return m ? `${MONTHS_ES[m - 1]} ${y}` : `${y}`;
}

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
  const [scope, setScope] = useState(initialScope);         // 'proyecto' (planes oficiales) | 'unidad'
  const [unitId, setUnitId] = useState(initialUnitId || withPrice[0]?.id || '');
  const [cliente, setCliente] = useState('');
  const unit = withPrice.find(u => u.id === unitId) || withPrice[0];
  // Base: en 'unidad' el precio de la unidad; en 'planes oficiales' no hay precio (solo términos).
  const base = scope === 'unidad' ? (unit?.price || 0) : 0;

  const [schemes, setSchemes] = useState(initialSchemes || []);
  const [fechaInicio, setFechaInicio] = useState(null);
  const [fechaEntrega, setFechaEntrega] = useState(null);
  const [mesesAuto, setMesesAuto] = useState(null);
  const [err, setErr] = useState('');

  // Cotizador a la medida: 3 porcentajes que suman 100. `recent` = los 2 últimos editados;
  // al editar cualquiera, el tercero (no-reciente) se ajusta solo.
  const [pp, setPp] = useState({ eng: 20, mens: 10, escr: 70 });
  const [recent, setRecent] = useState(['eng', 'escr']);
  const enganche = pp.eng;
  const escritura = pp.escr;
  const [quote, setQuote] = useState(null);
  // Por unidad: forma elegida (filtro) + modo prediseñada (fija) | manual (editable).
  const [selFormId, setSelFormId] = useState('');
  const [cotMode, setCotMode] = useState('pred');

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

  // Fija la forma seleccionada cuando cargan las formas y siembra los % del manual desde ella.
  useEffect(() => {
    if (!schemes.length) return;
    const f = schemes.find(s => s.id === selFormId) || schemes[0];
    if (f.id !== selFormId) setSelFormId(f.id);
    setPp({ eng: +f.firma_pct || 0, mens: Math.max(0, 100 - (+f.firma_pct || 0) - (+f.escritura_pct || 0)), escr: +f.escritura_pct || 0 });
    setRecent(['eng', 'escr']);
  }, [schemes, selFormId]);

  // Persiste TODO el arreglo (el endpoint reemplaza). mens se deriva para sumar 100.
  const persist = useCallback(async (next) => {
    const clean = next.map(s => {
      const firma = Math.max(0, Math.min(100, +s.firma_pct || 0));
      const escr = Math.max(0, Math.min(100 - firma, +s.escritura_pct || 0));
      return { ...s, firma_pct: firma, escritura_pct: escr, mensualidades_pct: Math.max(0, 100 - firma - escr) };
    });
    setSchemes(clean);
    setErr('');
    try {
      await putPaymentSchemes(devId, { schemes: clean, fecha_inicio: fechaInicio, fecha_entrega: fechaEntrega });
      onSchemesSaved && onSchemesSaved();
    } catch (e) {
      setErr(e.body?.detail || 'No se pudo guardar. Revisa que los nombres no se repitan.');
    }
  }, [devId, fechaInicio, fechaEntrega, onSchemesSaved]);

  // Guarda las fechas de obra → recalcula meses al instante (sin tocar las formas).
  const saveDates = (fi, fe) => {
    setFechaInicio(fi || null); setFechaEntrega(fe || null);
    setMesesAuto(computeMonths(fi, fe));
    putPaymentSchemes(devId, { schemes, fecha_inicio: fi || null, fecha_entrega: fe || null })
      .then(() => onSchemesSaved && onSchemesSaved()).catch(() => {});
  };
  // Guarda la cotización manual actual como una forma configurada nueva.
  const saveCustomAsScheme = () => {
    if (schemes.length >= MAX_SCHEMES || !quote) return;
    const nuevo = {
      id: `tmp_custom_${schemes.length}`,
      nombre: `Personalizada (${enganche}%)`,
      firma_pct: enganche,
      escritura_pct: Math.min(escritura, 100 - enganche),
      mensualidades_pct: Math.max(0, 100 - enganche - Math.min(escritura, 100 - enganche)),
      descuento_pct: quote.descuento_pct || 0,
      apartado_mxn: 0,
      meses_override: null,
    };
    persist([...schemes, nuevo], nuevo.id);
  };

  // Cotizador manual: enganche/escritura libres → desglose (meses fijos según fechas). Debounced.
  const runQuote = useCallback((eng, escr) => {
    if (!base) { setQuote(null); return; }
    paymentQuote(devId, { precio_base: base, enganche_pct: eng, escritura_pct: escr })
      .then(r => setQuote(r.breakdown)).catch(() => setQuote(null));
  }, [devId, base]);

  useEffect(() => {
    const t = setTimeout(() => runQuote(enganche, escritura), 220);
    return () => clearTimeout(t);
  }, [enganche, escritura, runQuote]);

  // Cuerpos para el PDF/WhatsApp (proyecto general o por unidad).
  const baseBody = () => ({
    scope,
    unit_id: scope === 'unidad' ? unitId : null,
    unit_number: scope === 'unidad' ? (unit?.unit_number || null) : null,
    precio_base: base || null,
    cliente: cliente || null,
  });
  const formsBody = () => ({ ...baseBody(), mode: 'forms' });
  const customBody = () => ({ ...baseBody(), mode: 'custom', enganche_pct: enganche, escritura_pct: Math.min(escritura, 100 - enganche) });

  // Edita cualquier porcentaje: se conserva el otro más reciente y el tercero (no-reciente) se ajusta.
  const mensPct = pp.mens;
  const editPp = (field, v) => {
    v = Math.max(0, Math.min(100, +v || 0));
    const other = recent.find(k => k !== field) || (field === 'eng' ? 'escr' : 'eng');
    v = Math.min(v, 100 - pp[other]);
    const auto = ['eng', 'mens', 'escr'].find(k => k !== field && k !== other);
    setPp({ ...pp, [field]: v, [auto]: Math.max(0, 100 - v - pp[other]) });
    setRecent([field, other]);
  };
  const onEng = (v) => editPp('eng', v);
  const onEscr = (v) => editPp('escr', v);
  const onMens = (v) => editPp('mens', v);

  // Meses que faltan de hoy a la entrega → "N mensualidades de $X".
  const restantes = mesesRestantes(fechaEntrega);
  const entregaTxt = fmtEntrega(fechaEntrega);

  // Desglose a mostrar (por unidad): manual = del servidor (descuento por curva); prediseñada = la forma elegida.
  const selForm = schemes.find(s => s.id === selFormId) || schemes[0];
  let dEng, dMens, dEscr, displayBd;
  if (cotMode === 'manual') {
    dEng = enganche; dMens = mensPct; dEscr = escritura;
    displayBd = quote ? { precio: quote.precio_aplicado, firma: quote.firma, mensTotal: quote.mensualidades_total, escr: quote.escrituracion, ahorro: quote.ahorro } : null;
  } else if (selForm) {
    const b = localBreakdown(base, selForm, null);
    dEng = +selForm.firma_pct || 0; dMens = b.mensPct; dEscr = +selForm.escritura_pct || 0;
    displayBd = base ? { precio: b.precio, firma: b.firmaM, mensTotal: b.mensM, escr: b.escrM, ahorro: b.ahorro } : null;
  } else {
    dEng = dMens = dEscr = 0; displayBd = null;
  }
  const exportBody = () => cotMode === 'manual' ? customBody() : { ...baseBody(), mode: 'forms', scheme_id: selFormId };

  // Sección 1: catálogo persuasivo de los planes oficiales (read-only, sin precio, sin editar).
  const renderOficiales = () => (
    <>
      <div style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 2 }}>Planes de pago oficiales</div>
      <div style={{ fontSize: 12, color: 'var(--cream-3)', marginBottom: 14 }}>Los esquemas que ofrece el desarrollo. Compártelos con tu cliente.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 14 }}>
        {schemes.map(s => {
          const mens = Math.max(0, 100 - (+s.firma_pct || 0) - (+s.escritura_pct || 0));
          const hasDesc = (+s.descuento_pct || 0) > 0;
          return (
            <div key={s.id} className="dmx-card" style={{ background: '#fff', padding: '14px 16px' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', marginBottom: 8 }}>{s.nombre}</div>
              <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 9999, marginBottom: 12, background: hasDesc ? 'rgba(34,197,94,0.12)' : 'rgba(var(--theme-rgb),0.10)', color: hasDesc ? '#15803d' : 'var(--theme)' }}>
                {hasDesc ? `Ahorra ${s.descuento_pct}%` : 'Precio de lista'}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[['Enganche', s.firma_pct], ['Mensualidades', mens], ['Al escriturar', s.escritura_pct]].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--cream-2)' }}>{l}</span>
                    <strong style={{ color: 'var(--cream)' }}>{v}%</strong>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <ExportBar devId={devId} getBody={formsBody} idp="oficiales" disabled={schemes.length === 0} showDownload={false} />
    </>
  );

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
            {[['proyecto', 'Planes oficiales'], ['unidad', 'Cotizar por unidad']].map(([k, lbl]) => (
              <button key={k} data-testid={`scope-${k}`} onClick={() => setScope(k)}
                style={{ background: scope === k ? 'var(--grad)' : 'transparent', color: scope === k ? '#fff' : 'var(--cream-2)', border: 'none', borderRadius: 9999, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {scope === 'unidad' && (
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream-2)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                Unidad:
                <select value={unitId} onChange={e => setUnitId(e.target.value)}
                  style={{ background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 8, color: 'var(--cream)', fontSize: 13, padding: '7px 10px' }}>
                  {withPrice.map(u => <option key={u.id} value={u.id} style={{ background: '#fff', color: 'var(--cream)' }}>{u.unit_number} · {fmtMXN(u.price)}</option>)}
                </select>
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

        {scope === 'proyecto' ? renderOficiales() : !unit ? (
          <div style={{ color: 'var(--cream-3)', fontSize: 13 }}>No hay unidades con precio para cotizar.</div>
        ) : (
          <>
            {/* Filtro de forma de pago + toggle prediseñada/manual */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream-2)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                Forma de pago:
                <select data-testid="form-filter" value={selFormId} onChange={e => setSelFormId(e.target.value)}
                  style={{ background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 8, color: 'var(--cream)', fontSize: 13, padding: '7px 10px', colorScheme: 'light' }}>
                  {schemes.map(s => <option key={s.id} value={s.id} style={{ background: '#fff', color: 'var(--cream)' }}>{s.nombre}</option>)}
                </select>
              </label>
              <div style={{ display: 'inline-flex', background: 'rgba(var(--cream-rgb),0.06)', border: '1px solid rgba(var(--cream-rgb),0.14)', borderRadius: 9999, padding: 3 }}>
                {[['pred', 'Prediseñada'], ['manual', 'Manual']].map(([k, lbl]) => (
                  <button key={k} data-testid={`cotmode-${k}`} onClick={() => setCotMode(k)}
                    style={{ background: cotMode === k ? 'var(--grad)' : 'transparent', color: cotMode === k ? '#fff' : 'var(--cream-2)', border: 'none', borderRadius: 9999, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                ))}
              </div>
              {cotMode === 'manual' && (
                <button data-testid="save-custom-scheme" onClick={saveCustomAsScheme} disabled={schemes.length >= MAX_SCHEMES || !displayBd}
                  style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: (schemes.length >= MAX_SCHEMES || !displayBd) ? 'rgba(var(--cream-rgb),0.08)' : 'var(--grad)', border: 'none', color: (schemes.length >= MAX_SCHEMES || !displayBd) ? 'var(--cream-3)' : '#fff', borderRadius: 9999, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: (schemes.length >= MAX_SCHEMES || !displayBd) ? 'not-allowed' : 'pointer' }}>
                  <Plus size={13} /> Guardar como forma de pago
                </button>
              )}
            </div>

            <div style={{ background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.2)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 10 }}>
                {cotMode === 'manual' ? 'Toca un porcentaje para editarlo · los tres siempre suman 100%.' : 'Plan oficial · valores fijos.'}
              </div>
              {/* Barra de proporción */}
              <div style={{ display: 'flex', height: 12, borderRadius: 9999, overflow: 'hidden', marginBottom: 14, border: '1px solid rgba(var(--cream-rgb),0.14)' }}>
                <div style={{ width: `${dEng}%`, background: 'var(--theme)', transition: 'width 0.2s' }} title={`Enganche ${dEng}%`} />
                <div style={{ width: `${dMens}%`, background: '#C77F12', transition: 'width 0.2s' }} title={`Mensualidades ${dMens}%`} />
                <div style={{ width: `${dEscr}%`, background: '#15803d', transition: 'width 0.2s' }} title={`Al escriturar ${dEscr}%`} />
              </div>
              {/* 3 valores (editables en manual, fijos en prediseñada) + meses fijo */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
                {cotMode === 'manual' ? (
                  <>
                    <PctField label="Enganche" value={enganche} color="var(--theme)" onSave={onEng} testid="cust-enganche" />
                    <PctField label="Mensualidades" value={mensPct} color="#C77F12" onSave={onMens} testid="cust-mens" />
                    <PctField label="Al escriturar" value={escritura} color="#15803d" onSave={onEscr} testid="cust-escr" />
                  </>
                ) : (
                  <>
                    <RoPct label="Enganche" value={`${dEng}%`} color="var(--theme)" />
                    <RoPct label="Mensualidades" value={`${dMens}%`} color="#C77F12" />
                    <RoPct label="Al escriturar" value={`${dEscr}%`} color="#15803d" />
                  </>
                )}
                <div className="dmx-card" style={{ flex: 1, minWidth: 110, background: '#fff', padding: '9px 12px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Meses</div>
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit', color: 'var(--cream)' }}>{mesesAuto || '—'}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--cream-3)' }}>según fechas</div>
                </div>
              </div>

              {displayBd && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginTop: 14 }}>
                  <QField label="Precio final" value={fmtMXN(displayBd.precio)} strong
                    hint={displayBd.ahorro > 0 ? `ahorra ${fmtMXN(displayBd.ahorro)}` : null} />
                  <QField label="Al firmar" value={fmtMXN(displayBd.firma)} hint={`${dEng}%`} />
                  <QField label="Mensualidad"
                    value={displayBd.mensTotal > 0 ? (restantes ? `${fmtMXN(Math.round(displayBd.mensTotal / restantes))}/mes` : fmtMXN(displayBd.mensTotal)) : '—'}
                    hint={displayBd.mensTotal > 0 && restantes ? `${restantes} mensualidades${entregaTxt ? ` · entrega ${entregaTxt}` : ''}` : null} />
                  <QField label="Al escriturar" value={fmtMXN(displayBd.escr)} hint={`${dEscr}%`} />
                </div>
              )}
              <ExportBar devId={devId} getBody={exportBody} idp="unidad" disabled={!displayBd} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Celda click-to-edit compacta para el comparador.
// Tarjeta de porcentaje SOLO lectura (prediseñada).
function RoPct({ label, value, color }) {
  return (
    <div className="dmx-card" style={{ flex: 1, minWidth: 110, background: '#fff', padding: '9px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit', color: 'var(--cream)' }}>{value}</div>
    </div>
  );
}

// Barra de exportar: Descargar PDF · WhatsApp PDF (link) · WhatsApp texto.
function ExportBar({ devId, getBody, idp, disabled, showDownload = true }) {
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
      {showDownload && <button data-testid={`exp-pdf-${idp}`} onClick={() => run('pdf')} disabled={disabled || busy} style={btnStyle}><Download size={13} /> Descargar PDF</button>}
      <button data-testid={`exp-wapdf-${idp}`} onClick={() => run('wapdf')} disabled={disabled || busy} style={waStyle}><WaLogo size={14} /> WhatsApp PDF</button>
      <button data-testid={`exp-text-${idp}`} onClick={() => run('text')} disabled={disabled || busy} style={waStyle}><WaLogo size={14} /> WhatsApp texto</button>
    </div>
  );
}

function QField({ label, value, hint, strong }) {
  return (
    <div className="dmx-card" style={{ background: '#fff', padding: '8px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--cream-2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: strong ? 17 : 14, fontWeight: strong ? 800 : 600, color: 'var(--cream)', fontFamily: 'Outfit' }}>{value}</div>
      {hint && <div style={{ fontSize: 10.5, color: strong ? '#15803d' : 'var(--cream-2)', marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

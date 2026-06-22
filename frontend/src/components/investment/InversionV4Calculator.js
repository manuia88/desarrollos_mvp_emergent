/**
 * InversionV4Calculator — Calculadora de inversión inmobiliaria GRADO INSTITUCIONAL (PROMPT v4) · UX rediseñada.
 * 2 columnas (ajustes | resultado visual), resultado grande primero, cascada visual, badges auto/bloqueado, agrupado.
 * Pro por dentro, simple por fuera. Reactiva. Motor en POST /api/inversion-v4/analyze (motor + fiscal + mercado vivo).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);

const GLOSS = {
  tir: ['Rendimiento anual total', 'Tu ganancia anual real juntando renta + plusvalía, considerando el tiempo (TIR).'],
  flujo: ['Flujo mensual neto', 'Lo que te queda (o sale de tu bolsa) cada mes, tras gastos y crédito.'],
  em: ['Multiplicas tu dinero', 'Si pones $1, cuántos recuperas al final (equity multiple).'],
  patrimonio: ['Patrimonio que construyes', 'La parte del crédito que ya pagaste y ahora es tuya (equity buildup).'],
};
const SEM = { verde: '#0E9F6E', amarillo: '#E0A33E', rojo: '#DC2626', gris: '#8A8FA6' };
const REGIMENES = [['auto', 'Automático (paga menos)'], ['resico', 'RESICO (1–2.5%)'], ['arrend_ciega', 'Arrendamiento · ciega'], ['arrend_real', 'Arrendamiento · real'], ['asalariado', 'Asalariado'], ['pfae', 'Actividad empresarial']];

function Tip({ g }) {
  const [el, fr] = GLOSS[g] || ['', ''];
  return <span className="iv4-tip" tabIndex={0}>ⓘ<span className="iv4-tipbox"><b>{el}</b><br />{fr}</span></span>;
}
const Auto = () => <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 800, color: '#6D28D9', background: 'rgba(124,92,255,0.12)', borderRadius: 5, padding: '1px 5px', verticalAlign: 'middle' }}>AUTO · EDITABLE</span>;
// link directo al Proyector de Impuestos (abre en pestaña nueva para no perder la calculadora)
const ProyectorLink = () => <a href="/tools/tax-projector" target="_blank" rel="noreferrer" style={{ color: '#6D28D9', fontWeight: 700, textDecoration: 'underline' }}>Proyector de Impuestos</a>;
// globito "?" con explicación rica (qué es · de dónde sale · ejemplo real). children = contenido.
const Info = ({ children }) => <sup className="iv4-tip" tabIndex={0} style={{ marginLeft: 3 }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: '50%', background: 'rgba(124,92,255,0.14)', color: '#6D28D9', fontSize: 9, fontWeight: 800 }}>?</span><span className="iv4-tipbox" style={{ width: 250 }}>{children}</span></sup>;

export default function InversionV4Calculator({ prefilled = {}, lockPrice = false, zoneId = '', capRateMercado = null, devUnits = [] }) {
  const precio0 = prefilled.precio || 5_000_000;
  const [f, setF] = useState({
    valor_propiedad: precio0, num_unidades: 1,
    con_credito: true, ltv: 0.80, tasa_anual: '', plazo_meses: 240, abono_capital_mensual: 0,
    modo_renta: 'largo', renta_mensual: prefilled.renta || Math.round(precio0 * 0.0045), tasa_vacancia: 0.05,
    tarifa_noche: Math.round((prefilled.renta || precio0 * 0.0045) / 30 * 2.2), ocupacion_pct: 0.6,
    predial: Math.round(precio0 * 0.0016), mantenimiento: Math.round(precio0 * 0.0024), seguro: Math.round(precio0 * 0.0012),
    horizonte_anios: 5, apreciacion_anual: 0.075, crecimiento_renta_anual: 0.05,
    exit_cap_rate: '', capex_reserve_pct: 0.04, prima_riesgo_inmobiliario: 0.05,   // supuestos institucionales editables
    perfil: 'fisica', tipo_inmueble: 'residencial', es_casa_habitacion: true, regimen_fiscal: 'auto',
  });
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(false);
  const [vista, setVista] = useState('simple');     // 'simple' (te lleva de la mano) | 'institucional' (experto)
  const [openAdv, setOpenAdv] = useState(false);
  const [moneda, setMoneda] = useState('MXN');     // MXN | USD (convierte con el FIX vivo de Banxico)
  const [airroi, setAirroi] = useState(null);       // datos reales de renta corta (AirROI) por zona
  const [airroiLoading, setAirroiLoading] = useState(false);
  const [radarK, setRadarK] = useState('bolsa');    // instrumento a comparar en el radar del Pentágono
  const [leadOpen, setLeadOpen] = useState(false);  // modal de captura para descargar el PDF (reusa /api/lead-capture)
  const [leadData, setLeadData] = useState({ nombre: '', telefono: '', correo: '', presupuesto: '', tiempo: '', privacidad: false });
  const [leadState, setLeadState] = useState('');   // '' | 'enviando' | 'ok' | 'error'
  const setLead = (k, v) => setLeadData((s) => ({ ...s, [k]: v }));
  const tusDatosRef = useRef(null);                  // barra sticky: aparece cuando "Tus datos" sale de vista
  const [showSticky, setShowSticky] = useState(false);
  const [selUnits, setSelUnits] = useState([]);      // fase 3: índices de unidades elegidas para el portafolio
  const [port, setPort] = useState(null);            // resultado agregado del portafolio
  const [descVol, setDescVol] = useState(0);         // descuento por volumen (%)
  const timer = useRef(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const askAtlax = (q) => { try { window.dispatchEvent(new CustomEvent('atlax:open', { detail: { query: q } })); } catch { /* noop */ } };

  const run = useCallback(async (payload) => {
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/inversion-v4/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await resp.json();
      if (d && d.ok) setR(d);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  // AirROI: trae tarifa/ocupación REALES de Airbnb por zona (cuesta por llamada → solo al tocar el botón, con caché)
  const traerAirroi = useCallback(async () => {
    if (!zoneId) return;
    setAirroiLoading(true);
    try {
      const resp = await fetch(`${API}/api/inversion-v4/airroi`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone_id: zoneId }) });
      const d = await resp.json();
      if (d && d.ok && d.adr_mxn) {
        setAirroi(d);
        setF((s) => ({ ...s, modo_renta: 'corto', tarifa_noche: d.adr_mxn, ocupacion_pct: d.ocupacion || s.ocupacion_pct }));
      } else { setAirroi({ error: (d && d.error) || 'AirROI no devolvió datos para esta zona.' }); }
    } catch { setAirroi({ error: 'No se pudo conectar con AirROI.' }); } finally { setAirroiLoading(false); }
  }, [zoneId]);

  // Descargar PDF → captura el lead en el motor real (/api/lead-capture) y abre el PDF personalizado
  const enviarLead = async () => {
    if (!leadData.nombre || leadData.nombre.length < 2) return setLeadState('error');
    if (!String(leadData.telefono).replace(/\D/g, '').match(/^\d{10,15}$/)) return setLeadState('error');
    if (!leadData.privacidad) return setLeadState('error');
    setLeadState('enviando');
    try {
      const resp = await fetch(`${API}/api/lead-capture`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: leadData.nombre.trim(), whatsapp: String(leadData.telefono).replace(/\D/g, ''),
          property_id: zoneId || 'calculadora-inversion', property_scope: 'project', source_page: 'calculadora_inversion',
          interes: { email: leadData.correo, presupuesto: leadData.presupuesto, forma_pago: f.con_credito ? 'crédito' : 'contado', tiempo_compra: leadData.tiempo, calculadora: { precio: f.valor_propiedad, tir_pct: r && r.tir_pct, modo_renta: f.modo_renta, horizonte: f.horizonte_anios } },
          consents: { privacy_policy: true },
        }),
      });
      const d = await resp.json();
      try { window.dispatchEvent(new CustomEvent('dmx:lead', { detail: { source: 'calculadora_pdf', zona: zoneId, precio: f.valor_propiedad } })); } catch { /* noop */ }
      setLeadState('ok');
      setTimeout(() => { if (d && d.pdf_url) window.open(d.pdf_url, '_blank'); else window.print(); setLeadOpen(false); setLeadState(''); }, 600);
    } catch { setLeadState('error'); }
  };

  useEffect(() => {
    clearTimeout(timer.current);
    const num = (x) => (x === '' || x === null ? undefined : Number(x));
    const tasaFrac = (f.tasa_anual === '' || f.tasa_anual === null || f.tasa_anual === undefined) ? undefined : Number(f.tasa_anual) / 100;
    const payload = { ...f, incluir_sensibilidad: vista === 'institucional', valor_propiedad: num(f.valor_propiedad), renta_mensual: num(f.renta_mensual), num_unidades: num(f.num_unidades), ltv: num(f.ltv), tasa_anual: tasaFrac, plazo_meses: num(f.plazo_meses), abono_capital_mensual: num(f.abono_capital_mensual) || 0, apreciacion_anual: num(f.apreciacion_anual), crecimiento_renta_anual: num(f.crecimiento_renta_anual), exit_cap_rate: num(f.exit_cap_rate) || 0, capex_reserve_pct: num(f.capex_reserve_pct), prima_riesgo_inmobiliario: num(f.prima_riesgo_inmobiliario), tasa_vacancia: num(f.tasa_vacancia), zone_id: zoneId || undefined, usa_airroi: !!(airroi && airroi.adr_mxn) };
    timer.current = setTimeout(() => run(payload), 250);
    return () => clearTimeout(timer.current);
  }, [f, vista, run, zoneId, airroi]);

  // al elegir otra unidad/proyecto (cambia el precio que llega), sincroniza el precio bloqueado → permite comparar proyectos
  useEffect(() => {
    if (prefilled.precio) setF((s) => ({ ...s, valor_propiedad: prefilled.precio, renta_mensual: prefilled.renta || s.renta_mensual }));
  }, [prefilled.precio, prefilled.renta]);

  // barra sticky: cuando "Tus datos" sale de vista, mostrar la barra fija con controles + TIR en vivo
  useEffect(() => {
    const el = tusDatosRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting), { rootMargin: '-40px 0px 0px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // fase 3 · portafolio: al elegir 2+ unidades (modo fondo), corre la agregación (debounced)
  useEffect(() => {
    if (vista !== 'institucional' || selUnits.length < 2) { setPort(null); return undefined; }
    const tasaFrac = (f.tasa_anual === '' || f.tasa_anual == null) ? undefined : Number(f.tasa_anual) / 100;
    const units = selUnits.map((i) => ({ label: devUnits[i].label, precio: devUnits[i].precio, renta: devUnits[i].renta }));
    const payload = { units, con_credito: f.con_credito, ltv: Number(f.ltv), tasa_anual: tasaFrac, plazo_meses: Number(f.plazo_meses), horizonte_anios: Number(f.horizonte_anios), modo_renta: f.modo_renta, apreciacion_anual: Number(f.apreciacion_anual), crecimiento_renta_anual: Number(f.crecimiento_renta_anual), descuento_volumen_pct: descVol };
    const t = setTimeout(async () => {
      try {
        const resp = await fetch(`${API}/api/inversion-v4/portafolio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const d = await resp.json();
        if (d && d.ok) setPort(d.portafolio);
      } catch { /* noop */ }
    }, 300);
    return () => clearTimeout(t);
  }, [vista, selUnits, descVol, f.con_credito, f.ltv, f.tasa_anual, f.plazo_meses, f.horizonte_anios, f.modo_renta, f.apreciacion_anual, f.crecimiento_renta_anual, devUnits]);

  // estilos
  const inp = { background: '#fff', border: '1px solid rgba(16,18,28,0.16)', borderRadius: 9, color: '#16182A', fontFamily: 'DM Sans', fontSize: 13, padding: '9px 11px', width: '100%', outline: 'none', boxSizing: 'border-box' };
  const lab = { fontFamily: 'DM Sans', fontSize: 10.5, color: '#6B6F86', marginBottom: 5, display: 'block', fontWeight: 700 };
  const sectTitle = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: '#16182A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 };
  const grpLabel = { fontFamily: 'DM Sans', fontWeight: 800, fontSize: 10, color: '#9499AE', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 9 };
  const Toggle = ({ k, opts }) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {opts.map(([v, l]) => { const on = String(f[k]) === String(v); return <button key={String(v)} type="button" onClick={() => set(k, v)} style={{ padding: '8px 13px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, border: on ? '1.5px solid #7C5CFF' : '1px solid rgba(99,102,241,0.2)', background: on ? 'rgba(124,92,255,0.1)' : '#fff', color: on ? '#6D28D9' : '#4B4F66' }}>{l}</button>; })}
    </div>
  );
  const Field = ({ label, k, money, auto }) => (
    <div><span style={lab}>{label}{auto && <Auto />}</span>
      <input type="text" inputMode="numeric" value={money ? m(f[k]) : f[k]} onChange={(e) => set(k, String(e.target.value).replace(/[^\d]/g, ''))} style={inp} /></div>
  );

  const multifamily = Number(f.num_unidades) >= 5;
  const sem = (r && r.veredicto && SEM[r.veredicto.semaforo]) || '#8A8FA6';
  // formateador de dinero local (convierte a USD con el FIX vivo) — sombrea el módulo para toda la vista
  const fix = (r && r.mercado && r.mercado.fix_usd) || 18.0;
  const m = (n) => (moneda === 'USD'
    ? `US$${Math.round((Number(n) || 0) / fix).toLocaleString('en-US')}`
    : `$${Math.round(Number(n) || 0).toLocaleString('es-MX')}`);

  return (
    <div style={{ fontFamily: 'DM Sans', color: '#16182A' }}>
      <style>{`
        .iv4-tip{position:relative;cursor:help;color:#A9ADC4;font-size:11px;margin-left:5px}
        .iv4-tipbox{position:absolute;bottom:135%;left:50%;transform:translateX(-50%);width:220px;background:#1E2230;color:#fff;font-weight:500;font-size:11px;line-height:1.45;padding:9px 11px;border-radius:9px;box-shadow:0 12px 30px rgba(16,18,28,.3);opacity:0;visibility:hidden;transition:opacity .14s;z-index:60;text-align:left;pointer-events:none}
        .iv4-tip:hover .iv4-tipbox,.iv4-tip:focus .iv4-tipbox{opacity:1;visibility:visible}
        .iv4-card{background:#fff;border:1px solid rgba(16,18,28,.08);border-radius:18px;box-shadow:0 6px 20px rgba(99,102,241,.06);padding:20px 22px}
        @media print{.iv4-noprint{display:none}}
      `}</style>

      {/* ───── BARRA DE CONTROL · tus datos (ancho completo, horizontal — sin columna angosta = sin huecos) ───── */}
      <div ref={tusDatosRef} className="iv4-card iv4-noprint" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ ...sectTitle, marginBottom: 0 }}>🏠 Tus datos</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', background: 'rgba(16,18,28,0.05)', borderRadius: 9999, padding: 3 }}>
              {[['simple', '👤 Para mí'], ['institucional', '🏛️ Como fondo']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setVista(v)} style={{ padding: '7px 16px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12.5, border: 'none', background: vista === v ? '#fff' : 'transparent', color: vista === v ? '#6D28D9' : '#6B6F86', boxShadow: vista === v ? '0 2px 8px rgba(16,18,28,0.08)' : 'none' }}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'inline-flex', background: 'rgba(16,18,28,0.05)', borderRadius: 9999, padding: 3 }}>
              {['MXN', 'USD'].map((mo) => (
                <button key={mo} type="button" onClick={() => setMoneda(mo)} style={{ padding: '7px 13px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, border: 'none', background: moneda === mo ? '#fff' : 'transparent', color: moneda === mo ? '#6D28D9' : '#6B6F86', boxShadow: moneda === mo ? '0 2px 8px rgba(16,18,28,0.08)' : 'none' }}>{mo}</button>
              ))}
            </div>
          </div>
        </div>
        {moneda === 'USD' && r && r.mercado && r.mercado.fix_usd && (
          <div style={{ fontSize: 10.5, color: '#0B6E99', background: 'rgba(14,165,233,0.08)', borderRadius: 8, padding: '7px 11px', marginBottom: 12, display: 'inline-block' }}>
            💱 Tipo de cambio: <b>1 USD = ${r.mercado.fix_usd} MXN</b> · Banxico (FIX){(r.fuentes_fecha || {}).banxico ? `, consultado ${r.fuentes_fecha.banxico}` : ''}. Se actualiza solo cada día.
          </div>
        )}
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Grupo 1 · El inmueble */}
          <div>
            <div style={grpLabel}>🏠 El inmueble</div>
            <div style={{ display: 'flex', gap: 13, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ minWidth: 150 }}><span style={lab}>Precio {lockPrice && <span style={{ color: '#8A8FA6', fontWeight: 600 }}>🔒 fijo</span>}</span>
                {lockPrice ? <input type="text" readOnly value={m(f.valor_propiedad)} style={{ ...inp, background: '#F4F5F8', color: '#5B5F76', cursor: 'not-allowed' }} />
                  : <input type="text" inputMode="numeric" value={m(f.valor_propiedad)} onChange={(e) => set('valor_propiedad', String(e.target.value).replace(/[^\d]/g, ''))} style={inp} />}</div>
              <div><span style={lab}>Tipo de renta</span><Toggle k="modo_renta" opts={[['largo', 'Largo'], ['corto', 'Airbnb']]} /></div>
            </div>
          </div>
          <div style={{ alignSelf: 'stretch', width: 1, background: 'rgba(16,18,28,0.08)' }} />
          {/* Grupo 2 · Cómo lo pagas */}
          <div>
            <div style={grpLabel}>💳 Cómo lo pagas</div>
            <div style={{ display: 'flex', gap: 13, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div><Toggle k="con_credito" opts={[[false, 'Contado'], [true, 'Crédito']]} /></div>
              {f.con_credito && <div><span style={lab}>Enganche</span><select value={f.ltv} onChange={(e) => set('ltv', Number(e.target.value))} style={inp}>{[10, 20, 30, 40, 50, 60, 70, 80, 90].map((e) => <option key={e} value={(100 - e) / 100}>{e}%</option>)}</select></div>}
              {f.con_credito && <div><span style={lab}>Plazo</span><select value={f.plazo_meses} onChange={(e) => set('plazo_meses', Number(e.target.value))} style={inp}>{[[36, '3 años'], [60, '5 años'], [84, '7 años'], [120, '10 años'], [180, '15 años'], [240, '20 años'], [300, '25 años']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
              {f.con_credito && <div><span style={lab}>Tasa anual (%) <Auto /></span><input type="text" inputMode="decimal" placeholder="11.45" value={f.tasa_anual} onChange={(e) => set('tasa_anual', e.target.value.replace(/[^\d.]/g, ''))} style={{ ...inp, width: 90 }} /></div>}
              {f.con_credito && <div><span style={lab}>Abono extra/mes <span style={{ color: '#8A8FA6', fontWeight: 600 }}>opc.</span></span><input type="text" inputMode="numeric" value={m(f.abono_capital_mensual)} onChange={(e) => set('abono_capital_mensual', String(e.target.value).replace(/[^\d]/g, ''))} style={{ ...inp, width: 110 }} /></div>}
            </div>
          </div>
        </div>
        {/* TIRA DE CRÉDITO EN VIVO · ves el efecto de plazo/enganche/tasa sin bajar (quita fricción) */}
        {f.con_credito && r && r.credito && r.credito.pmt_mensual && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', padding: '11px 14px', background: 'rgba(124,92,255,0.06)', borderRadius: 10 }}>
            {[['Mensualidad', m(r.credito.pmt_mensual) + '/mes'], ['Te prestan', m(r.credito.monto_credito)], ['Tu enganche', m(r.credito.capital_propio)], ['Interés total', m(r.credito.interes_total)], ['La renta cubre', pct(r.credito.cobertura_renta_pct)]].map(([l, v]) => (
              <div key={l}><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: '#16182A' }}>{v}</div></div>
            ))}
            <div style={{ fontSize: 9.5, color: '#A2A6BC', marginLeft: 'auto' }}>↻ cambia plazo, enganche o tasa y mira aquí</div>
          </div>
        )}
        {/* AIRROI · datos reales de renta corta por zona (cuesta por llamada → botón explícito + caché) */}
        {f.modo_renta === 'corto' && zoneId && (
          <div style={{ marginTop: 12, padding: '11px 14px', background: 'rgba(14,165,233,0.08)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11.5, color: '#0B6E99', lineHeight: 1.45 }}>
              {airroi && airroi.adr_mxn ? <>📡 <b>AirROI</b> (real de esta zona): <b>{m(airroi.adr_mxn)}/noche</b> · {Math.round((airroi.ocupacion || 0) * 100)}% ocupación · {Math.round(airroi.listings || 0)} deptos activos.</> : (airroi && airroi.error ? <>⚠️ {airroi.error}</> : <>¿Quieres la tarifa y ocupación <b>reales</b> de Airbnb en esta zona? Las trae AirROI.</>)}
            </div>
            <button type="button" onClick={traerAirroi} disabled={airroiLoading} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', cursor: airroiLoading ? 'wait' : 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, background: '#0EA5E9', color: '#fff', whiteSpace: 'nowrap' }}>{airroiLoading ? 'Trayendo…' : (airroi && airroi.adr_mxn ? '↻ Actualizar' : '📡 Usar AirROI')}</button>
          </div>
        )}
        <div style={{ fontSize: 10, color: '#A2A6BC', marginTop: 12, lineHeight: 1.5 }}>Los campos <b style={{ color: '#6D28D9' }}>AUTO</b> son estimados editables (en <b>Configuración</b>). Solo el precio está fijo.</div>
        {/* CONFIGURACIÓN (supuestos) · dentro de Tus datos */}
        <div style={{ borderTop: '1px solid rgba(16,18,28,0.07)', marginTop: 14, paddingTop: 12 }}>
          <button type="button" onClick={() => setOpenAdv((o) => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: '#16182A' }}>
            <span>⚙️ Configuración <span style={{ fontWeight: 600, color: '#8A8FA6', fontSize: 11 }}>· predial, mantenimiento, horizonte, plusvalía, régimen fiscal</span></span><span style={{ color: '#6D4AFF' }}>{openAdv ? '−' : '+'}</span>
          </button>
          {openAdv && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 14 }}>
              {f.modo_renta === 'corto' ? (<>
                <Field label="Tarifa Por Noche" k="tarifa_noche" money auto />
                <div><span style={lab}>Ocupación (%) <Auto /></span><input type="number" value={Math.round((f.ocupacion_pct || 0.6) * 100)} onChange={(e) => set('ocupacion_pct', Number(e.target.value) / 100)} style={inp} /></div>
              </>) : <Field label="Renta mensual" k="renta_mensual" money auto />}
              <div><span style={lab}>N° Unidades {multifamily && <span style={{ color: '#6D28D9', fontWeight: 700 }}>·multi</span>}</span><input type="number" value={f.num_unidades} onChange={(e) => set('num_unidades', e.target.value)} style={inp} /></div>
              <Field label="Predial / año" k="predial" money auto />
              <Field label="Mantenim. / año" k="mantenimiento" money auto />
              <Field label="Seguro / año" k="seguro" money auto />
              <div><span style={lab}>Horizonte (años)</span><input type="number" value={f.horizonte_anios} onChange={(e) => set('horizonte_anios', Number(e.target.value))} style={inp} /></div>
              <div><span style={lab}>Plusvalía / año (%)</span><input type="number" step="0.1" value={f.apreciacion_anual * 100} onChange={(e) => set('apreciacion_anual', Number(e.target.value) / 100)} style={inp} /></div>
              <div><span style={lab}>Crecim. renta / año (%)</span><input type="number" step="0.1" value={f.crecimiento_renta_anual * 100} onChange={(e) => set('crecimiento_renta_anual', Number(e.target.value) / 100)} style={inp} /></div>
              <div><span style={lab}>Perfil</span><select value={f.perfil} onChange={(e) => set('perfil', e.target.value)} style={inp}><option value="fisica">Persona física</option><option value="moral">Persona moral</option></select></div>
              {f.perfil === 'fisica' && <div><span style={lab}>Régimen fiscal</span><select value={f.regimen_fiscal} onChange={(e) => set('regimen_fiscal', e.target.value)} style={inp}>{REGIMENES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
            </div>
          )}
        </div>
      </div>

      {vista === 'simple' && <div style={{ fontSize: 11.5, color: '#8A8FA6', marginBottom: 12 }}>Te explicamos cada número en palabras simples. ¿Inviertes como fondo (varias unidades, métricas duras)? Cambia a <b>Como fondo</b> ↑</div>}
      {/* RESUMEN EJECUTIVO · cuando es 'Como fondo', el fondo ve lo clave ARRIBA (no scrollear hasta abajo) */}
      {vista === 'institucional' && r && (
        <div className="iv4-card" style={{ marginBottom: 12, borderLeft: '4px solid #6D4AFF' }}>
          <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 8 }}>🏛️ Resumen para fondo <span style={{ fontWeight: 600, color: '#8A8FA6', fontSize: 11 }}>· lo clave de un vistazo</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(118px,1fr))', gap: 12 }}>
            {[['TIR (vende ' + f.horizonte_anios + 'a)', pct(r.tir_pct), (r.tir_pct || 0) >= 0 ? '#0E9F6E' : '#DC2626'],
            ['Cap rate', pct(r.cap_rate_pct), '#C026D3'],
            ...(capRateMercado != null ? [['vs mercado zona', `${(r.cap_rate_pct - capRateMercado) >= 0 ? '+' : ''}${(r.cap_rate_pct - capRateMercado).toFixed(1)} pts`, (r.cap_rate_pct - capRateMercado) >= 0 ? '#0E7A53' : '#DC2626']] : []),
            ...((r.credito || {}).dscr != null ? [['DSCR', r.credito.dscr, (r.credito.dscr >= 1.2 ? '#0E9F6E' : r.credito.dscr >= 1 ? '#E0A33E' : '#DC2626')]] : []),
            ...(r.escenarios && r.escenarios.pesimista ? [['TIR pesimista', pct(r.escenarios.pesimista.tir_pct), '#DC2626']] : []),
            ...((r.proyeccion || {}).payback_anio ? [['Recuperas en', `año ${r.proyeccion.payback_anio}`, '#16182A']] : []),
            ['VPN', m(r.vpn), (r.vpn || 0) >= 0 ? '#0E9F6E' : '#DC2626']].map(([l, v, c]) => (
              <div key={l}><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: c, marginTop: 2 }}>{v}</div></div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: '#A2A6BC', marginTop: 8 }}>Detalle completo (escenarios, sensibilidad, Monte Carlo, pro-forma, supuestos editables) más abajo ↓</div>
        </div>
      )}

      {/* FASE 3 · MODO PORTAFOLIO · elegir 2+ unidades del desarrollo y combinarlas (solo modo fondo) */}
      {vista === 'institucional' && devUnits && devUnits.length > 1 && (
        <div className="iv4-card" style={{ marginBottom: 12, borderTop: '4px solid #C026D3' }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>🏢 Arma tu portafolio <span style={{ fontWeight: 600, color: '#8A8FA6', fontSize: 11 }}>· compra varias unidades</span> <Info><>Un fondo casi nunca compra 1 depa — compra <b>varias</b>. Elige 2 o más de este desarrollo y las <b>combinamos</b>: inversión total, cap rate ponderado, TIR del portafolio (flujo combinado), DSCR combinado. Más el <b>descuento por volumen</b> que sueles negociar al comprar en bloque.</></Info></div>
          <div style={{ fontSize: 11.5, color: '#5B5F76', marginTop: 4, marginBottom: 12, lineHeight: 1.5 }}>Elige las unidades (2+) y mira las métricas del portafolio combinado:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {devUnits.map((u, i) => { const on = selUnits.includes(i); return (
              <button key={i} type="button" onClick={() => setSelUnits((s) => on ? s.filter((x) => x !== i) : [...s, i])} style={{ padding: '8px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', border: on ? '1.5px solid #7C5CFF' : '1px solid rgba(16,18,28,0.12)', background: on ? 'rgba(124,92,255,0.08)' : '#fff', fontFamily: 'DM Sans' }}>
                <span style={{ fontWeight: 800, fontSize: 12, color: on ? '#6D28D9' : '#16182A' }}>{on ? '✓ ' : ''}{u.label}</span>
                <span style={{ display: 'block', fontSize: 10, color: '#8A8FA6' }}>{m(u.precio)}</span>
              </button>
            ); })}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...lab, marginBottom: 0 }}>Descuento por volumen</span>
            <input type="number" step="1" min="0" max="30" value={descVol} onChange={(e) => setDescVol(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} style={{ ...inp, width: 70 }} /><span style={{ fontSize: 12, color: '#6B6F86' }}>%</span>
            <span style={{ fontSize: 10, color: '#A2A6BC' }}>lo que sueles negociar al comprar en bloque</span>
          </div>
          {selUnits.length < 2 ? (
            <div style={{ fontSize: 11, color: '#A2A6BC', marginTop: 12 }}>Elige al menos <b>2 unidades</b> para ver el portafolio combinado.</div>
          ) : port && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
                {[['Unidades', port.n_unidades, '#16182A'], ['Precio total', m(port.precio_total), '#16182A'], ['De tu bolsa (total)', m(port.inversion_total), '#7C5CFF'], ['Cap rate combinado', pct(port.cap_rate_combinado_pct), '#C026D3'], ['TIR del portafolio', pct(port.tir_portafolio_pct), (port.tir_portafolio_pct || 0) >= 0 ? '#0E9F6E' : '#DC2626'], ...(port.dscr_combinado != null ? [['DSCR combinado', port.dscr_combinado, (port.dscr_combinado >= 1.2 ? '#0E9F6E' : port.dscr_combinado >= 1 ? '#E0A33E' : '#DC2626')]] : []), ['Flujo total/mes', m(port.flujo_mensual_total), (port.flujo_mensual_total || 0) >= 0 ? '#16182A' : '#DC2626'], ['Neto al vender (total)', m(port.neto_al_vender_total), '#0E9F6E']].map(([l, v, c]) => (
                  <div key={l} style={{ padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px solid rgba(16,18,28,0.08)' }}><div style={{ fontSize: 10, color: '#6B6F86', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: c, marginTop: 2 }}>{v}</div></div>
                ))}
              </div>
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr style={{ color: '#6B6F86' }}>{['Unidad', 'Precio', 'Cap rate', 'TIR', 'Flujo/mes'].map((h, i) => <th key={h} style={{ padding: '5px 8px', fontWeight: 700, textAlign: i ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>{port.unidades.map((u, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 700 }}>{u.label}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{m(u.precio)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{pct(u.cap_rate_pct)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: (u.tir_pct || 0) >= 0 ? '#0E9F6E' : '#DC2626' }}>{pct(u.tir_pct)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: (u.flujo_mensual || 0) >= 0 ? '#16182A' : '#DC2626' }}>{m(u.flujo_mensual)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 8 }}>{port.descuento_pct > 0 ? `Precios con ${port.descuento_pct}% de descuento por volumen. ` : ''}Cap rate combinado = NOI total ÷ precio total. TIR del portafolio = del flujo combinado de todas las unidades.</div>
            </div>
          )}
        </div>
      )}

      {/* ───── RESULTADOS (ancho completo · sin columna angosta = sin huecos) ───── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Resultado grande + veredicto */}
          {r && (
            <div className="iv4-card" style={{ borderTop: `5px solid ${sem}`, background: `linear-gradient(180deg, ${sem}0D, #fff 60%)` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6B6F86', fontWeight: 700 }}>Rinde al año · solo renta<Info><><b>Cap rate.</b> Lo que te deja la renta sobre el precio <b>cada año</b>, sin contar el crédito ni la venta. Es el rendimiento <b>anual y estable</b> — no depende de cuándo vendas. <b>Tu caso:</b> {pct(r.cap_rate_pct)} (= renta neta {m(r.noi)} ÷ precio {m(f.valor_propiedad)}).</></Info></div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 36, color: '#C026D3', letterSpacing: '-0.02em', lineHeight: 1 }}>{pct(r.cap_rate_pct)}</div>
                    <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 3 }}>cap rate · cada año, sin importar cuándo vendas</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6B6F86', fontWeight: 700 }}>Si vendes al año {f.horizonte_anios}<Info><><b>TIR (con venta).</b> Junta la renta de cada año <b>+</b> la plusvalía que realizas al vender al año {f.horizonte_anios}. Por eso necesita un año de salida. Estándar Geltner & Miller / CFA. <b>Tu caso:</b> {pct(r.tir_pct)}. Toca un año en la tira de abajo para cambiarlo.</></Info></div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 36, color: sem, letterSpacing: '-0.02em', lineHeight: 1 }}>{pct(r.tir_pct)}</div>
                    <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 3 }}>TIR · renta + venta</div>
                  </div>
                </div>
                {r.veredicto && <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: sem, background: `${sem}18`, borderRadius: 9999, padding: '6px 14px' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: sem }} />{r.veredicto.nivel}</span>
                </div>}
              </div>
              {/* TIR por año de salida · clicable (responde "¿al año 1, 3, 5, 10...?") */}
              {r.proyeccion && r.proyeccion.rows && r.proyeccion.rows.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10.5, color: '#6B6F86', fontWeight: 700 }}>TIR si vendes en:</span>
                  {r.proyeccion.rows.map((row) => { const on = row.anio === Number(f.horizonte_anios); return (
                    <button key={row.anio} type="button" onClick={() => set('horizonte_anios', row.anio)} style={{ cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 8, border: 'none', background: on ? 'rgba(124,92,255,0.16)' : 'rgba(16,18,28,0.04)', color: (row.tir_si_vendes || 0) >= 0 ? (on ? '#6D28D9' : '#5B5F76') : '#DC2626' }}>{row.anio}a · {pct(row.tir_si_vendes)}</button>
                  ); })}
                </div>
              )}
              <p style={{ fontSize: 13, color: '#5B5F76', lineHeight: 1.55, marginTop: 12, marginBottom: 0 }}>{r.veredicto && r.veredicto.parrafo}</p>
              {r.renta_equilibrio_mensual && (r.flujo_mensual_1 || 0) < 0 && r.desglose && (
                <div style={{ marginTop: 10, fontSize: 11.5, color: '#8A6A1E', background: 'rgba(224,163,62,0.1)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>🎯 <b>Punto de equilibrio:</b> hoy pones ~{m(Math.abs(r.flujo_mensual_1))}/mes de tu bolsa. Para que la renta cubra TODO (no poner nada), tendría que ser ~<b>{m(r.renta_equilibrio_mensual)}/mes</b> (hoy ~{m(Math.round(r.desglose.ingreso_bruto_anual / 12))}). Alternativas: sube el enganche, alarga el plazo o negocia un mejor precio de entrada.<Info><>El <b>punto de equilibrio</b> es la renta a la que tu flujo mensual = $0 (dejas de poner de tu bolsa). Se calcula despejando: renta × (1 − vacancia − reserva − gastos%) = gastos fijos + pago del crédito. Útil para saber qué tan lejos estás de que "se pague solo".</></Info></div>
              )}
              {vista === 'simple' && <div style={{ fontSize: 10.5, color: '#A2A6BC', marginTop: 8, lineHeight: 1.5 }}>📌 <b>Cap rate</b> = lo que deja la renta al año (estable). <b>TIR</b> = renta + plusvalía si vendes (depende del año). <b>ROI</b> = ganancia total ÷ años (parecido a la TIR pero sin contar el "valor del tiempo"); lo ves abajo en las métricas.</div>}
            </div>
          )}

          {/* MÉTRICAS · separadas PARA VIVIR vs PARA INVERTIR (claridad) · con badge anual/mensual */}
          {r && vista === 'simple' && (() => {
            const BADGE = { anual: 'ANUAL', mensual: 'MENSUAL', total: 'TOTAL', venta: 'AL VENDER' };
            const Badge = ({ p }) => p ? <span style={{ fontSize: 8.5, fontWeight: 800, color: '#6B6F86', background: 'rgba(16,18,28,0.06)', borderRadius: 5, padding: '1px 6px', marginLeft: 6, verticalAlign: 'middle' }}>{BADGE[p]}</span> : null;
            const Grupo = ({ titulo, sub, items }) => (
              <div className="iv4-card" style={{ padding: '4px 0' }}>
                <div style={{ padding: '14px 20px 9px' }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: '#16182A' }}>{titulo}</div>
                  <div style={{ fontSize: 11, color: '#8A8FA6', marginTop: 2 }}>{sub}</div>
                </div>
                {items.map(([ic, l, v, c, exp, p, info], i) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 20px', borderTop: '1px solid rgba(16,18,28,0.06)' }}>
                    <span style={{ fontSize: 16, lineHeight: 1.2 }}>{ic}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: '#16182A' }}>{l}{info && <Info>{info}</Info>}<Badge p={p} /></span>
                        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: c, whiteSpace: 'nowrap' }}>{v}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#8A8FA6', lineHeight: 1.45, marginTop: 2 }}>{exp}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
            const apre = (Number(f.apreciacion_anual) * 100).toFixed(1);
            const horizonte = Number(f.horizonte_anios) || 5;
            const mesesHz = horizonte * 12;
            const gananciaPlusv1 = Math.round((Number(f.valor_propiedad) || 0) * (Number(f.apreciacion_anual) || 0));
            const deTuBolsa = r.con_credito && r.credito ? r.credito.capital_propio : (r.desglose || {}).costo_total;
            const gastosMes = (Number(f.predial || 0) + Number(f.mantenimiento || 0) + Number(f.seguro || 0)) / 12;
            const costoVivirMes = Math.round((r.con_credito && r.credito ? r.credito.pmt_mensual : 0) + gastosMes);
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, alignItems: 'start' }}>
                <Grupo titulo="📈 Si es para invertir (rentarla)" sub="Lo que importa si la vas a rentar." items={[
                  ['🔑', 'Rendimiento de la renta (cap rate)', pct(r.cap_rate_pct), '#C026D3', 'Cuánto te deja la renta sobre el precio, sin contar el crédito.', 'anual', <><b>Imagina</b> que prestas tu juguete y te dan monedas. El cap rate dice cuántas monedas te dan al año por cada 100 que vale el juguete. <b>Cómo:</b> lo que deja la renta en un año ({m(r.noi)}) ÷ precio ({m(f.valor_propiedad)}) = <b>{pct(r.cap_rate_pct)}</b>. <b>Fuente:</b> renta = promedio de la zona.</>],
                  ['💰', 'Rendimiento promedio (ROI)', pct(r.roi_anualizado_pct), '#0E9F6E', 'Tu ganancia promedio contando TODO (renta + venta), repartida en los años.', 'anual', <>Junta TODO lo que ganas (la renta + lo que sube de valor al vender) y lo reparte entre los años que lo tienes. <b>Tu caso:</b> ~<b>{pct(r.roi_anualizado_pct)}</b> al año. Es como sacar el promedio de tus calificaciones de todo el año.</>],
                  ['🏦', 'Flujo de la renta', m(r.flujo_mensual_1) + '/mes', (r.flujo_mensual_1 || 0) >= 0 ? '#0E9F6E' : '#DC2626', 'Lo que te queda (o sale de tu bolsa) cada mes tras gastos y crédito.', 'mensual', <>Es tu domingo cada mes: lo que entra de renta menos lo que sale (gastos + mensualidad del banco). <b>Tu caso:</b> <b>{m(r.flujo_mensual_1)}/mes</b>. Si es negativo (rojo), tú pones esa diferencia.</>],
                  ['✖️', 'Multiplicas tu dinero', r.equity_multiple ? `${r.equity_multiple}x` : '—', '#7C5CFF', 'Por cada peso que pones, cuántos recuperas al final.', 'total', <>Por cada <b>$1</b> que pones de tu bolsa, cuántos recuperas al final. <b>Tu caso: {r.equity_multiple}x</b> → metes $1 y al final te llevas ${r.equity_multiple}. Más de 1 = ganas; menos de 1 = pierdes.</>],
                  ['🏁', 'Neto al vender', m(r.neto_al_vender), '#16182A', 'Lo que te llevas al vender, descontando crédito, comisión e impuestos.', 'venta', <>El dinero que de verdad te llevas a la bolsa cuando vendes, ya quitando lo que debes al banco, la comisión y el impuesto (ISR). <b>Tu caso:</b> <b>{m(r.neto_al_vender)}</b> a los {horizonte} años.</>],
                ]} />
                <Grupo titulo="🏡 Si es para vivir (habitarla)" sub="Lo que importa si la vas a usar tú." items={[
                  ...(r.con_credito && r.credito ? [['💳', 'Mensualidad del crédito', m(r.credito.pmt_mensual) + '/mes', '#16182A', 'Lo que pagas al banco cada mes (capital + intereses).', 'mensual', <>Lo que le pagas al banco cada mes, fijo. <b>Tu caso:</b> <b>{m(r.credito.pmt_mensual)}/mes</b> por {r.credito.plazo_anios} años. Incluye una parte que baja tu deuda (capital) y otra que es el cobro del banco (interés).</>]] : []),
                  ['📈', 'Plusvalía (sube de valor)', `${apre}%/año`, '#0EA5E9', `Si vendieras en 1 año, tu ganancia por plusvalía sería ~${m(gananciaPlusv1)} (el ${apre}% del valor al año, fuente SHF). En ${horizonte} años acumula ~${m((r.atribucion || {}).plusvalia)}.`, 'anual', <>Tu depa vale más cada año, como un juguete que se vuelve de colección. <b>Cuánto:</b> ~<b>{apre}%</b> al año (fuente: SHF, Sociedad Hipotecaria Federal). <b>Tu caso:</b> en 1 año ganarías ~{m(gananciaPlusv1)}; en {horizonte} años ~{m((r.atribucion || {}).plusvalia)}. Ganas aunque nunca lo rentes.</>],
                  ['🏠', 'Te cuesta vivir aquí (al mes)', m(costoVivirMes), '#16182A', `Lo que de verdad te cuesta el depa cada mes: ${r.con_credito ? 'mensualidad del crédito + ' : ''}predial + mantenimiento + seguro.`, 'mensual', <>Todo lo que pagas al mes por tener y usar el depa: {r.con_credito ? <>mensualidad ({m(r.credito.pmt_mensual)}) + </> : ''}predial + mantenimiento + seguro. <b>Tu caso:</b> <b>{m(costoVivirMes)}/mes</b>. Compáralo con lo que pagas hoy de renta para ver si te conviene.</>],
                  ['🧾', r.con_credito ? 'Enganche (de tu bolsa hoy)' : 'Pago de contado', m(deTuBolsa), '#16182A', r.con_credito ? `Lo que pones HOY de tu bolsa: enganche + gastos de escrituración. El resto (${m((r.credito || {}).monto_credito)}) lo presta el banco.` : 'Como es al contado, es todo: precio + escrituración + equipamiento.', 'total', r.con_credito ? <>El dinero que necesitas <b>ahorita</b> para comprar: el enganche + los gastos de la escritura. <b>Tu caso:</b> <b>{m(deTuBolsa)}</b>. El resto ({m((r.credito || {}).monto_credito)}) lo presta el banco y lo pagas en mensualidades.</> : <>Como pagas todo de contado, necesitas el precio completo + escrituración + equipamiento = <b>{m(deTuBolsa)}</b>.</>],
                ]} />
              </div>
            );
          })()}

          {/* DETALLE DEL DINERO · entrada (desglose) + salida (venta) en par · crédito a ancho completo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 14, alignItems: 'start' }}>
          {/* DESGLOSE DEL COSTO (cómo se arma la inversión · reading flow) */}
          {r && r.desglose && (
            <div className="iv4-card">
              <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 8 }}>🧾 Cómo Se Arma La Inversión <Info><><b>Todo lo que necesitas para comprar.</b> No es solo el precio: también los <b>gastos de escrituración</b> (ISAI + notario + registro, ~8% en CDMX) y el equipamiento. <b>Costo total = precio + escrituración.</b> Si vas con crédito, "de tu bolsa hoy" = enganche + gastos; el resto lo presta el banco.</></Info></div>
              {[['Precio del inmueble', r.desglose.valor_propiedad], ['Gastos de escrituración', r.desglose.gastos_escrituracion], ...(r.desglose.equipamiento ? [['Equipamiento', r.desglose.equipamiento]] : []), ['Costo total', r.desglose.costo_total, true]].map(([l, v, tot]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: tot ? '2px solid rgba(16,18,28,0.1)' : '1px solid rgba(16,18,28,0.05)', fontSize: 12.5 }}>
                  <span style={{ color: tot ? '#16182A' : '#5B5F76', fontWeight: tot ? 800 : 600 }}>{l}</span><span style={{ fontWeight: 800, color: '#16182A' }}>{m(v)}</span>
                </div>
              ))}
              {r.desglose.escrituracion_detalle && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 800, color: '#6D4AFF' }}>¿De qué se compone la escrituración?</summary>
                  <div style={{ marginTop: 8 }}>
                    {r.desglose.escrituracion_detalle.map((e) => {
                      const inf = /ISAI/.test(e.concepto)
                        ? <><b>ISAI</b> = Impuesto Sobre Adquisición de Inmuebles. Lo cobra la <b>CDMX</b> por comprar. Es progresivo (~4-6% según el valor); aquí ~5% del precio. <b>Tu caso:</b> {m(e.monto)}. El monto exacto lo calcula el <ProyectorLink />. Fuente: Código Fiscal CDMX.</>
                        : /notario/i.test(e.concepto)
                          ? <>Honorarios del <b>notario</b> que redacta la escritura y le da validez legal. ~1.5% del valor. <b>Tu caso:</b> {m(e.monto)}. Fuente: arancel notarial CDMX.</>
                          : /Registro/i.test(e.concepto)
                            ? <>Derechos del <b>Registro Público de la Propiedad</b>: inscribe el depa a tu nombre para que sea oficialmente tuyo. ~1%. <b>Tu caso:</b> {m(e.monto)}.</>
                            : <><b>Avalúo</b> (un perito valúa el inmueble), certificados de libertad de gravamen y gestoría de trámites. ~0.5%. <b>Tu caso:</b> {m(e.monto)}.</>;
                      return (
                        <div key={e.concepto} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                          <span style={{ fontSize: 11, color: '#5B5F76' }}>{e.concepto}<Info>{inf}</Info>{e.nota && <span style={{ display: 'block', fontSize: 9.5, color: '#A2A6BC' }}>{e.nota}</span>}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#16182A', whiteSpace: 'nowrap' }}>{m(e.monto)}</span>
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 6 }}>Aproximado (~8% del precio en CDMX). El <b>ISAI</b> exacto lo calcula el <ProyectorLink />.</div>
                  </div>
                </details>
              )}
              {r.con_credito && r.credito && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 0', marginTop: 6, borderTop: '1px solid rgba(16,18,28,0.05)', fontSize: 12 }}><span style={{ color: '#6B6F86' }}>De tu bolsa hoy (enganche + gastos)</span><span style={{ fontWeight: 800, color: '#7C5CFF' }}>{m(r.credito.capital_propio)}</span></div>}
            </div>
          )}

          {/* CUANDO LO VENDAS (impuestos · reusa el ISR del Proyector de Impuestos) — par con el desglose: entrada vs salida */}
          {r && r.venta && (
            <div className="iv4-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 12.5 }}>🏁 Cuando Lo Vendas</div>
                <select value={f.horizonte_anios} onChange={(e) => set('horizonte_anios', Number(e.target.value))} style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11, color: '#6D28D9', background: 'rgba(124,92,255,0.1)', border: 'none', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>{[3, 5, 7, 10, 15, 20].map((y) => <option key={y} value={y}>si vendes a los {y} años</option>)}</select>
              </div>
              {[['Precio de venta estimado', r.venta.valor_venta, '#16182A', false, <>Lo que valdría tu depa al vender: el precio de hoy crecido por la plusvalía cada año (fuente SHF). <b>Tu caso:</b> {m(r.venta.valor_venta)} a los {r.venta.horizonte_anios} años.</>],
              ['− Comisión de venta (~5%)', -r.venta.comision, '#DC2626', false, <>Lo que cobra el asesor o la inmobiliaria por venderlo: ~5% del precio de venta. <b>Tu caso:</b> {m(r.venta.comision)}.</>],
              ['− ISR (impuesto por la ganancia)', -r.venta.isr, '#DC2626', false, <><b>ISR</b> = impuesto sobre la renta por lo que ganaste. <b>Cómo:</b> (precio de venta − lo que te costó, actualizado por inflación) × tasa de ley. Tu casa habitación puede quedar exenta. <b>Tu caso:</b> {m(r.venta.isr)}. El número fino lo da el <ProyectorLink/>.</>],
              ...(r.con_credito ? [['− Saldo que aún debes al banco', -r.venta.saldo_credito, '#DC2626', false, <>Lo que te falta por pagar del crédito a esa fecha; al vender, sale de lo que recibes. <b>Tu caso:</b> {m(r.venta.saldo_credito)}.</>]] : []),
              ['= Te llevas (neto)', r.venta.neto, '#0E9F6E', true, <>Lo que de verdad te queda en la bolsa: precio de venta − comisión − ISR{r.con_credito ? ' − lo que debes al banco' : ''}. <b>Tu caso:</b> {m(r.venta.neto)}.</>]].map(([l, v, c, tot, info]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: tot ? '2px solid rgba(16,18,28,0.1)' : '1px solid rgba(16,18,28,0.05)', fontSize: 12.5 }}>
                  <span style={{ color: tot ? '#16182A' : '#5B5F76', fontWeight: tot ? 800 : 600 }}>{l}{info && <Info>{info}</Info>}</span>
                  <span style={{ fontWeight: 800, color: c, whiteSpace: 'nowrap' }}>{m(v)}</span>
                </div>
              ))}
              <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 8, lineHeight: 1.5 }}>El <b>ISR</b> lo estima el mismo motor del <ProyectorLink /> (LISR 2026). Para el cálculo definitivo, úsalo.</div>
            </div>
          )}

          {/* CRÉDITO · ancho completo (3 secciones · es la tarjeta más detallada) */}
          {/* CRÉDITO · UI en 3 secciones (reparto del precio · tu pago + split capital/interés · todo el plazo) */}
          {r && r.con_credito && r.credito && r.credito.pmt_mensual && (() => {
            const cr = r.credito;
            const precio = (r.desglose || {}).valor_propiedad || Number(f.valor_propiedad) || 0;
            const engPuro = precio - cr.monto_credito;
            const capPct = cr.pago_anual ? Math.max(0, Math.min(100, Math.round((cr.capital_anio1 / cr.pago_anual) * 100))) : 0;
            const Tile = ({ l, v, c, exp }) => (
              <div style={{ padding: '11px 13px', borderRadius: 12, background: '#fff', border: '1px solid rgba(16,18,28,0.09)', boxShadow: '0 2px 8px rgba(99,102,241,0.04)' }}><div style={{ fontSize: 10, color: '#6B6F86', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: c || '#16182A', marginTop: 3 }}>{v}</div>{exp && <div style={{ fontSize: 9.5, color: '#A2A6BC', lineHeight: 1.4, marginTop: 3 }}>{exp}</div>}</div>
            );
            const Sub = ({ children }) => <div style={{ fontSize: 10, fontWeight: 800, color: '#9499AE', textTransform: 'uppercase', letterSpacing: '.05em', margin: '16px 0 10px' }}>{children}</div>;
            return (
              <div className="iv4-card" style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>💳 Tu Crédito Hipotecario <span style={{ fontWeight: 600, color: '#8A8FA6', fontSize: 11 }}>· {cr.plazo_anios} años · tasa {pct(cr.tasa_anual_pct)}</span> <Info><><b>Tu hipoteca, explicada.</b> El banco pone una parte (te presta) y tú el enganche. Cada mes pagas una mensualidad fija que se divide en <b>capital</b> (baja tu deuda) e <b>interés</b> (el cobro del banco). Al principio casi todo es interés. <b>Cómo se calcula:</b> amortización francesa con la tasa de Banxico. Tasa/mensualidad finales las define tu banco.</></Info></div>
                {/* controles aquí mismo · cambia sin subir (quita fricción) */}
                <div className="iv4-noprint" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10, padding: '10px 12px', background: 'rgba(124,92,255,0.05)', borderRadius: 10 }}>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700, marginBottom: 3 }}>Enganche</div><select value={f.ltv} onChange={(e) => set('ltv', Number(e.target.value))} style={{ ...inp, padding: '6px 9px', width: 'auto', fontSize: 12 }}>{[10, 20, 30, 40, 50, 60, 70, 80, 90].map((e) => <option key={e} value={(100 - e) / 100}>{e}%</option>)}</select></div>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700, marginBottom: 3 }}>Plazo</div><select value={f.plazo_meses} onChange={(e) => set('plazo_meses', Number(e.target.value))} style={{ ...inp, padding: '6px 9px', width: 'auto', fontSize: 12 }}>{[[36, '3 años'], [60, '5 años'], [84, '7 años'], [120, '10 años'], [180, '15 años'], [240, '20 años'], [300, '25 años']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700, marginBottom: 3 }}>Tasa anual %</div><input type="text" inputMode="decimal" placeholder="11.45" value={f.tasa_anual} onChange={(e) => set('tasa_anual', e.target.value.replace(/[^\d.]/g, ''))} style={{ ...inp, padding: '6px 9px', width: 80, fontSize: 12 }} /></div>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700, marginBottom: 3 }}>Abono extra/mes</div><input type="text" inputMode="numeric" value={m(f.abono_capital_mensual)} onChange={(e) => set('abono_capital_mensual', String(e.target.value).replace(/[^\d]/g, ''))} style={{ ...inp, padding: '6px 9px', width: 110, fontSize: 12 }} /></div>
                  <div style={{ fontSize: 9.5, color: '#A2A6BC', alignSelf: 'center' }}>↻ edítalo aquí, sin subir</div>
                </div>

                <Sub>Cómo se reparte el precio</Sub>
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
                  {[['Precio del depa', precio, '#16182A'], ['=', null], ['Tu enganche', engPuro, '#7C5CFF'], ['+', null], ['Te prestan', cr.monto_credito, '#0E9F6E']].map(([l, v, c], i) => (
                    v === null ? <div key={i} style={{ alignSelf: 'center', fontSize: 20, fontWeight: 800, color: '#C9CCDB' }}>{l}</div>
                      : <div key={i} style={{ flex: '1 1 110px', padding: '10px 12px', borderRadius: 10, background: 'rgba(16,18,28,0.03)' }}><div style={{ fontSize: 10, color: '#6B6F86', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: c, marginTop: 2 }}>{m(v)}</div></div>
                  ))}
                </div>

                <Sub>Tu pago</Sub>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
                  <Tile l="Mensualidad" v={m(cr.pmt_mensual) + '/mes'} exp="Pago fijo al banco (capital + intereses)." />
                  <Tile l="Pago anual" v={m(cr.pago_anual)} exp="Lo que pagas al banco en un año." />
                  <Tile l="Tasa anual / mensual" v={`${pct(cr.tasa_anual_pct)} · ${pct(cr.tasa_mensual_pct)}`} />
                  <Tile l="La renta cubre" v={pct(cr.cobertura_renta_pct)} c={(cr.cobertura_renta_pct || 0) >= 100 ? '#0E9F6E' : '#DC2626'} exp="Cuánto de la mensualidad paga la renta." />
                </div>
                <div style={{ marginTop: 12, padding: '11px 13px', background: 'rgba(16,18,28,0.03)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#5B5F76', marginBottom: 7 }}>De tu pago anual (<b>{m(cr.pago_anual)}</b>), en el <b>primer año</b>:</div>
                  <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 7 }}>
                    <div style={{ width: `${capPct}%`, background: '#7C5CFF' }} /><div style={{ width: `${100 - capPct}%`, background: '#DC2626' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, fontWeight: 700, flexWrap: 'wrap' }}>
                    <span style={{ color: '#7C5CFF' }}>🟪 {m(cr.capital_anio1)} a capital ({capPct}%)</span>
                    <span style={{ color: '#DC2626' }}>🟥 {m(cr.interes_anio1)} a interés ({100 - capPct}%)</span>
                  </div>
                  <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 6 }}>Al principio casi todo es interés; con los años, cada vez más se va a capital (baja tu deuda).</div>
                </div>

                {/* AÑO POR AÑO · justo debajo del primer año, visible (no escondido) */}
                {cr.tabla_anual && cr.tabla_anual.length > 0 && (
                  <details style={{ marginTop: 12, border: '1px solid rgba(124,92,255,0.25)', borderRadius: 10, background: 'rgba(124,92,255,0.04)', padding: '10px 13px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#6D28D9' }}>📅 ¿Y el 2°, 3°… año? Velo año por año hasta liquidar</summary>
                    <div style={{ overflowX: 'auto', marginTop: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr style={{ color: '#6B6F86' }}>{['Año', 'A capital', 'A interés', 'Te falta (saldo)'].map((h, i) => <th key={h} style={{ padding: '5px 8px', fontWeight: 700, textAlign: i ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                        <tbody>{cr.tabla_anual.map((row) => { const tot = row.capital + row.interes; const capPc = tot ? Math.round(row.capital / tot * 100) : 0; return (
                          <tr key={row.anio} style={{ borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                            <td style={{ padding: '5px 8px', fontWeight: 700 }}>{row.anio}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: '#7C5CFF', fontWeight: 700 }}>{m(row.capital)} <span style={{ color: '#A2A6BC', fontWeight: 500 }}>({capPc}%)</span></td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: '#DC2626' }}>{m(row.interes)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>{m(row.saldo_fin)}</td>
                          </tr>); })}</tbody>
                      </table>
                    </div>
                    <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 8 }}>Año con año el interés baja y el capital sube, hasta que el saldo llega a $0 (queda libre).</div>
                  </details>
                )}

                <Sub>En todo el plazo ({cr.plazo_anios} años)</Sub>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
                  <Tile l="Capital (préstamo)" v={m(cr.monto_credito)} c="#7C5CFF" exp="El préstamo que le regresas al banco." />
                  <Tile l="Interés total" v={m(cr.interes_total)} c="#DC2626" exp={`Solo intereses en ${cr.plazo_anios} años. Por eso conviene liquidar o vender antes.`} />
                  <Tile l="Monto total" v={m(cr.pago_total_plazo)} exp="Préstamo + todos los intereses = todo lo que le das al banco." />
                </div>

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(16,18,28,0.07)', fontSize: 10.5, color: '#9499AE', lineHeight: 1.55 }}>
                  Estimación para decidir con claridad. Tu tasa y mensualidad finales las define el banco según tu perfil (análisis de crédito y capacidad de pago).
                </div>

                {cr.abono && (
                  <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(14,159,110,0.08)', borderRadius: 10, fontSize: 11.5, color: '#0E7A53', lineHeight: 1.5 }}>
                    💸 Con tu abono extra de <b>{m(cr.abono.abono_mensual)}/mes</b>: liquidas en <b>{cr.abono.anios_payoff} años</b> (−{cr.abono.anios_ahorrados} años) y ahorras <b>{m(cr.abono.interes_ahorrado)}</b> de intereses.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>


      {/* ───── SECCIONES VISUALES · ancho completo apiladas (sin columnas angostas = sin huecos) ───── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          {/* LARGO PLAZO vs AIRBNB */}
          {r && r.comparar_renta && r.comparar_renta.largo && (() => {
            const cmp = r.comparar_renta;
            const Opcion = ({ icon, titulo, x, comoIngreso, fuente, win, headInfo, gastosInfo }) => (
              <div style={{ flex: '1 1 240px', padding: '15px 16px', borderRadius: 14, background: win ? 'rgba(124,92,255,0.06)' : 'rgba(16,18,28,0.03)', border: win ? '1.5px solid #7C5CFF' : '1px solid rgba(16,18,28,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#16182A' }}>{icon} {titulo}<Info>{headInfo}</Info></div>
                  {win && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#6D28D9', background: 'rgba(124,92,255,0.14)', borderRadius: 6, padding: '2px 8px' }}>GANA</span>}
                </div>
                <div style={{ marginTop: 11, fontSize: 11.5, color: '#5B5F76', lineHeight: 1.5 }}>
                  <div>Ingreso: <b>{m(x.ingreso_anual)}/año</b><Info><>Todo lo que entra de renta en un año, <b>antes</b> de gastos. {comoIngreso}. <b>Tu caso:</b> {m(x.ingreso_anual)}/año.</></Info></div>
                  <div style={{ fontSize: 10.5, color: '#A2A6BC' }}>{comoIngreso}</div>
                  <div style={{ marginTop: 5 }}>− Gastos del año: <b style={{ color: '#DC2626' }}>{m(x.egresos_anual)}</b><Info>{gastosInfo}</Info></div>
                  <div style={{ marginTop: 5, paddingTop: 6, borderTop: '1px dashed rgba(16,18,28,0.14)' }}>= Te queda: <b style={{ color: '#0E9F6E' }}>{m(x.noi)}/año</b><Info><>El <b>NOI</b>: ingreso − gastos. Lo que deja la propiedad antes del crédito y de impuestos. <b>Tu caso:</b> {m(x.ingreso_anual)} − {m(x.egresos_anual)} = {m(x.noi)}/año.</></Info></div>
                </div>
                <div style={{ marginTop: 11, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700 }}>Renta al año (cap rate)<Info><>Lo que deja la renta sobre el precio cada año, sin contar venta ni crédito. Estable. <b>Tu caso:</b> {pct(x.cap_rate_pct)}.</></Info></div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: '#C026D3' }}>{pct(x.cap_rate_pct)}</div></div>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700 }}>Si vendes (TIR)<Info><>Rendimiento anual juntando renta + plusvalía si vendes al año {f.horizonte_anios}. <b>Tu caso:</b> {pct(x.tir_pct)}.</></Info></div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: (x.tir_pct || 0) >= 0 ? '#0E9F6E' : '#DC2626' }}>{pct(x.tir_pct)}</div></div>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700 }}>Te queda al mes<Info><>Lo que te sobra (o pones de tu bolsa) cada mes: ingreso − gastos − mensualidad del crédito, dividido entre 12. <b>Tu caso:</b> {m(x.flujo_mensual)}/mes.</></Info></div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: (x.flujo_mensual || 0) >= 0 ? '#16182A' : '#DC2626', marginTop: 2 }}>{m(x.flujo_mensual)}</div></div>
                </div>
                <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 8 }}>Ingreso según: {fuente}</div>
              </div>
            );
            return (
              <div className="iv4-card" style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>🏨 ¿Rentar fijo o por Airbnb?</div>
                <div style={{ fontSize: 11.5, color: '#5B5F76', marginTop: 4, marginBottom: 12, lineHeight: 1.5 }}>Con el MISMO depa comparamos dos formas de rentarlo: a un inquilino todo el año (<b>largo plazo</b>) o por noches en <b>Airbnb</b> (corto). Cada número trae su <b>?</b> con el detalle. Ojo: <b>Airbnb gasta más</b> (limpieza, plataforma, gestión) — ya está considerado.</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Opcion icon="🏠" titulo="Largo plazo" x={cmp.largo} win={cmp.gana === 'largo'} comoIngreso={`${m(cmp.largo.ingreso_mensual)}/mes × 12 meses`} fuente="promedio de renta de la zona"
                    headInfo={<><b>Rentas a UN inquilino todo el año</b> (contrato ~12 meses). Más <b>estable</b> y con <b>menos trabajo</b>: no limpias entre huéspedes ni dependes de la temporada. Suele dejar menos que Airbnb, pero sin broncas.</>}
                    gastosInfo={<><b>Gastos de renta larga:</b> predial + mantenimiento + seguro + administración. <b>Tu caso:</b> {m(cmp.largo.egresos_anual)}/año. NO trae los costos extra de Airbnb.</>} />
                  <Opcion icon="🏨" titulo="Airbnb / corto" x={cmp.corto} win={cmp.gana === 'corto'} comoIngreso={`${m(cmp.corto.tarifa_noche)}/noche × ~${cmp.corto.noches_mes} noches al mes (${cmp.corto.ocupacion_pct}% ocupación) × 12`} fuente="AirROI (datos reales de la zona)"
                    headInfo={<><b>Rentas por NOCHES en Airbnb.</b> Suele <b>dejar más</b>, pero da <b>más trabajo</b> (limpieza entre huéspedes, atención, temporada baja) y <b>más gastos</b>. Ingreso = tarifa por noche × noches ocupadas × 12. Tarifa y ocupación reales de <b>AirROI</b>.</>}
                    gastosInfo={<><b>Gastos de Airbnb:</b> los de renta larga (predial, mantenimiento…) <b>MÁS</b> los propios del corto plazo: <b>comisión de plataforma, limpieza, servicios</b> (luz/internet/agua), <b>gestión</b> y reposición — estimados en <b>~22% del ingreso</b>. Por eso Airbnb gasta más que renta larga. <b>Tu caso:</b> {m(cmp.corto.egresos_anual)}/año.</>} />
                </div>
                <div style={{ marginTop: 12, padding: '11px 13px', background: 'rgba(124,92,255,0.06)', borderRadius: 10, fontSize: 11.5, color: '#5B5F76', lineHeight: 1.55 }}>
                  👉 Con tus datos <b style={{ color: '#6D28D9' }}>gana {cmp.gana === 'corto' ? 'Airbnb' : 'largo plazo'}</b> (deja más al año, <b>ya descontados</b> sus mayores gastos). <b>Airbnb</b> rinde más pero da más trabajo; <b>largo plazo</b> rinde menos pero es estable y sin broncas. Toca cada <b>?</b> para ver de dónde sale el número.
                </div>
              </div>
            );
          })()}

          {/* Cascada visual · de dónde viene tu ganancia */}
          {r && r.atribucion && (() => {
            const a = r.atribucion; const tot = (a.renta_neta_acum || 0) + (a.equity_buildup || 0) + (a.plusvalia || 0);
            const segs = [['Renta', a.renta_neta_acum, '#0E9F6E'], ['Patrimonio', a.equity_buildup, '#7C5CFF'], ['Plusvalía', a.plusvalia, '#C026D3']].filter(([, v]) => (v || 0) > 0);
            return (
              <div className="iv4-card">
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 10 }}>De dónde viene tu ganancia <span style={{ fontWeight: 700, color: '#16182A' }}>· {m(tot)}</span><Info><>Tu ganancia total sale de 3 cosas: <b>Renta</b> (lo que junta de rentas, ya sin gastos), <b>Patrimonio</b> (lo que pagaste del crédito y ya es tuyo) y <b>Plusvalía</b> (lo que subió de valor el depa). La barra muestra cuánto pone cada una. <b>Tu caso:</b> total {m(tot)}.</></Info></div>
                <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
                  {segs.map(([l, v, c]) => <div key={l} title={`${l}: ${m(v)}`} style={{ width: `${tot ? (v / tot) * 100 : 0}%`, background: c }} />)}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {segs.map(([l, v, c]) => <div key={l} style={{ fontSize: 11.5, color: '#5B5F76' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: c, marginRight: 5 }} />{l} <b style={{ color: '#16182A' }}>{m(v)}</b></div>)}
                </div>
              </div>
            );
          })()}

          {/* TABLA COMPARATIVA OBJETIVA · Pentágono de las Inversiones (rendimiento/riesgo/liquidez/plazo/dedicación) */}
          {r && r.instrumentos && r.instrumentos.length > 0 && (() => {
            const inmueble = { nombre: 'Este inmueble', pct: r.tir_pct, riesgo: 'Medio-bajo', liquidez: 'Baja', plazo: `Medio-largo (${f.horizonte_anios} años)`, esfuerzo: 'Media', ticket: 'Enganche', inflacion: 'Sí (real)', respaldo: 'Escritura + RPP', ejemplos: 'tu depa', hero: true };
            const filas = [inmueble, ...r.instrumentos];
            const cols = [
              ['Rendimiento', (x) => x.pct == null ? '—' : pct(x.pct), <>Cuánto te da al año. En tu depa es la <b>TIR si vendes al año {f.horizonte_anios}</b> (renta + plusvalía al vender, {pct(r.tir_pct)}); en los demás, su tasa anual típica. Fuente: Banxico/BMV.</>],
              ['Riesgo', (x) => x.riesgo || '—', <>Qué tan probable es perder. CETES = muy bajo (lo respalda el gobierno); Bolsa = alto (sube y baja). Bien raíz = medio-bajo.</>],
              ['Liquidez', (x) => x.liquidez || '—', <>Qué tan rápido lo conviertes en efectivo. CETES en días (alta); un depa tarda <b>meses</b> en venderse (baja).</>],
              ['Plazo', (x) => x.plazo || '—', <>Horizonte recomendado para que rinda bien. CETES = corto; bolsa y bien raíz = largo. Si necesitas el dinero pronto, importa.</>],
              ['Dedicación', (x) => x.esfuerzo || '—', <>Cuánto tiempo/trabajo te exige. CETES = nula (lo dejas y ya); un depa en renta = media (inquilinos, mantenimiento), salvo que pongas administrador.</>],
              ['Mínimo', (x) => x.ticket || '—', <>Cuánto necesitas para empezar. CETES desde $100; un depa necesita el enganche (cientos de miles).</>],
              ['Respaldo', (x) => x.respaldo || '—', <>Quién protege tu dinero si algo sale mal. Banco/SOFIPO = seguro IPAB; gobierno = CETES/Udibonos; acciones/FIBRAs = regulación CNBV; <b>cripto = nadie</b> (sin garantía). El inmueble lo respalda tu escritura inscrita en el Registro Público.</>],
              ['Inflación', (x) => x.inflacion || '—', <>Si protege tu dinero del alza de precios. Bien raíz y bolsa suelen ganarle; CETES solo en parte; UDIBONOS van atados a la inflación.</>],
            ];
            return (
              <div className="iv4-card">
                <div style={{ fontWeight: 800, fontSize: 13 }}>📊 Tu inmueble vs otras inversiones</div>
                <div style={{ fontSize: 11.5, color: '#5B5F76', marginTop: 4, marginBottom: 12, lineHeight: 1.5 }}>Comparación con criterios <b>objetivos</b> (el <b>Pentágono de las Inversiones</b>: rendimiento · riesgo · liquidez · plazo · dedicación). Ninguna gana en todo — elige según lo que necesitas. Abajo se explica cada columna.</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead><tr style={{ color: '#6B6F86' }}>
                      <th style={{ padding: '7px 8px', fontWeight: 700, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap' }}>Opción</th>
                      {cols.map(([l]) => <th key={l} style={{ padding: '7px 8px', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>{l}</th>)}
                    </tr></thead>
                    <tbody>{filas.map((x, fi) => (
                      <tr key={fi} style={{ borderTop: '1px solid rgba(16,18,28,0.06)', background: x.hero ? 'rgba(124,92,255,0.07)' : 'transparent' }}>
                        <td style={{ padding: '8px', fontWeight: 800, color: x.hero ? '#6D28D9' : '#16182A', position: 'sticky', left: 0, background: x.hero ? '#F3EFFF' : '#fff', whiteSpace: 'nowrap' }}>{x.hero ? '🏠 ' : ''}{x.nombre}{x.ejemplos && !x.hero ? <span style={{ display: 'block', fontSize: 9, fontWeight: 600, color: '#A2A6BC' }}>ej. {x.ejemplos}</span> : null}</td>
                        {cols.map(([l, get], ci) => <td key={l} style={{ padding: '8px', whiteSpace: 'nowrap', color: ci === 0 ? (x.hero ? '#6D28D9' : '#16182A') : '#5B5F76', fontWeight: ci === 0 ? 800 : 600 }}>{get(x)}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {/* LEYENDA visible (los globitos se cortaban dentro del scroll) — qué significa cada columna */}
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(16,18,28,0.025)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#16182A', marginBottom: 8 }}>📖 Qué significa cada columna</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
                    {cols.map(([l, , leg]) => <div key={l} style={{ fontSize: 10.5, color: '#5B5F76', lineHeight: 1.5 }}><b style={{ color: '#6D28D9' }}>{l}:</b> {leg}</div>)}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: '#5B5F76', marginTop: 12, padding: '10px 12px', background: 'rgba(124,92,255,0.05)', borderRadius: 10, lineHeight: 1.55 }}>💡 <b>Lo que solo el bien raíz te da</b> (fuera de estos ejes): se compra <b>a crédito</b> (apalancas con dinero del banco), es un <b>activo físico</b> que controlas, y te da <b>renta mensual</b> mientras sube de valor. Por eso se usa para diversificar, no para reemplazar a CETES o la bolsa.</div>
                <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 8, lineHeight: 1.5 }}>Fuentes: <b>Banxico</b> (CETES, tasas), <b>BMV</b> (FIBRAs, bolsa), <b>SHF</b> (plusvalía). Rendimientos de referencia jun-2026, no garantizados.</div>
              </div>
            );
          })()}

          {/* RADAR · Pentágono de las inversiones (perfil visual en 5 ejes) */}
          {r && r.instrumentos && r.instrumentos.length > 0 && (() => {
            const RI = { 'Muy bajo': 1, 'Bajo': 2, 'Medio-bajo': 2.5, 'Medio': 3, 'Medio-alto': 4, 'Alto': 4.5, 'Muy alto': 5 };
            const LI = { 'Nula': 0.4, 'Nula (retiro)': 0.4, 'Baja': 1.5, 'Media': 3, 'Alta': 5 };
            const DE = { 'Nulo': 0.4, 'Bajo': 1.5, 'Medio': 3, 'Media': 3, 'Alto': 5 };
            const plazoScore = (p) => /muy largo/i.test(p) ? 5 : /largo/i.test(p) ? 4.3 : /medio/i.test(p) ? 3 : /corto/i.test(p) ? 1.6 : 3;
            const score = (v) => ({ Rendimiento: Math.max(0.2, Math.min(5, (v.pct || 0) / 5)), Riesgo: RI[v.riesgo] || 3, Liquidez: LI[v.liquidez] || 3, Plazo: plazoScore(v.plazo || ''), Dedicación: DE[v.esfuerzo] || 3 });
            const inm = { pct: r.tir_pct, riesgo: 'Medio-bajo', liquidez: 'Baja', plazo: 'medio-largo', esfuerzo: 'Media' };
            const comp = r.instrumentos.find((i) => i.k === radarK) || r.instrumentos.find((i) => i.k === 'bolsa') || r.instrumentos[0];
            const sI = score(inm), sC = score(comp);
            const axes = ['Rendimiento', 'Riesgo', 'Liquidez', 'Plazo', 'Dedicación'];
            const cx = 150, cy = 140, R = 95;
            const pt = (i, val) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; const rr = R * (val / 5); return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
            const polyOf = (s) => axes.map((ax, i) => pt(i, s[ax]).join(',')).join(' ');
            const grid = (lvl) => axes.map((_, i) => pt(i, lvl).join(',')).join(' ');
            return (
              <div className="iv4-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>🕸️ Pentágono de las inversiones <Info><>Toda inversión se mide por 5 ejes: <b>rendimiento, riesgo, liquidez, plazo y dedicación</b>. El radar muestra el <b>perfil</b> (la forma) de tu inmueble contra otra inversión. Ninguna llena los 5 — cada una tiene su forma. Marco del Pentágono de las inversiones.</></Info></div>
                  <select value={radarK} onChange={(e) => setRadarK(e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 10px', fontSize: 12 }}>{r.instrumentos.map((i) => <option key={i.k} value={i.k}>vs {i.nombre}</option>)}</select>
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                  <svg viewBox="-34 0 368 290" style={{ width: 310, maxWidth: '100%' }}>
                    {[1, 2, 3, 4, 5].map((l) => <polygon key={l} points={grid(l)} fill="none" stroke="#E7E9F1" strokeWidth="1" />)}
                    {axes.map((_, i) => { const [x, y] = pt(i, 5); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#E7E9F1" strokeWidth="1" />; })}
                    <polygon points={polyOf(sC)} fill="rgba(148,153,174,0.22)" stroke="#9499AE" strokeWidth="2" />
                    <polygon points={polyOf(sI)} fill="rgba(124,92,255,0.20)" stroke="#7C5CFF" strokeWidth="2.5" />
                    {axes.map((ax, i) => { const [x, y] = pt(i, 5.82); const anc = x < cx - 10 ? 'end' : x > cx + 10 ? 'start' : 'middle'; return <text key={ax} x={x} y={y} fontSize="10.5" fontWeight="700" fill="#5B5F76" textAnchor={anc} dominantBaseline="middle">{ax}</text>; })}
                  </svg>
                  <div style={{ fontSize: 11.5, lineHeight: 1.6, flex: '1 1 180px' }}>
                    <div><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: '#7C5CFF', marginRight: 6 }} /><b>Tu inmueble</b> (TIR {pct(r.tir_pct)})</div>
                    <div style={{ marginTop: 4 }}><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: '#9499AE', marginRight: 6 }} />{comp.nombre} ({pct(comp.pct)})</div>
                    <div style={{ fontSize: 10, color: '#A2A6BC', marginTop: 10, lineHeight: 1.55 }}>Más hacia afuera = más de ese atributo. En <b>Rendimiento</b> y <b>Liquidez</b>, más es mejor. En <b>Riesgo</b>, <b>Plazo</b> y <b>Dedicación</b>, más = más riesgo / más tiempo comprometido / más trabajo (tú decides qué te conviene).</div>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>{/* fin grid visual */}

          {/* PROYECCIÓN AÑO A AÑO + cuándo salir (tabla + gráfica · ancho completo) */}
          {r && r.proyeccion && r.proyeccion.rows && r.proyeccion.rows.length > 0 && (
            <div className="iv4-card">
              <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 4 }}>📅 Tu Inversión Año Con Año <Info><><b>Cómo leerla:</b> cada renglón es un año. <b>Valor</b> = cuánto valdrá el depa. <b>Renta/mes</b> = lo que paga el inquilino. <b>Ganancia/año</b> = renta menos gastos. <b>Mensualidad</b> = lo que pagas al banco. <b>Diferencial</b> = lo que te queda o pones de tu bolsa al mes. <b>TIR si vendes</b> = cuánto te rindió si vendes ese año.</></Info></div>
              <div style={{ fontSize: 11.5, color: '#6B6F86', marginBottom: 6, lineHeight: 1.45 }}>{r.proyeccion.recomendacion}<Info><><b>¿Cómo decidimos el mejor año para salir?</b> NO es "la TIR más alta" (eso siempre premia esperar, porque los costos de comprar/vender se reparten en más años). Usamos la regla de <b>retorno marginal de retención</b>: te conviene quedártelo mientras retenerlo un año más te rinda (renta sobre su valor actual + plusvalía) <b>más que tu tasa de oportunidad</b> (CETES + prima de riesgo ≈ {r.proyeccion.hurdle_pct}%). Cuando cae por debajo, conviene vender y reinvertir. <b>Depende de:</b> plusvalía esperada, qué tan rápido sube la renta, tasas, y si necesitas el dinero. <b>Fuente:</b> {r.proyeccion.bibliografia}</></Info></div>
              {r.proyeccion.bibliografia && <div style={{ fontSize: 9.5, color: '#A2A6BC', marginBottom: 12, fontStyle: 'italic' }}>Método: retorno marginal de retención vs tu tasa de oportunidad (~{r.proyeccion.hurdle_pct}%). Fuente: {r.proyeccion.bibliografia}</div>}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56, marginBottom: 12 }}>
                {r.proyeccion.rows.map((row) => { const mx = Math.max(...r.proyeccion.rows.map((x) => x.valor || 0)) || 1; const best = row.anio === r.proyeccion.mejor_anio; return (
                  <div key={row.anio} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <div style={{ width: '70%', height: `${Math.max(6, (row.valor / mx) * 44)}px`, background: best ? 'linear-gradient(180deg,#6D4AFF,#C026D3)' : '#C7CAD6', borderRadius: '4px 4px 0 0' }} title={m(row.valor)} />
                    <div style={{ fontSize: 9, color: best ? '#6D28D9' : '#8A8FA6', fontWeight: best ? 800 : 600, marginTop: 4 }}>{row.anio}a</div>
                  </div>
                ); })}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead><tr style={{ color: '#6B6F86' }}>{['Año', 'Valor', 'Plusvalía', 'Renta/Mes', 'Ganancia/Año', 'Mensualidad', 'Diferencial', 'TIR Si Vendes'].map((h, i) => <th key={h} style={{ padding: '6px 5px', fontWeight: 700, textAlign: i ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>{r.proyeccion.valor_compra ? <tr style={{ borderTop: '1px solid rgba(16,18,28,0.06)', background: 'rgba(16,18,28,0.02)' }}>
                    <td style={{ padding: '7px 5px', fontWeight: 800, color: '#16182A' }}>0 · compra</td>
                    <td style={{ padding: '7px 5px', textAlign: 'right', fontWeight: 700 }}>{m(r.proyeccion.valor_compra)}</td>
                    <td colSpan={6} style={{ padding: '7px 5px', textAlign: 'right', color: '#A2A6BC', fontSize: 10.5 }}>lo que inviertes al entrar (precio + escrituración)</td>
                  </tr> : null}
                  {r.proyeccion.rows.map((row) => { const best = row.anio === r.proyeccion.mejor_anio; const dif = row.diferencial_mensual || 0; return (
                    <tr key={row.anio} style={{ borderTop: '1px solid rgba(16,18,28,0.06)', background: best ? 'rgba(124,92,255,0.07)' : 'transparent' }}>
                      <td style={{ padding: '7px 5px', fontWeight: 800, color: best ? '#6D28D9' : '#16182A' }}>{row.anio}{best ? ' ⭐' : ''}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right' }}>{m(row.valor)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', color: '#0E9F6E' }}>+{m(row.plusvalia_acum)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right' }}>{m(row.renta_bruta_mensual)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right' }}>{m(row.noi_anual)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', color: '#8A8FA6' }}>{row.mensualidad_credito ? m(row.mensualidad_credito) : '—'}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', fontWeight: 700, color: dif >= 0 ? '#0E9F6E' : '#DC2626' }}>{m(dif)}/mes</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', fontWeight: 800, color: (row.tir_si_vendes || 0) >= 0 ? '#7C5CFF' : '#DC2626' }}>{pct(row.tir_si_vendes)}</td>
                    </tr>
                  ); })}</tbody>
                </table>
              </div>
              <div style={{ fontSize: 9.5, color: '#A2A6BC', fontStyle: 'italic', marginTop: 8 }}>⭐ = el mejor año para salir (TIR máxima). <b style={{ color: '#DC2626' }}>Diferencial en rojo</b> = pones de tu bolsa al mes (la renta aún no cubre el crédito); <b style={{ color: '#0E9F6E' }}>en verde</b> = te sobra. La mensualidad es fija y la renta sube cada año, así que con el tiempo mejora.</div>
            </div>
          )}

          {/* Alertas */}
          {r && r.alertas && Object.values(r.alertas).some(Boolean) && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {r.alertas.coc_negativo && <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', borderRadius: 8, padding: '5px 10px' }}>⚠️ Sale de tu bolsa</span>}
              {r.alertas.dscr_bajo_1 && <span style={{ fontSize: 11, fontWeight: 700, color: '#E0A33E', background: 'rgba(224,163,62,0.1)', borderRadius: 8, padding: '5px 10px' }}>⚠️ Renta no cubre el crédito</span>}
              {r.alertas.cap_bajo_cetes && <span style={{ fontSize: 11, fontWeight: 700, color: '#E0A33E', background: 'rgba(224,163,62,0.1)', borderRadius: 8, padding: '5px 10px' }}>⚠️ Renta rinde menos que CETES</span>}
            </div>
          )}

      {vista === 'institucional' && r && (() => {
        const cr = r.credito || {};
        const dif = (r.tir_pct || 0) - (r.tir_desapalancada_pct || 0);
        const mets = [
          ['Cap rate', pct(r.cap_rate_pct), '#C026D3', <>Renta neta ÷ precio. El rendimiento <b>anual</b> de la renta, sin contar el crédito. <b>Tu caso:</b> {pct(r.cap_rate_pct)}.</>],
          ['TIR (con crédito)', pct(r.tir_pct), '#6D28D9', <>Rendimiento anual total <b>apalancado</b> (renta + plusvalía) si vendes al año {f.horizonte_anios}. <b>Tu caso:</b> {pct(r.tir_pct)}.</>],
          ['TIR al contado', pct(r.tir_desapalancada_pct), '#16182A', <>La TIR si compraras <b>sin crédito</b>. Compárala con la de arriba: la diferencia es el efecto del apalancamiento.</>],
          ['MIRR', pct(r.mirr_pct), '#16182A', <><b>TIR modificada</b>, más realista: asume que reinviertes los flujos a una tasa normal, no a la propia TIR (que suele inflar el número). Por eso suele ser menor que la TIR.</>],
          ['VPN', m(r.vpn), (r.vpn || 0) >= 0 ? '#0E9F6E' : '#DC2626', <><b>Valor Presente Neto:</b> cuánto ganas (o pierdes) <b>hoy</b>, en pesos de hoy, por encima de tu tasa de oportunidad ({pct(r.tasa_descuento_pct)}). Positivo = crea valor. <b>Tu caso:</b> {m(r.vpn)}.</>],
          ['ROI real', pct(r.roi_real_pct), '#16182A', <>Rendimiento <b>ya quitando la inflación</b> — tu poder de compra real. El nominal se ve más alto pero compra menos.</>],
          ['Cash-on-cash', pct(r.cash_on_cash_pct), '#16182A', <>Flujo del <b>primer año</b> ÷ lo que pusiste de tu bolsa. El "efectivo sobre efectivo" — cuánto te regresa en cash el año 1.</>],
          ['Multiplicas', r.equity_multiple ? `${r.equity_multiple}x` : '—', '#7C5CFF', <>Por cada <b>$1</b> que pones de tu bolsa, cuántos recuperas al final (renta + venta). <b>Tu caso:</b> {r.equity_multiple}x.</>],
          ...(cr.dscr != null ? [['DSCR', cr.dscr, (cr.dscr >= 1.2 ? '#0E9F6E' : cr.dscr >= 1 ? '#E0A33E' : '#DC2626'), <><b>Cobertura del crédito</b> (Debt Service Coverage Ratio): NOI ÷ pago anual al banco. Mayor a 1 = la renta cubre el crédito; los bancos suelen pedir <b>≥1.2</b>. <b>Tu caso:</b> {cr.dscr}.</>]] : []),
          ...(cr.debt_yield_pct != null ? [['Debt yield', pct(cr.debt_yield_pct), '#16182A', <>NOI ÷ monto del préstamo. Métrica de riesgo que mira el banco: arriba de <b>~10%</b> se considera sano. <b>Tu caso:</b> {pct(cr.debt_yield_pct)}.</>]] : []),
          ...((r.proyeccion || {}).payback_anio ? [['Recuperas tu inversión', `año ${r.proyeccion.payback_anio}`, '#0E9F6E', <>El año en que lo que te llevas al vender ya <b>recupera lo que pusiste</b> de tu bolsa. Antes de eso, todavía no "sales tablas". <b>Tu caso:</b> ~año {r.proyeccion.payback_anio}.</>]] : []),
        ];
        return (
          <div className="iv4-card" style={{ marginTop: 12, borderTop: '4px solid #6D4AFF' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🏛️ Métricas institucionales <span style={{ fontWeight: 600, color: '#8A8FA6', fontSize: 11 }}>· las mismas cifras, en versión experto</span></div>
            <div style={{ fontSize: 11.5, color: '#5B5F76', marginTop: 4, marginBottom: 12, lineHeight: 1.5 }}>Lo que mira un analista para evaluar a fondo. Cada número trae su <b>?</b> en simple.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
              {mets.map(([l, v, c, info]) => <div key={l} style={{ padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px solid rgba(16,18,28,0.08)' }}><div style={{ fontSize: 10, color: '#6B6F86', fontWeight: 700 }}>{l}<Info>{info}</Info></div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: c, marginTop: 3 }}>{v}</div></div>)}
            </div>
            {r.con_credito && r.tir_desapalancada_pct != null && (
              <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 10, background: r.apalancamiento === 'positivo' ? 'rgba(14,159,110,0.08)' : 'rgba(220,38,38,0.07)', fontSize: 11.5, lineHeight: 1.55, color: '#5B5F76' }}>
                ⚖️ <b>Efecto del crédito (apalancamiento):</b> con crédito tu TIR es <b>{pct(r.tir_pct)}</b> vs <b>{pct(r.tir_desapalancada_pct)}</b> al contado → el crédito <b style={{ color: dif >= 0 ? '#0E9F6E' : '#DC2626' }}>{dif >= 0 ? 'suma' : 'resta'} {Math.abs(dif).toFixed(1)} puntos</b>. {r.apalancamiento === 'positivo' ? 'El inmueble rinde más que la tasa del banco, así que el crédito amplifica tu ganancia.' : 'El inmueble rinde menos que la tasa del banco; el crédito resta — evalúa más enganche, mejor tasa o comprar al contado.'}
              </div>
            )}
            {capRateMercado != null && r.cap_rate_pct != null && (() => {
              const dif = +(r.cap_rate_pct - capRateMercado).toFixed(2);
              return (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16182A', marginBottom: 8 }}>Calidad de entrada · tu cap rate vs el de la zona <Info><>La primera pregunta de un fondo: <b>¿compras bien?</b> Si tu cap rate de entrada es <b>mayor</b> que el promedio de la zona, pagas relativamente <b>barato</b> (mejor yield); si es menor, pagas caro. Fuente del mercado: promedio de la colonia (motor DMX).</></Info></div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 10, color: '#6B6F86', fontWeight: 700 }}>Tu cap rate</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: '#C026D3' }}>{pct(r.cap_rate_pct)}</div></div>
                    <div style={{ fontSize: 16, color: '#C9CCDB', fontWeight: 800 }}>vs</div>
                    <div><div style={{ fontSize: 10, color: '#6B6F86', fontWeight: 700 }}>Mercado de la zona</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: '#16182A' }}>{pct(capRateMercado)}</div></div>
                    <div style={{ padding: '8px 12px', borderRadius: 10, background: dif >= 0 ? 'rgba(14,159,110,0.1)' : 'rgba(220,38,38,0.08)', color: dif >= 0 ? '#0E7A53' : '#DC2626', fontWeight: 800, fontSize: 11.5 }}>{dif >= 0 ? `✓ Entras mejor: +${dif} pts de yield` : `⚠️ Entras caro: ${dif} pts vs el mercado`}</div>
                  </div>
                </div>
              );
            })()}
            {r.escenarios && r.escenarios.base && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16182A', marginBottom: 8 }}>Escenarios · base / optimista / pesimista <Info><>Lo que hace un comité de inversión: no confiar en un solo número, sino ver cómo te va si las cosas salen <b>mejor</b> o <b>peor</b> de lo esperado (cambia plusvalía, tasa y vacancia). Si aguanta el pesimista, es robusta.</></Info></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
                  {[['🟢 Optimista', 'optimista'], ['⚪ Base (tus datos)', 'base'], ['🔴 Pesimista', 'pesimista']].map(([titulo, k]) => { const s = r.escenarios[k] || {}; return (
                    <div key={k} style={{ padding: '11px 13px', borderRadius: 10, background: k === 'base' ? 'rgba(124,92,255,0.07)' : 'rgba(16,18,28,0.03)', border: k === 'base' ? '1.5px solid #7C5CFF' : '1px solid transparent' }}>
                      <div style={{ fontWeight: 800, fontSize: 12, color: '#16182A' }}>{titulo}</div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: (s.tir_pct || 0) >= 0 ? '#0E9F6E' : '#DC2626', marginTop: 4 }}>{pct(s.tir_pct)} <span style={{ fontSize: 10, color: '#8A8FA6', fontWeight: 600 }}>TIR</span></div>
                      <div style={{ fontSize: 10.5, color: '#5B5F76', marginTop: 3 }}>flujo {m(s.flujo_mensual)}/mes</div>
                      {k !== 'base' && r.escenarios.supuestos && <div style={{ fontSize: 9, color: '#A2A6BC', marginTop: 5, lineHeight: 1.45 }}>{r.escenarios.supuestos[k]}</div>}
                    </div>
                  ); })}
                </div>
              </div>
            )}
            {r.multifamily_info && r.multifamily_info.num_unidades && <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)', fontSize: 12.5, color: '#5B5F76' }}>Multifamily: cap implícito {pct(r.multifamily_info.cap_implicito_pct)} · valor de mercado {m(r.multifamily_info.valor_mercado)} · <b style={{ color: (r.multifamily_info.brecha_precio_pct || 0) > 0 ? '#DC2626' : '#0E9F6E' }}>brecha {pct(r.multifamily_info.brecha_precio_pct)}</b></div>}
            {r.sensibilidad && r.sensibilidad.por_exit_cap && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16182A', marginBottom: 6 }}>Sensibilidad: TIR según el precio de salida <Info><>Muestra cómo cambia tu TIR si al vender el mercado paga más caro o más barato (el "exit cap": menor % = precio de venta más alto). Sirve para ver qué tan frágil es tu rendimiento ante el mercado de salida. El recuadro morado es tu supuesto base.</></Info></div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{r.sensibilidad.por_exit_cap.map((s) => <div key={s.exit_cap_pct} style={{ textAlign: 'center', padding: '6px 9px', borderRadius: 8, background: s.es_base ? 'rgba(124,92,255,0.1)' : 'rgba(16,18,28,0.04)', border: s.es_base ? '1.5px solid #7C5CFF' : '1px solid transparent' }}><div style={{ fontSize: 9.5, color: '#8A8FA6' }}>{s.exit_cap_pct}%</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: s.es_base ? '#6D28D9' : '#16182A' }}>{pct(s.tir_pct)}</div></div>)}</div>
              </div>
            )}
            {r.sensibilidad && r.sensibilidad.por_tasa_aprec && (r.sensibilidad.por_tasa_aprec.filas || []).length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16182A', marginBottom: 6 }}>Mapa de calor: TIR según tasa del crédito × plusvalía <Info><>Tu TIR depende de dos cosas inciertas: la <b>tasa</b> a la que te presta el banco y la <b>plusvalía</b> de la zona. Esta matriz te muestra la TIR en cada combinación — <b>verde</b> = sana, <b>ámbar</b> = floja, <b>rojo</b> = pierdes. El recuadro morado es tu supuesto actual. Así ves de qué tan frágil es tu rendimiento.</></Info></div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 10.5 }}>
                    <thead><tr style={{ color: '#8A8FA6' }}><th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>Tasa ╲ Plusvalía</th>{r.sensibilidad.por_tasa_aprec.aprec_cols.map((a) => <th key={a} style={{ padding: '5px 8px', fontWeight: 700 }}>{a}%</th>)}</tr></thead>
                    <tbody>{r.sensibilidad.por_tasa_aprec.filas.map((f) => (
                      <tr key={f.tasa_pct}>
                        <td style={{ padding: '5px 8px', fontWeight: 800, color: '#6B6F86', whiteSpace: 'nowrap' }}>{f.tasa_pct}%</td>
                        {f.celdas.map((c, ci) => { const t = c.tir_pct || 0; const bg = t < 0 ? '#FCE4E4' : t < 7 ? '#FCF1DD' : '#E3F5EC'; const col = t < 0 ? '#DC2626' : t < 7 ? '#8A6A1E' : '#0E7A53'; return <td key={ci} style={{ padding: '6px 9px', textAlign: 'center', fontWeight: 800, color: col, background: bg, border: c.es_base ? '2px solid #7C5CFF' : '1px solid #fff' }}>{pct(c.tir_pct)}</td>; })}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 6 }}>🟩 sana · 🟨 floja · 🟥 pierde · borde morado = tu supuesto. Mueve tasa o plusvalía arriba y la matriz cambia.</div>
              </div>
            )}
            {r.montecarlo && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16182A', marginBottom: 8 }}>Monte Carlo · {r.montecarlo.n} escenarios al azar <Info><>Simula {r.montecarlo.n} futuros distintos variando al azar la plusvalía, la renta y las tasas. En vez de un solo número, te da un <b>rango</b>: el peor caso (5%), el esperado y el mejor (95%). Así ves el riesgo real, no solo el "todo sale perfecto".</></Info></div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>{[['Peor (5%)', r.montecarlo.p5, '#DC2626'], ['Esperado', r.montecarlo.p50, '#16182A'], ['Mejor (95%)', r.montecarlo.p95, '#0E9F6E']].map(([l, v, c]) => <div key={l} style={{ flex: '1 1 80px', textAlign: 'center', padding: '8px', borderRadius: 8, background: 'rgba(16,18,28,0.03)' }}><div style={{ fontSize: 10, color: '#8A8FA6' }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: c }}>{pct(v)}</div></div>)}</div>
                <div style={{ fontSize: 12, color: r.montecarlo.prob_bajo_cetes_pct >= 50 ? '#DC2626' : '#5B5F76' }}>Probabilidad de rendir <b>menos que CETES</b>: <b>{r.montecarlo.prob_bajo_cetes_pct}%</b> <Info><>De los {r.montecarlo.n} escenarios, en cuántos tu inversión rinde por debajo de lo que da CETES sin riesgo. Más bajo = más seguro que valga la pena el riesgo.</></Info></div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 34, marginTop: 8 }}>{r.montecarlo.hist.map((h, i) => { const mx = Math.max(...r.montecarlo.hist.map((x) => x.n)) || 1; return <div key={i} title={`desde ${h.desde}% · ${h.n}`} style={{ flex: 1, height: `${Math.max(4, (h.n / mx) * 100)}%`, background: 'linear-gradient(180deg,#7C5CFF,#C026D3)', borderRadius: '3px 3px 0 0', opacity: 0.8 }} />; })}</div>
              </div>
            )}
            {r.proforma && r.proforma.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16182A' }}>Pro-forma de flujos · año a año <Info><>El estado de flujos que revisa un comité: <b>ingreso bruto → NOI</b> (renta menos gastos) <b>→ menos el servicio de deuda</b> (pago al banco) <b>= flujo libre</b>. Año a año, hasta tu horizonte. Descárgalo en CSV para tu modelo.</></Info></div>
                  <button type="button" onClick={() => { const data = [['Año', 'Ingreso bruto', 'NOI', 'Servicio deuda', 'Flujo libre'], ...r.proforma.map((p) => [p.anio, p.ingreso_bruto, p.noi, p.servicio_deuda, p.flujo_libre])]; const csv = data.map((row) => row.join(',')).join('\n'); const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'proforma-inversion.csv'; a.click(); }} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.25)', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, background: '#fff', color: '#6D4AFF' }}>⬇️ CSV</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr style={{ color: '#6B6F86' }}>{['Año', 'Ingreso bruto', 'NOI', '− Servicio deuda', '= Flujo libre'].map((h, i) => <th key={h} style={{ padding: '5px 7px', fontWeight: 700, textAlign: i ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                    <tbody>{r.proforma.map((p) => (
                      <tr key={p.anio} style={{ borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                        <td style={{ padding: '5px 7px', fontWeight: 700 }}>{p.anio}</td>
                        <td style={{ padding: '5px 7px', textAlign: 'right' }}>{m(p.ingreso_bruto)}</td>
                        <td style={{ padding: '5px 7px', textAlign: 'right' }}>{m(p.noi)}</td>
                        <td style={{ padding: '5px 7px', textAlign: 'right', color: '#DC2626' }}>{m(p.servicio_deuda)}</td>
                        <td style={{ padding: '5px 7px', textAlign: 'right', fontWeight: 800, color: (p.flujo_libre || 0) >= 0 ? '#0E9F6E' : '#DC2626' }}>{m(p.flujo_libre)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16182A', marginBottom: 8 }}>⚙️ Supuestos · edítalos como analista <Info><>Un fondo no acepta los defaults: fija sus propios supuestos. <b>Exit cap</b> = a qué cap rate asumes que vendes (vacío = usar plusvalía); <b>vacancia</b> = % del año sin rentar; <b>reserva capex</b> = % que apartas para mantenimiento mayor; <b>prima de riesgo</b> = lo que exiges arriba de CETES (sube tu tasa de descuento del VPN).</></Info></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
                <div><span style={lab}>Exit cap rate (%) <span style={{ color: '#8A8FA6', fontWeight: 600 }}>opc.</span></span><input type="number" step="0.25" placeholder="auto" value={f.exit_cap_rate === '' ? '' : (f.exit_cap_rate * 100).toFixed(2)} onChange={(e) => set('exit_cap_rate', e.target.value === '' ? '' : Number(e.target.value) / 100)} style={inp} /></div>
                <div><span style={lab}>Vacancia (%)</span><input type="number" step="1" value={Math.round((f.tasa_vacancia || 0) * 100)} onChange={(e) => set('tasa_vacancia', Number(e.target.value) / 100)} style={inp} /></div>
                <div><span style={lab}>Reserva capex (%)</span><input type="number" step="0.5" value={(f.capex_reserve_pct * 100).toFixed(1)} onChange={(e) => set('capex_reserve_pct', Number(e.target.value) / 100)} style={inp} /></div>
                <div><span style={lab}>Prima de riesgo (%)</span><input type="number" step="0.5" value={(f.prima_riesgo_inmobiliario * 100).toFixed(1)} onChange={(e) => set('prima_riesgo_inmobiliario', Number(e.target.value) / 100)} style={inp} /></div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ───── CALL TO ACTION (al final · convierte el interés en lead) ───── */}
      {r && (
        <div className="iv4-noprint" style={{ marginTop: 16, padding: '18px 22px', borderRadius: 16, background: 'linear-gradient(120deg, #6D4AFF, #C026D3)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16.5 }}>¿Te late? Llévalo al siguiente paso.</div>
            <div style={{ fontSize: 12, opacity: 0.92, marginTop: 3, lineHeight: 1.45 }}>Un asesor te arma el plan a tu medida —crédito, mejor año para vender, apartado— sin costo y sin compromiso.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('dmx:lead', { detail: { source: 'calculadora_inversion', zona: zoneId, precio: f.valor_propiedad, tir: r.tir_pct } })); } catch { /* noop */ } askAtlax(`Me interesa invertir en este depa de ${m(f.valor_propiedad)} (TIR ${pct(r.tir_pct)}). Ayúdame con el siguiente paso y conéctame con un asesor.`); }} style={{ padding: '12px 18px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, background: '#fff', color: '#6D28D9' }}>📩 Quiero que me asesoren</button>
            <a href="#empezar" style={{ padding: '12px 16px', borderRadius: 11, fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, background: 'rgba(255,255,255,0.18)', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>📅 Agendar visita</a>
            <button type="button" onClick={() => { setLeadState(''); setLeadOpen(true); }} style={{ padding: '12px 16px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, background: 'rgba(255,255,255,0.18)', color: '#fff' }}>📄 Descargar análisis</button>
          </div>
        </div>
      )}

      {/* MODAL · descargar PDF deja datos (perfilamiento) → motor /api/lead-capture */}
      {leadOpen && (
        <div className="iv4-noprint" onClick={() => setLeadOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(16,18,28,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 24, width: 420, maxWidth: '100%', boxShadow: '0 20px 60px rgba(16,18,28,0.3)' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: '#16182A' }}>📄 Descarga tu análisis</div>
            <div style={{ fontSize: 12, color: '#8A8FA6', marginTop: 4, marginBottom: 14, lineHeight: 1.5 }}>Déjanos tus datos y te enviamos el PDF personalizado de esta inversión. Un asesor puede afinarlo contigo.</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><span style={lab}>Nombre*</span><input type="text" value={leadData.nombre} onChange={(e) => setLead('nombre', e.target.value)} style={inp} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><span style={lab}>WhatsApp*</span><input type="tel" inputMode="tel" placeholder="55..." value={leadData.telefono} onChange={(e) => setLead('telefono', e.target.value)} style={inp} /></div>
                <div><span style={lab}>Correo</span><input type="email" value={leadData.correo} onChange={(e) => setLead('correo', e.target.value)} style={inp} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><span style={lab}>Presupuesto</span><select value={leadData.presupuesto} onChange={(e) => setLead('presupuesto', e.target.value)} style={inp}><option value="">Elige…</option>{['< $5M', '$5–10M', '$10–15M', '$15–25M', '> $25M'].map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
                <div><span style={lab}>¿Cuándo comprarías?</span><select value={leadData.tiempo} onChange={(e) => setLead('tiempo', e.target.value)} style={inp}><option value="">Elige…</option>{['Ya / 1 mes', '1–3 meses', '3–6 meses', '6–12 meses', 'Solo explorando'].map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: '#5B5F76', cursor: 'pointer', lineHeight: 1.5 }}><input type="checkbox" checked={leadData.privacidad} onChange={(e) => setLead('privacidad', e.target.checked)} style={{ marginTop: 2 }} /><span>Acepto el <a href="/aviso-privacidad" target="_blank" rel="noreferrer" style={{ color: '#6D28D9' }}>aviso de privacidad</a> y que un asesor me contacte.</span></label>
              {leadState === 'error' && <div style={{ fontSize: 11, color: '#DC2626' }}>Revisa nombre, WhatsApp (10 dígitos) y el aviso de privacidad.</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={enviarLead} disabled={leadState === 'enviando'} style={{ flex: 1, padding: '12px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, background: 'linear-gradient(120deg,#6D4AFF,#C026D3)', color: '#fff' }}>{leadState === 'enviando' ? 'Enviando…' : leadState === 'ok' ? '✓ ¡Listo! Abriendo PDF…' : 'Descargar PDF'}</button>
                <button type="button" onClick={() => setLeadOpen(false)} style={{ padding: '12px 16px', borderRadius: 11, border: '1px solid rgba(16,18,28,0.15)', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, background: '#fff', color: '#6B6F86' }}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FUENTES (de dónde sale cada dato · visible) */}
      {r && r.fuentes && (
        <details className="iv4-card" style={{ marginTop: 14, padding: '14px 18px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 12.5, color: '#16182A' }}>📚 Fuentes de los datos <span style={{ fontWeight: 600, color: '#8A8FA6', fontSize: 11 }}>· con fecha de consulta</span></summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, marginTop: 12 }}>
            {[['Plusvalía', r.fuentes.plusvalia, (r.fuentes_fecha || {}).shf], ['Tasa hipotecaria', r.fuentes.tasa_hipotecaria, (r.fuentes_fecha || {}).banxico], ['CETES', r.fuentes.cetes, (r.fuentes_fecha || {}).banxico], ['UDIS', r.fuentes.udis, (r.fuentes_fecha || {}).banxico], ['Tipo de cambio (FIX)', r.fuentes.fix_usd, (r.fuentes_fecha || {}).banxico], ['Cap rate', r.fuentes.cap_rate, null], ['Renta (largo plazo)', r.fuentes.renta, (r.fuentes_fecha || {}).airroi], ['Renta corta / Airbnb', 'AirROI · api.airroi.com (tarifa y ocupación reales por zona)' + (airroi && airroi.adr_mxn ? ` — ${m(airroi.adr_mxn)}/noche · ${Math.round((airroi.ocupacion || 0) * 100)}% ocup.` : ''), (airroi && airroi.fetched_at) ? new Date(airroi.fetched_at).toLocaleDateString('es-MX') : 'al tocar “Usar AirROI”'], ['ISR / fiscal', r.fuentes.isr, (r.fuentes_fecha || {}).lisr], ['Amortización', r.fuentes.amortizacion, null], ['Métricas (TIR/VPN)', r.fuentes.metricas, null]].map(([l, v, fecha]) => v && (
              <div key={l} style={{ fontSize: 11, color: '#5B5F76' }}><b style={{ color: '#16182A' }}>{l}:</b> {v}{fecha && <span style={{ color: '#A2A6BC' }}> · consultado {fecha}</span>}</div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#A2A6BC', marginTop: 10, lineHeight: 1.5 }}>Los datos de Banxico (CETES, UDIS, tipo de cambio) se actualizan <b>solos cada día</b> con un proceso automático. Plusvalía (SHF) e ISR (ley) se revisan por trimestre/año.</div>
        </details>
      )}

      <div style={{ fontSize: 9.5, color: '#A2A6BC', fontStyle: 'italic', lineHeight: 1.5, marginTop: 14 }}>
        {loading ? 'Calculando…' : `Mercado vivo: CETES ${(r && r.mercado && (r.mercado.cetes_1a * 100).toFixed(1)) || '7.0'}% · UDIS ${(r && r.mercado && r.mercado.udis) || '—'} · USD ${(r && r.mercado && r.mercado.fix_usd) || '—'} (Banxico). `}
        Informativo · no sustituye asesoría fiscal/financiera. Cifras estimadas jun-2026. El ISR aquí es una estimación;
        para el detalle de <b>ISAI</b> (al comprar) e <b>ISR</b> (al vender) usa el <ProyectorLink />. El cálculo definitivo lo hace tu contador/notario.
      </div>

      {/* ───── BARRA STICKY · aparece al scrollear · controles + TIR/flujo EN VIVO (sin subir) ───── */}
      {showSticky && r && (
        <div className="iv4-noprint" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 80, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(6px)', borderTop: '1px solid rgba(16,18,28,0.1)', boxShadow: '0 -6px 22px rgba(16,18,28,0.1)', padding: '9px 16px' }}>
          <div style={{ maxWidth: 1140, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 9, color: '#6B6F86', fontWeight: 700 }}>Renta/año</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: '#C026D3', lineHeight: 1 }}>{pct(r.cap_rate_pct)}</div></div>
            <div><div style={{ fontSize: 9, color: '#6B6F86', fontWeight: 700 }}>TIR (vende {f.horizonte_anios}a)</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: sem, lineHeight: 1 }}>{pct(r.tir_pct)}</div></div>
            <div><div style={{ fontSize: 9, color: '#6B6F86', fontWeight: 700 }}>Flujo/mes</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: (r.flujo_mensual_1 || 0) >= 0 ? '#16182A' : '#DC2626', lineHeight: 1 }}>{m(r.flujo_mensual_1)}</div></div>
            <div style={{ width: 1, height: 30, background: 'rgba(16,18,28,0.1)' }} />
            <div style={{ display: 'inline-flex', background: 'rgba(16,18,28,0.05)', borderRadius: 9999, padding: 2 }}>
              {[[false, 'Contado'], [true, 'Crédito']].map(([v, l]) => { const on = f.con_credito === v; return <button key={l} type="button" onClick={() => set('con_credito', v)} style={{ padding: '5px 11px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11.5, background: on ? '#fff' : 'transparent', color: on ? '#6D28D9' : '#6B6F86', boxShadow: on ? '0 1px 5px rgba(16,18,28,0.1)' : 'none' }}>{l}</button>; })}
            </div>
            {f.con_credito && <select value={f.ltv} onChange={(e) => set('ltv', Number(e.target.value))} style={{ ...inp, width: 'auto', padding: '5px 8px', fontSize: 11.5 }}>{[10, 20, 30, 40, 50, 60, 70, 80, 90].map((e) => <option key={e} value={(100 - e) / 100}>{e}% eng.</option>)}</select>}
            {f.con_credito && <select value={f.plazo_meses} onChange={(e) => set('plazo_meses', Number(e.target.value))} style={{ ...inp, width: 'auto', padding: '5px 8px', fontSize: 11.5 }}>{[[36, '3a'], [60, '5a'], [84, '7a'], [120, '10a'], [180, '15a'], [240, '20a'], [300, '25a']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
            {f.con_credito && <input type="text" inputMode="decimal" placeholder="tasa%" value={f.tasa_anual} onChange={(e) => set('tasa_anual', e.target.value.replace(/[^\d.]/g, ''))} style={{ ...inp, width: 64, padding: '5px 8px', fontSize: 11.5 }} />}
            <button type="button" onClick={() => tusDatosRef.current && tusDatosRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(99,102,241,0.25)', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, background: '#fff', color: '#6D4AFF' }}>↑ Editar todo</button>
          </div>
        </div>
      )}
    </div>
  );
}

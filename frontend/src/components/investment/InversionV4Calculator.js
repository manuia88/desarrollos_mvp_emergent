/**
 * InversionV4Calculator — Calculadora de inversión inmobiliaria GRADO INSTITUCIONAL (PROMPT v4) · UX rediseñada.
 * 2 columnas (ajustes | resultado visual), resultado grande primero, cascada visual, badges auto/bloqueado, agrupado.
 * Pro por dentro, simple por fuera. Reactiva. Motor en POST /api/inversion-v4/analyze (motor + fiscal + mercado vivo).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.REACT_APP_BACKEND_URL;
const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);
// Sentence case (para veredictos que llegan en MAYÚSCULAS del backend): "SÓLIDA" → "Sólida".
const titleCase = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : s);

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
const Auto = () => <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#6D4AFF', background: 'rgba(109,74,255,0.12)', borderRadius: 5, padding: '1px 6px', verticalAlign: 'middle' }}>Estimado · edítalo</span>;
// link directo al Proyector de Impuestos (abre en pestaña nueva para no perder la calculadora)
const ProyectorLink = () => <a href="/tools/tax-projector" target="_blank" rel="noreferrer" style={{ color: '#6D4AFF', fontWeight: 700, textDecoration: 'underline' }}>Proyector de Impuestos</a>;
// globito "?" con explicación rica (qué es · de dónde sale · ejemplo real). children = contenido.
const Info = ({ children }) => <sup className="iv4-tip" tabIndex={0} style={{ marginLeft: 3 }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, borderRadius: '50%', background: 'rgba(16,18,28,0.05)', color: '#9499AE', fontSize: 8.5, fontWeight: 800 }}>?</span><span className="iv4-tipbox" style={{ width: 250 }}>{children}</span></sup>;

// Campo dinero/número — A NIVEL DE MÓDULO a propósito. Si vive dentro del componente, React lo
// recrea en cada render y REMONTA el <input> en cada tecla → el input pierde el foco y se siente
// como "no puedo escribir ni borrar". Recibe f/set/estilos por props para no cerrar sobre el render.
function Field({ f, k, label, set, money, auto, fmt, lab, inp }) {
  const raw = f[k];
  const shown = money ? (raw === '' || raw === null || raw === undefined ? '' : fmt(raw)) : raw;
  return (
    <div><span style={lab}>{label}{auto && <Auto />}</span>
      <input type="text" inputMode="numeric" value={shown} onChange={(e) => set(k, String(e.target.value).replace(/[^\d]/g, ''))} style={inp} /></div>
  );
}

export default function InversionV4Calculator({ prefilled = {}, lockPrice = false, zoneId = '', capRateMercado = null, devId = '', numDesarrollos = null, mode = 'individual', portfolioUnits = [], noStickyBar = false, onResult = null }) {
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
  useEffect(() => { if (r && onResult) onResult(r); }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loading, setLoading] = useState(false);
  const vista = mode === 'institucional' ? 'institucional' : 'simple';  // lo decide ZonePageV2 (paso 1 del flow), no un toggle aquí
  const [paso, setPaso] = useState('inmueble');   // una TAB por sección (sin scroll infinito)
  const [moneda, setMoneda] = useState('MXN');     // MXN | USD (convierte con el FIX vivo de Banxico)
  const [airroi, setAirroi] = useState(null);       // datos reales de renta corta (AirROI) por zona
  const [airroiLoading, setAirroiLoading] = useState(false);
  const [radarK, setRadarK] = useState('bolsa');    // instrumento a comparar en el radar del Pentágono
  const [leadOpen, setLeadOpen] = useState(false);  // modal de captura para descargar el PDF (reusa /api/lead-capture)
  const [leadData, setLeadData] = useState({ nombre: '', telefono: '', correo: '', presupuesto: '', tiempo: '', privacidad: false });
  const [leadState, setLeadState] = useState('');   // '' | 'enviando' | 'ok' | 'error'
  const setLead = (k, v) => setLeadData((s) => ({ ...s, [k]: v }));
  const rootRef = useRef(null);                      // scroll al tope del calc al cambiar de tab
  const tusDatosRef = useRef(null);                  // barra sticky: aparece cuando "Tus datos" sale de vista
  const [showSticky, setShowSticky] = useState(false);
  const [port, setPort] = useState(null);            // resultado agregado del portafolio (lo arma ZonePageV2 multi-select)
  const [descVol, setDescVol] = useState(0);         // descuento por volumen (%)
  const [zonaCtx, setZonaCtx] = useState(null);      // #1 absorción + #5 riesgo físico de la zona (motores reusados)
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
          property_id: devId || zoneId || 'calculadora-inversion', property_scope: devId ? 'project' : 'zone', source_page: 'calculadora_inversion',
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

  // Clave ESTABLE del portafolio (string comparado por valor): el padre pasa portfolioUnits como array NUEVO en cada
  // render → si va directo en las deps, el efecto se re-dispara infinitamente (loop de POST /analyze). La key lo corta.
  const portfolioKey = (portfolioUnits || []).map((u) => `${u.precio}:${u.renta}`).join('|');
  useEffect(() => {
    clearTimeout(timer.current);
    const num = (x) => (x === '' || x === null ? undefined : Number(x));
    const tasaFrac = (f.tasa_anual === '' || f.tasa_anual === null || f.tasa_anual === undefined) ? undefined : Number(f.tasa_anual) / 100;
    // MODO INSTITUCIONAL (1+ unidades elegidas ARRIBA): el análisis corre sobre la SUMA de las unidades (1 = esa unidad)
    const portfolioActive = vista === 'institucional' && portfolioUnits.length >= 1;
    let vp = num(f.valor_propiedad), rm = num(f.renta_mensual), pred = num(f.predial), mant = num(f.mantenimiento), seg = num(f.seguro), tarifa = num(f.tarifa_noche);
    if (portfolioActive) {
      const dfac = 1 - (Number(descVol) || 0) / 100;
      vp = Math.round(portfolioUnits.reduce((s, x) => s + (x.precio || 0) * dfac, 0));
      rm = Math.round(portfolioUnits.reduce((s, x) => s + (x.renta || 0), 0));
      tarifa = Math.round(portfolioUnits.reduce((s, x) => s + Math.round((x.renta || 0) / 30 * 2.2), 0));
      pred = Math.round(vp * 0.0016); mant = Math.round(vp * 0.0024); seg = Math.round(vp * 0.0012);
    }
    const payload = { ...f, incluir_sensibilidad: vista === 'institucional', valor_propiedad: vp, renta_mensual: rm, tarifa_noche: tarifa, predial: pred, mantenimiento: mant, seguro: seg, num_unidades: num(f.num_unidades), ltv: num(f.ltv), tasa_anual: tasaFrac, plazo_meses: num(f.plazo_meses), abono_capital_mensual: num(f.abono_capital_mensual) || 0, apreciacion_anual: num(f.apreciacion_anual), crecimiento_renta_anual: num(f.crecimiento_renta_anual), exit_cap_rate: num(f.exit_cap_rate) || 0, capex_reserve_pct: num(f.capex_reserve_pct), prima_riesgo_inmobiliario: num(f.prima_riesgo_inmobiliario), tasa_vacancia: num(f.tasa_vacancia), zone_id: zoneId || undefined, usa_airroi: !!(airroi && airroi.adr_mxn) };
    timer.current = setTimeout(() => run(payload), 250);
    return () => clearTimeout(timer.current);
  }, [f, vista, run, zoneId, airroi, portfolioKey, descVol]); // eslint-disable-line react-hooks/exhaustive-deps

  // al elegir otra unidad/proyecto (cambia el precio que llega), sincroniza el precio bloqueado → permite comparar proyectos
  useEffect(() => {
    if (prefilled.precio) setF((s) => ({ ...s, valor_propiedad: prefilled.precio, renta_mensual: prefilled.renta || s.renta_mensual }));
  }, [prefilled.precio, prefilled.renta]);

  // #1 absorción + #5 riesgo físico de la zona (una sola vez por zona · reusa absorcion_engine + climate/natural_risk)
  useEffect(() => {
    if (!zoneId) return;
    let vivo = true;
    fetch(`${API}/api/inversion-v4/zona-contexto?zone_id=${encodeURIComponent(zoneId)}`)
      .then((r) => r.json()).then((d) => { if (vivo && d && d.ok) setZonaCtx(d); }).catch(() => { /* noop */ });
    return () => { vivo = false; };
  }, [zoneId]);

  // barra sticky: cuando "Tus datos" sale de vista, mostrar la barra fija con controles + TIR en vivo
  useEffect(() => {
    const el = tusDatosRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting), { rootMargin: '-40px 0px 0px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // portafolio: con 2+ unidades (elegidas arriba en ZonePageV2), corre la agregación para la tabla por-unidad (debounced)
  useEffect(() => {
    if (vista !== 'institucional' || portfolioUnits.length < 1) { setPort(null); return undefined; }
    const tasaFrac = (f.tasa_anual === '' || f.tasa_anual == null) ? undefined : Number(f.tasa_anual) / 100;
    const units = portfolioUnits.map((u) => ({ label: u.label, precio: u.precio, renta: u.renta }));
    const payload = { units, con_credito: f.con_credito, ltv: Number(f.ltv), tasa_anual: tasaFrac, plazo_meses: Number(f.plazo_meses), horizonte_anios: Number(f.horizonte_anios), modo_renta: f.modo_renta, apreciacion_anual: Number(f.apreciacion_anual), crecimiento_renta_anual: Number(f.crecimiento_renta_anual), descuento_volumen_pct: descVol };
    const t = setTimeout(async () => {
      try {
        const resp = await fetch(`${API}/api/inversion-v4/portafolio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const d = await resp.json();
        if (d && d.ok) setPort(d.portafolio);
      } catch { /* noop */ }
    }, 300);
    return () => clearTimeout(t);
  }, [vista, portfolioKey, descVol, f.con_credito, f.ltv, f.tasa_anual, f.plazo_meses, f.horizonte_anios, f.modo_renta, f.apreciacion_anual, f.crecimiento_renta_anual]); // eslint-disable-line react-hooks/exhaustive-deps

  // estilos
  const inp = { background: '#fff', border: '1px solid #ECECEC', borderRadius: 11, color: '#1E2230', fontFamily: 'DM Sans', fontSize: 13, padding: '10px 12px', width: '100%', outline: 'none', boxSizing: 'border-box' };
  const lab = { fontFamily: 'DM Sans', fontSize: 10.5, color: '#6B6F86', marginBottom: 5, display: 'block', fontWeight: 700 };
  const grpLabel = { fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, color: '#6B6F86', marginBottom: 9 };
  const Toggle = ({ k, opts }) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {opts.map(([v, l]) => { const on = String(f[k]) === String(v); return <button key={String(v)} type="button" onClick={() => set(k, v)} style={{ padding: '8px 13px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, border: on ? '1.5px solid #6D4AFF' : '1px solid rgba(99,102,241,0.2)', background: on ? 'rgba(109,74,255,0.1)' : '#fff', color: on ? '#6D4AFF' : '#4B4F66' }}>{l}</button>; })}
    </div>
  );
  // Field vive a NIVEL DE MÓDULO (arriba), no aquí, para no perder el foco del input al teclear.

  const multifamily = Number(f.num_unidades) >= 5;
  const sem = (r && r.veredicto && SEM[r.veredicto.semaforo]) || '#8A8FA6';
  // tarjeta de métrica limpia (look calcV4: barra de acento arriba, número grande, aire)
  const MetricCard = ({ label, value, color = '#1E2230', sub, info, badge }) => (
    <div style={{ background: '#fff', border: '1px solid #ECECEC', borderRadius: 16, boxShadow: '0 6px 20px rgba(16,18,28,.05)', padding: '17px 18px 16px', position: 'relative' }}>
      {/* SIN overflow:hidden — recortaba los globitos (?). La barra se redondea sola para no salirse. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: color, borderRadius: '16px 16px 0 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans', fontSize: 12, color: '#5A5F6E', fontWeight: 700 }}>
        <span>{label}</span>{info && <Info>{info}</Info>}{badge && <span style={{ fontSize: 9, fontWeight: 800, color: '#6B6F86', background: 'rgba(16,18,28,0.06)', borderRadius: 5, padding: '1px 6px' }}>{badge}</span>}
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color, letterSpacing: '-0.02em', marginTop: 6, lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#8A8FA6', marginTop: 7, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
  const SecTitle = ({ children }) => <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: '#1E2230', marginTop: 4, marginBottom: 2 }}>{children}</div>;
  // barra de navegación entre pasos (Atrás / Siguiente) — look de marca
  const NavRow = ({ back, next, nextLabel }) => (
    <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
      {back && <button type="button" onClick={back} style={{ padding: '11px 16px', borderRadius: 11, border: '1px solid #ECECEC', background: '#fff', color: '#5A5F6E', fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>← Atrás</button>}
      {next && <button type="button" onClick={next} style={{ padding: '12px 20px', borderRadius: 11, border: 'none', background: 'linear-gradient(120deg, #6D4AFF, #C63FAE)', color: '#fff', fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', boxShadow: '0 8px 20px rgba(109,74,255,0.26)' }}>{nextLabel}</button>}
    </div>
  );
  // formateador de dinero local (convierte a USD con el FIX vivo) — sombrea el módulo para toda la vista
  const fix = (r && r.mercado && r.mercado.fix_usd) || 18.0;
  const m = (n) => (moneda === 'USD'
    ? `US$${Math.round((Number(n) || 0) / fix).toLocaleString('en-US')}`
    : `$${Math.round(Number(n) || 0).toLocaleString('es-MX')}`);

  // ─── TABS por sección (una tab = una sección · sin scroll infinito · botón Siguiente guía) ───
  const IN_TABS = [{ k: 'inmueble', l: 'Tu inmueble' }, { k: 'pago', l: 'Cómo lo pagas' }, { k: 'supuestos', l: 'Supuestos' }];
  const RES_TABS = [{ k: 'resumen', l: 'Resultado' }, { k: 'dinero', l: 'El dinero' }, { k: 'credito', l: 'Tu crédito' }, { k: 'renta', l: 'Renta vs Airbnb' }, { k: 'comparar', l: 'Comparar' }];
  const ALL_TABS = [...IN_TABS, ...RES_TABS];
  const isInput = IN_TABS.some((t) => t.k === paso);
  const isResult = RES_TABS.some((t) => t.k === paso);
  const tabIdx = ALL_TABS.findIndex((t) => t.k === paso);
  const nextTab = tabIdx >= 0 && tabIdx < ALL_TABS.length - 1 ? ALL_TABS[tabIdx + 1] : null;
  const prevTab = tabIdx > 0 ? ALL_TABS[tabIdx - 1] : null;
  const goTab = (k) => { setPaso(k); try { if (rootRef.current) requestAnimationFrame(() => rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })); } catch { /* noop */ } };

  return (
    <div ref={rootRef} style={{ background: '#fff', border: '1px solid #ECECEC', borderRadius: 18, boxShadow: '0 6px 20px rgba(16,18,28,.05)', padding: 24, fontFamily: 'DM Sans', color: '#1E2230', scrollMarginTop: 80 }}>
      <style>{`
        .iv4-tip{position:relative;cursor:help;color:#A9ADC4;font-size:11px;margin-left:5px}
        .iv4-tipbox{position:absolute;bottom:135%;left:50%;transform:translateX(-50%);width:220px;background:#1E2230;color:#fff;font-weight:500;font-size:11px;line-height:1.45;padding:9px 11px;border-radius:9px;box-shadow:0 12px 30px rgba(16,18,28,.3);opacity:0;visibility:hidden;transition:opacity .14s;z-index:60;text-align:left;pointer-events:none}
        .iv4-tip:hover .iv4-tipbox,.iv4-tip:focus .iv4-tipbox{opacity:1;visibility:visible}
        .iv4-card{background:#fff;border:1px solid #ECECEC;border-radius:14px;box-shadow:none;padding:16px 18px}
        .iv4-sub{font-family:'Outfit';font-weight:800;font-size:15px;color:#1E2230;margin:6px 0 4px}
        @media print{.iv4-noprint{display:none}}
      `}</style>

      {/* ───── CABECERA · look calcV4 (igual que la hipotecaria) ───── */}
      <div className="iv4-noprint" style={{ marginBottom: 18 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 11px', borderRadius: 9999, background: 'rgba(109,74,255,0.10)', border: '1px solid rgba(109,74,255,0.24)', fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, color: '#6D4AFF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>✦ Calculadora de inversión</div>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', color: '#1E2230' }}>¿Cuánto te deja esta inversión?</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#5A5F6E', marginTop: 4 }}>Renta, plusvalía, impuestos y crédito — paso a paso, con datos vivos de mercado.</div>
      </div>

      {/* ───── TABS POR SECCIÓN · control segmentado (mismo look que la calculadora hipotecaria) ───── */}
      <div className="iv4-noprint" style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 auto', display: 'flex', gap: 5, background: '#f4f2fd', borderRadius: 12, padding: 4, flexWrap: 'wrap' }}>
          {ALL_TABS.map((t, i) => { const on = paso === t.k; return (
            <button key={t.k} type="button" onClick={() => goTab(t.k)} style={{ flex: '1 1 auto', padding: '9px 13px', borderRadius: 9, border: 'none', background: on ? 'linear-gradient(120deg, #6D4AFF, #C63FAE)' : 'transparent', color: on ? '#fff' : '#5A5F6E', fontFamily: 'Outfit', fontWeight: on ? 800 : 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: on ? '0 4px 12px rgba(109,74,255,0.28)' : 'none' }}>{i + 1}. {t.l}</button>
          ); })}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {vista === 'institucional' && <span style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, color: '#6D4AFF', background: 'rgba(109,74,255,0.1)', padding: '6px 12px', borderRadius: 9999 }}>🏛️ Institucional</span>}
          <div style={{ display: 'inline-flex', background: 'rgba(16,18,28,0.05)', borderRadius: 9999, padding: 3 }}>
            {['MXN', 'USD'].map((mo) => (
              <button key={mo} type="button" onClick={() => setMoneda(mo)} style={{ padding: '7px 13px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, border: 'none', background: moneda === mo ? '#fff' : 'transparent', color: moneda === mo ? '#6D4AFF' : '#6B6F86', boxShadow: moneda === mo ? '0 2px 8px rgba(16,18,28,0.08)' : 'none' }}>{mo}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ───── INPUTS · pasos ①②③ (mismos campos de siempre, ahora guiados) ───── */}
      <div ref={tusDatosRef} className="iv4-noprint" style={{ marginBottom: 4, display: isInput ? 'block' : 'none' }}>
        {moneda === 'USD' && r && r.mercado && r.mercado.fix_usd && (
          <div style={{ fontSize: 10.5, color: '#0B6E99', background: 'rgba(14,165,233,0.08)', borderRadius: 8, padding: '7px 11px', marginBottom: 12, display: 'inline-block' }}>
            💱 Tipo de cambio: <b>1 USD = ${r.mercado.fix_usd} MXN</b> · Banxico (FIX){(r.fuentes_fecha || {}).banxico ? `, consultado ${r.fuentes_fecha.banxico}` : ''}. Se actualiza solo cada día.
          </div>
        )}

        {/* PASO ① TU INMUEBLE */}
        {paso === 'inmueble' && (<>
          {/* INSTITUCIONAL · descuento por volumen + desglose por unidad */}
          {vista === 'institucional' && portfolioUnits.length >= 2 && (
            <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(16,18,28,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ ...lab, marginBottom: 0 }}>Descuento por volumen <Info><>Lo que sueles negociar al comprar en bloque. Se aplica al precio de cada unidad del portafolio.</></Info></span>
                <input type="number" step="1" min="0" max="30" value={descVol} onChange={(e) => setDescVol(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} style={{ ...inp, width: 66 }} /><span style={{ fontSize: 12, color: '#6B6F86' }}>%</span>
                <span style={{ fontSize: 10, color: '#A2A6BC' }}>al comprar en bloque</span>
              </div>
              {port && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ background: 'rgba(192,38,211,0.08)', borderRadius: 10, padding: '9px 13px', fontSize: 11.5, color: '#86198F', lineHeight: 1.5 }}>✓ <b>Portafolio: {port.n_unidades} unidades · {m(port.precio_total)} total.</b> Todo (cómo lo pagas, impuestos, crédito, pentágono, métricas) ya es del portafolio combinado.</div>
                  <div style={{ overflowX: 'auto', marginTop: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead><tr style={{ color: '#6B6F86' }}>{['Unidad', 'Precio', 'Cap rate', 'TIR', 'Flujo/mes'].map((h, i) => <th key={h} style={{ padding: '4px 8px', fontWeight: 700, textAlign: i ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                      <tbody>{port.unidades.map((u, i) => (
                        <tr key={i} style={{ borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                          <td style={{ padding: '4px 8px', fontWeight: 700 }}>{u.label}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{m(u.precio)}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{pct(u.cap_rate_pct)}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: (u.tir_pct || 0) >= 0 ? '#0E9F6E' : '#DC2626' }}>{pct(u.tir_pct)}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', color: (u.flujo_mensual || 0) >= 0 ? '#16182A' : '#DC2626' }}>{m(u.flujo_mensual)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={grpLabel}>🏠 El inmueble</div>
          <div style={{ display: 'flex', gap: 13, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {(vista === 'institucional' && portfolioUnits.length >= 1 && port) ? (
              <div style={{ minWidth: 150 }}><span style={lab}>{port.n_unidades > 1 ? 'Precio total' : 'Precio'} <span style={{ color: '#86198F', fontWeight: 700 }}>· {port.n_unidades} {port.n_unidades > 1 ? 'unidades' : 'unidad'}</span></span>
                <input type="text" readOnly value={m(port.precio_total)} style={{ ...inp, background: 'rgba(192,38,211,0.06)', color: '#86198F', fontWeight: 700, cursor: 'not-allowed' }} /></div>
            ) : (
              <div style={{ minWidth: 150 }}><span style={lab}>Precio {lockPrice && <span style={{ color: '#8A8FA6', fontWeight: 600 }}>🔒 fijo</span>}</span>
                {lockPrice ? <input type="text" readOnly value={m(f.valor_propiedad)} style={{ ...inp, background: '#F4F5F8', color: '#5B5F76', cursor: 'not-allowed' }} />
                  : <input type="text" inputMode="numeric" value={m(f.valor_propiedad)} onChange={(e) => set('valor_propiedad', String(e.target.value).replace(/[^\d]/g, ''))} style={inp} />}</div>
            )}
            <div><span style={lab}>Tipo de renta</span><Toggle k="modo_renta" opts={[['largo', 'Largo'], ['corto', 'Airbnb']]} /></div>
          </div>
          {/* AIRROI · datos reales de renta corta por zona */}
          {f.modo_renta === 'corto' && zoneId && (
            <div style={{ marginTop: 12, padding: '11px 14px', background: 'rgba(14,165,233,0.08)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11.5, color: '#0B6E99', lineHeight: 1.45 }}>
                {airroi && airroi.adr_mxn ? <>📡 <b>AirROI</b> (real de esta zona): <b>{m(airroi.adr_mxn)}/noche</b> · {Math.round((airroi.ocupacion || 0) * 100)}% ocupación · {Math.round(airroi.listings || 0)} deptos activos.</> : (airroi && airroi.error ? <>⚠️ {airroi.error}</> : <>¿Quieres la tarifa y ocupación <b>reales</b> de Airbnb en esta zona? Las trae AirROI.</>)}
              </div>
              <button type="button" onClick={traerAirroi} disabled={airroiLoading} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', cursor: airroiLoading ? 'wait' : 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, background: '#0EA5E9', color: '#fff', whiteSpace: 'nowrap' }}>{airroiLoading ? 'Trayendo…' : (airroi && airroi.adr_mxn ? '↻ Actualizar' : '📡 Usar AirROI')}</button>
            </div>
          )}
          <div style={{ fontSize: 10.5, color: '#8A8FA6', marginTop: 12, lineHeight: 1.5 }}>La <b>renta</b> y otros supuestos los ajustas en el paso <b>③ Supuestos</b>. Solo el precio está fijo.{vista === 'simple' ? ' ¿Inviertes como fondo? Elige 🏛️ Institucional arriba.' : ''}</div>
          <NavRow next={() => goTab('pago')} nextLabel="Siguiente · cómo lo pagas →" />
        </>)}

        {/* PASO ② CÓMO LO PAGAS */}
        {paso === 'pago' && (<>
          <div style={grpLabel}>💳 Cómo lo pagas</div>
          <div style={{ display: 'flex', gap: 13, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><Toggle k="con_credito" opts={[[false, 'Contado'], [true, 'Crédito']]} /></div>
            {f.con_credito && <div><span style={lab}>Enganche</span><select value={f.ltv} onChange={(e) => set('ltv', Number(e.target.value))} style={inp}>{[10, 20, 30, 40, 50, 60, 70, 80, 90].map((e) => <option key={e} value={(100 - e) / 100}>{e}%</option>)}</select></div>}
            {f.con_credito && <div><span style={lab}>Plazo</span><select value={f.plazo_meses} onChange={(e) => set('plazo_meses', Number(e.target.value))} style={inp}>{[[36, '3 años'], [60, '5 años'], [84, '7 años'], [120, '10 años'], [180, '15 años'], [240, '20 años'], [300, '25 años']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
            {f.con_credito && <div><span style={lab}>Tasa anual (%) <Auto /></span><input type="text" inputMode="decimal" placeholder="11.45" value={f.tasa_anual} onChange={(e) => set('tasa_anual', e.target.value.replace(/[^\d.]/g, ''))} style={{ ...inp, width: 90 }} /></div>}
            {f.con_credito && <div><span style={lab}>Abono extra/mes <span style={{ color: '#8A8FA6', fontWeight: 600 }}>opc.</span></span><input type="text" inputMode="numeric" value={m(f.abono_capital_mensual)} onChange={(e) => set('abono_capital_mensual', String(e.target.value).replace(/[^\d]/g, ''))} style={{ ...inp, width: 110 }} /></div>}
          </div>
          {/* TIRA DE CRÉDITO EN VIVO */}
          {f.con_credito && r && r.credito && r.credito.pmt_mensual && (
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', padding: '11px 14px', background: 'rgba(109,74,255,0.06)', borderRadius: 10 }}>
              {[['Mensualidad', m(r.credito.pmt_mensual) + '/mes'], ['Te prestan', m(r.credito.monto_credito)], ['Tu enganche', m(r.credito.capital_propio)], ['Interés total', m(r.credito.interes_total)], ['La renta cubre', pct(r.credito.cobertura_renta_pct)]].map(([l, v]) => (
                <div key={l}><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: '#16182A' }}>{v}</div></div>
              ))}
              <div style={{ fontSize: 9.5, color: '#A2A6BC', marginLeft: 'auto' }}>↻ cambia plazo, enganche o tasa y mira aquí</div>
            </div>
          )}
          <NavRow back={() => goTab('inmueble')} next={() => goTab('supuestos')} nextLabel="Siguiente · supuestos →" />
        </>)}

        {/* PASO ③ SUPUESTOS (Configuración) */}
        {paso === 'supuestos' && (<>
          <div style={grpLabel}>⚙️ Supuestos <span style={{ fontWeight: 600, color: '#8A8FA6', textTransform: 'none', letterSpacing: 0 }}>· predial, mantenimiento, horizonte, plusvalía, régimen fiscal · estimados editables</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 6 }}>
            {f.modo_renta === 'corto' ? (<>
              <Field f={f} set={set} fmt={m} lab={lab} inp={inp} label="Tarifa por noche" k="tarifa_noche" money auto />
              <div><span style={lab}>Ocupación (%) <Auto /></span><input type="number" value={Math.round((f.ocupacion_pct || 0.6) * 100)} onChange={(e) => set('ocupacion_pct', Number(e.target.value) / 100)} style={inp} /></div>
            </>) : <Field f={f} set={set} fmt={m} lab={lab} inp={inp} label="Renta mensual" k="renta_mensual" money auto />}
            <div><span style={lab}>N° Unidades {multifamily && <span style={{ color: '#6D4AFF', fontWeight: 700 }}>·multi</span>}</span><input type="number" value={f.num_unidades} onChange={(e) => set('num_unidades', e.target.value)} style={inp} /></div>
            <Field f={f} set={set} fmt={m} lab={lab} inp={inp} label="Predial / año" k="predial" money auto />
            <Field f={f} set={set} fmt={m} lab={lab} inp={inp} label="Mantenim. / año" k="mantenimiento" money auto />
            <Field f={f} set={set} fmt={m} lab={lab} inp={inp} label="Seguro / año" k="seguro" money auto />
            <div><span style={lab}>Horizonte (años)</span><input type="number" value={f.horizonte_anios} onChange={(e) => set('horizonte_anios', Number(e.target.value))} style={inp} /></div>
            <div><span style={lab}>Plusvalía / año (%)</span><input type="number" step="0.1" value={f.apreciacion_anual * 100} onChange={(e) => set('apreciacion_anual', Number(e.target.value) / 100)} style={inp} /></div>
            <div><span style={lab}>Crecim. renta / año (%)</span><input type="number" step="0.1" value={f.crecimiento_renta_anual * 100} onChange={(e) => set('crecimiento_renta_anual', Number(e.target.value) / 100)} style={inp} /></div>
            <div><span style={lab}>Perfil</span><select value={f.perfil} onChange={(e) => set('perfil', e.target.value)} style={inp}><option value="fisica">Persona física</option><option value="moral">Persona moral</option></select></div>
            {f.perfil === 'fisica' && <div><span style={lab}>Régimen fiscal</span><select value={f.regimen_fiscal} onChange={(e) => set('regimen_fiscal', e.target.value)} style={inp}>{REGIMENES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
          </div>
          <NavRow back={() => goTab('pago')} next={() => goTab('resumen')} nextLabel="Ver mi resultado →" />
        </>)}
      </div>

      {/* ④ · aviso mientras calcula (motor reactivo) */}
      {isResult && !r && <div className="iv4-card" style={{ marginBottom: 12, fontFamily: 'DM Sans', fontSize: 13, color: '#8A8FA6' }}>{loading ? 'Calculando tu inversión…' : 'Ajusta tus datos en los pasos anteriores para ver el resultado.'}</div>}

      {/* RESUMEN EJECUTIVO · institucional: tras elegir las unidades, lo clave del PORTAFOLIO de un vistazo */}
      {paso === 'resumen' && vista === 'institucional' && r && (
        <div className="iv4-card" style={{ marginBottom: 12, borderLeft: '4px solid #6D4AFF' }}>
          <div className="iv4-sub" style={{ marginTop: 0, marginBottom: 10 }}>🏛️ Resumen institucional <span style={{ fontFamily: 'DM Sans', fontWeight: 600, color: '#8A8FA6', fontSize: 12 }}>· {portfolioUnits.length >= 2 ? `${portfolioUnits.length} unidades · portafolio` : 'lo clave de un vistazo'}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(118px,1fr))', gap: 12 }}>
            {[['TIR (vende ' + f.horizonte_anios + 'a)', pct(r.tir_pct), (r.tir_pct || 0) >= 0 ? '#0E9F6E' : '#DC2626'],
            ['Cap rate', pct(r.cap_rate_pct), '#6D4AFF'],
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

      {/* ───── RESULTADOS · paso ④ (mismos resultados de siempre, ahora en su paso) ───── */}
      <div style={{ display: isResult ? 'flex' : 'none', flexDirection: 'column', gap: 14 }}>

          {/* ───── VEREDICTO (rediseñado · banner limpio) ───── */}
          {paso === 'resumen' && r && r.veredicto && (
            <div style={{ borderRadius: 16, padding: '18px 20px', background: `${sem}0F`, border: `1px solid ${sem}44` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: sem }} />
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: sem }}>{titleCase(r.veredicto.nivel)}</span>
              </div>
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#5A5F6E', lineHeight: 1.55, margin: 0 }}>{r.veredicto.parrafo}</p>
              {r.proyeccion && r.proyeccion.rows && r.proyeccion.rows.length > 0 && (
                <div style={{ marginTop: 13, display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#6B6F86', fontWeight: 700 }}>TIR si vendes en:</span>
                  {r.proyeccion.rows.map((row) => { const on = row.anio === Number(f.horizonte_anios); return (
                    <button key={row.anio} type="button" onClick={() => set('horizonte_anios', row.anio)} style={{ cursor: 'pointer', fontFamily: 'Outfit', fontSize: 12, fontWeight: 800, padding: '6px 11px', borderRadius: 9, border: on ? '1.5px solid #6D4AFF' : '1px solid #ECECEC', background: on ? 'rgba(109,74,255,0.12)' : '#fff', color: (row.tir_si_vendes || 0) >= 0 ? (on ? '#6D4AFF' : '#1E2230') : '#DC2626' }}>{row.anio}a · {pct(row.tir_si_vendes)}</button>
                  ); })}
                </div>
              )}
              {r.renta_equilibrio_mensual && (r.flujo_mensual_1 || 0) < 0 && r.desglose && (
                <div style={{ marginTop: 12, fontFamily: 'DM Sans', fontSize: 11.5, color: '#8A6A1E', background: 'rgba(224,163,62,0.12)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>🎯 <b>Punto de equilibrio:</b> hoy pones ~{m(Math.abs(r.flujo_mensual_1))}/mes de tu bolsa. Para que la renta cubra TODO (no poner nada), tendría que ser ~<b>{m(r.renta_equilibrio_mensual)}/mes</b> (hoy ~{m(Math.round(r.desglose.ingreso_bruto_anual / 12))}). Alternativas: sube el enganche, alarga el plazo o negocia mejor precio.<Info><>El <b>punto de equilibrio</b> es la renta a la que tu flujo mensual = $0 (dejas de poner de tu bolsa). Útil para saber qué tan lejos estás de que "se pague solo".</></Info></div>
              )}
            </div>
          )}

          {/* ───── MÉTRICAS · rediseñadas a tarjetas limpias (mismos datos + explicaciones) ───── */}
          {paso === 'resumen' && r && vista === 'simple' && (() => {
            const H = Number(f.horizonte_anios) || 5;
            const apre = (Number(f.apreciacion_anual) * 100).toFixed(1);
            const gananciaPlusv1 = Math.round((Number(f.valor_propiedad) || 0) * (Number(f.apreciacion_anual) || 0));
            const deTuBolsa = r.con_credito && r.credito ? r.credito.capital_propio : (r.desglose || {}).costo_total;
            const gastosMes = (Number(f.predial || 0) + Number(f.mantenimiento || 0) + Number(f.seguro || 0)) / 12;
            const costoVivirMes = Math.round((r.con_credito && r.credito ? r.credito.pmt_mensual : 0) + gastosMes);
            const flujoColor = (r.flujo_mensual_1 || 0) >= 0 ? '#0E9F6E' : '#DC2626';
            const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 14 };
            return (<>
              <SecTitle>📈 Si es para invertir (rentarla)</SecTitle>
              <div style={grid}>
                <MetricCard label={`Si vendes al año ${H}`} badge="TIR" value={pct(r.tir_pct)} color={sem} sub="Renta + plusvalía si vendes ese año. Cambia el año en la tira de arriba." info={<>Tu ganancia al año si rentas y al final lo vendes, juntando la renta de cada año y lo que subió de precio. Ejemplo: aquí sale {pct(r.tir_pct)} al año.</>} />
                <MetricCard label="Rinde al año" badge="renta / precio" value={pct(r.cap_rate_pct)} color="#6D4AFF" sub="Lo que deja la renta sobre el precio — estable, no depende de cuándo vendas." info={<>Cuánto te deja la renta en un año comparado con lo que cuesta el depa, sin contar el crédito. Cómo se saca: la renta de un año ({m(r.noi)}) entre el precio ({m(f.valor_propiedad)}) = {pct(r.cap_rate_pct)}.</>} />
                <MetricCard label="Rendimiento promedio (ROI)" badge="al año" value={pct(r.roi_anualizado_pct)} color="#0E9F6E" sub="Tu ganancia contando TODO (renta + venta), repartida en los años." info={<>Junta todo lo que ganas (la renta más lo que sube de valor) y lo reparte entre los años. Ejemplo: aquí sale como {pct(r.roi_anualizado_pct)} al año.</>} />
                <MetricCard label="Flujo de la renta" badge="al mes" value={m(r.flujo_mensual_1) + '/mes'} color={flujoColor} sub="Lo que te queda (o sale de tu bolsa) cada mes tras gastos y crédito." info={<>Lo que te queda cada mes: la renta menos los gastos y el pago del banco. Ejemplo: aquí {m(r.flujo_mensual_1)} al mes. Si sale en rojo, tú pones esa diferencia.</>} />
                <MetricCard label="Multiplicas tu dinero" badge="en total" value={r.equity_multiple ? `${r.equity_multiple}x` : '—'} color="#6D4AFF" sub="Por cada peso que pones, cuántos recuperas al final." info={<>Por cada peso que pones, cuántos recuperas al final. Ejemplo: aquí {r.equity_multiple} veces. Más de 1 es ganar; menos de 1, perder.</>} />
                <MetricCard label="Neto al vender" badge="al vender" value={m(r.neto_al_vender)} color="#1E2230" sub="Lo que te llevas al vender, descontando crédito, comisión e impuestos." info={<>El dinero que de verdad te llevas al vender, ya quitando la deuda, la comisión y el impuesto. Ejemplo: aquí {m(r.neto_al_vender)} a los {H} años.</>} />
              </div>
              <SecTitle>🏡 Si es para vivir (habitarla)</SecTitle>
              <div style={grid}>
                {r.con_credito && r.credito && <MetricCard label="Mensualidad del crédito" badge="al mes" value={m(r.credito.pmt_mensual) + '/mes'} color="#1E2230" sub="Lo que pagas al banco cada mes (capital + intereses)." info={<>Lo que le pagas al banco cada mes, fijo. <b>Tu caso:</b> <b>{m(r.credito.pmt_mensual)}/mes</b> por {r.credito.plazo_anios} años.</>} />}
                <MetricCard label="Plusvalía (sube de valor)" badge="al año" value={`${apre}%/año`} color="#0EA5E9" sub={`En ${H} años acumula ~${m((r.atribucion || {}).plusvalia)} (fuente SHF). Ganas aunque nunca lo rentes.`} info={<>Tu depa vale más cada año. ~<b>{apre}%</b> al año (fuente SHF). En 1 año ~{m(gananciaPlusv1)}; en {H} años ~{m((r.atribucion || {}).plusvalia)}.</>} />
                <MetricCard label="Te cuesta vivir aquí" badge="al mes" value={m(costoVivirMes) + '/mes'} color="#1E2230" sub={`${r.con_credito ? 'Mensualidad + ' : ''}predial + mantenimiento + seguro. Compáralo con tu renta de hoy.`} info={<>Todo lo que pagas al mes por tener y usar el depa: {r.con_credito ? <>mensualidad ({m(r.credito.pmt_mensual)}) + </> : ''}predial + mantenimiento + seguro = <b>{m(costoVivirMes)}/mes</b>.</>} />
                <MetricCard label={r.con_credito ? 'Enganche (de tu bolsa hoy)' : 'Pago de contado'} badge="en total" value={m(deTuBolsa)} color="#1E2230" sub={r.con_credito ? `Enganche + escrituración. El resto (${m((r.credito || {}).monto_credito)}) lo presta el banco.` : 'Precio + escrituración + equipamiento (todo de contado).'} info={r.con_credito ? <>Lo que necesitas <b>hoy</b>: enganche + escritura = <b>{m(deTuBolsa)}</b>. El resto ({m((r.credito || {}).monto_credito)}) lo presta el banco.</> : <>De contado necesitas precio + escrituración + equipamiento = <b>{m(deTuBolsa)}</b>.</>} />
              </div>
            </>);
          })()}

          {/* DETALLE DEL DINERO · entrada (desglose) + salida (venta) en par · crédito a ancho completo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 14, alignItems: 'start' }}>
          {/* DESGLOSE DEL COSTO (cómo se arma la inversión · reading flow) */}
          {paso === 'dinero' && r && r.desglose && (
            <div className="iv4-card">
              <div className="iv4-sub" style={{ marginTop: 0, marginBottom: 10 }}>🧾 Cómo se arma la inversión <Info><><b>Todo lo que necesitas para comprar.</b> No es solo el precio: también los <b>gastos de escrituración</b> (ISAI + notario + registro, ~8% en CDMX) y el equipamiento. <b>Costo total = precio + escrituración.</b> Si vas con crédito, "de tu bolsa hoy" = enganche + gastos; el resto lo presta el banco.</></Info></div>
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
                    <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 6 }}>Calculado con el mismo motor del <ProyectorLink /> (ISAI progresivo CDMX 2026 + notario + registro + avalúo). El notario emite el definitivo.</div>
                  </div>
                </details>
              )}
              {r.con_credito && r.credito && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 0', marginTop: 6, borderTop: '1px solid rgba(16,18,28,0.05)', fontSize: 12 }}><span style={{ color: '#6B6F86' }}>De tu bolsa hoy (enganche + gastos)</span><span style={{ fontWeight: 800, color: '#6D4AFF' }}>{m(r.credito.capital_propio)}</span></div>}
            </div>
          )}

          {/* CUANDO LO VENDAS (impuestos · reusa el ISR del Proyector de Impuestos) — par con el desglose: entrada vs salida */}
          {paso === 'dinero' && r && r.venta && (
            <div className="iv4-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="iv4-sub" style={{ margin: 0 }}>🏁 Cuando lo vendas</div>
                <select value={f.horizonte_anios} onChange={(e) => set('horizonte_anios', Number(e.target.value))} style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11, color: '#6D4AFF', background: 'rgba(109,74,255,0.1)', border: 'none', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>{[3, 5, 7, 10, 15, 20].map((y) => <option key={y} value={y}>si vendes a los {y} años</option>)}</select>
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

          {/* CRÉDITO · nota si es de contado */}
          {paso === 'credito' && r && !f.con_credito && <div className="iv4-card" style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#5A5F6E', lineHeight: 1.55 }}>💵 Elegiste <b>pago de contado</b> — sin crédito hipotecario. Si quieres ver el desglose de una hipoteca (mensualidad, capital vs interés, año por año), cambia a <b>“Con crédito”</b> en el paso <b>Cómo lo pagas</b>.</div>}
          {/* CRÉDITO · UI en 3 secciones (reparto del precio · tu pago + split capital/interés · todo el plazo) */}
          {paso === 'credito' && r && r.con_credito && r.credito && r.credito.pmt_mensual && (() => {
            const cr = r.credito;
            const precio = (r.desglose || {}).valor_propiedad || Number(f.valor_propiedad) || 0;
            const engPuro = precio - cr.monto_credito;
            const capPct = cr.pago_anual ? Math.max(0, Math.min(100, Math.round((cr.capital_anio1 / cr.pago_anual) * 100))) : 0;
            const Tile = ({ l, v, c, exp }) => (
              <div style={{ position: 'relative', overflow: 'hidden', padding: '15px 15px 13px', borderRadius: 14, background: '#fff', border: '1px solid #ECECEC', boxShadow: '0 2px 8px rgba(16,18,28,0.03)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c || '#6D4AFF' }} />
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#5A5F6E', fontWeight: 700 }}>{l}</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: c || '#1E2230', marginTop: 4, letterSpacing: '-0.01em' }}>{v}</div>
                {exp && <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#8A8FA6', lineHeight: 1.45, marginTop: 5 }}>{exp}</div>}
              </div>
            );
            const Sub = ({ children }) => <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13.5, color: '#1E2230', margin: '18px 0 10px' }}>{children}</div>;
            return (
              <div className="iv4-card" style={{ gridColumn: '1 / -1' }}>
                <div className="iv4-sub" style={{ margin: 0 }}>💳 Tu crédito hipotecario <span style={{ fontFamily: 'DM Sans', fontWeight: 600, color: '#8A8FA6', fontSize: 12 }}>· {cr.plazo_anios} años · tasa {pct(cr.tasa_anual_pct)}</span> <Info><><b>Tu hipoteca, explicada.</b> El banco pone una parte (te presta) y tú el enganche. Cada mes pagas una mensualidad fija que se divide en <b>capital</b> (baja tu deuda) e <b>interés</b> (el cobro del banco). Al principio casi todo es interés. <b>Cómo se calcula:</b> amortización francesa con la tasa de Banxico. Tasa/mensualidad finales las define tu banco.</></Info></div>
                {/* controles aquí mismo · cambia sin subir (quita fricción) */}
                <div className="iv4-noprint" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10, padding: '10px 12px', background: 'rgba(109,74,255,0.05)', borderRadius: 10 }}>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700, marginBottom: 3 }}>Enganche</div><select value={f.ltv} onChange={(e) => set('ltv', Number(e.target.value))} style={{ ...inp, padding: '6px 9px', width: 'auto', fontSize: 12 }}>{[10, 20, 30, 40, 50, 60, 70, 80, 90].map((e) => <option key={e} value={(100 - e) / 100}>{e}%</option>)}</select></div>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700, marginBottom: 3 }}>Plazo</div><select value={f.plazo_meses} onChange={(e) => set('plazo_meses', Number(e.target.value))} style={{ ...inp, padding: '6px 9px', width: 'auto', fontSize: 12 }}>{[[36, '3 años'], [60, '5 años'], [84, '7 años'], [120, '10 años'], [180, '15 años'], [240, '20 años'], [300, '25 años']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700, marginBottom: 3 }}>Tasa anual %</div><input type="text" inputMode="decimal" placeholder="11.45" value={f.tasa_anual} onChange={(e) => set('tasa_anual', e.target.value.replace(/[^\d.]/g, ''))} style={{ ...inp, padding: '6px 9px', width: 80, fontSize: 12 }} /></div>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700, marginBottom: 3 }}>Abono extra/mes</div><input type="text" inputMode="numeric" value={m(f.abono_capital_mensual)} onChange={(e) => set('abono_capital_mensual', String(e.target.value).replace(/[^\d]/g, ''))} style={{ ...inp, padding: '6px 9px', width: 110, fontSize: 12 }} /></div>
                  <div style={{ fontSize: 9.5, color: '#A2A6BC', alignSelf: 'center' }}>↻ edítalo aquí, sin subir</div>
                </div>

                <Sub>Cómo se reparte el precio</Sub>
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
                  {[['Precio del depa', precio, '#1E2230'], ['=', null], ['Tu enganche', engPuro, '#6D4AFF'], ['+', null], ['Te prestan', cr.monto_credito, '#0E9F6E']].map(([l, v, c], i) => (
                    v === null ? <div key={i} style={{ alignSelf: 'center', fontSize: 20, fontWeight: 800, color: '#C9CCDB' }}>{l}</div>
                      : <div key={i} style={{ flex: '1 1 120px', padding: '13px 14px', borderRadius: 12, background: '#fff', border: '1px solid #ECECEC' }}><div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#5A5F6E', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: c, marginTop: 3 }}>{m(v)}</div></div>
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
                    <div style={{ width: `${capPct}%`, background: '#6D4AFF' }} /><div style={{ width: `${100 - capPct}%`, background: '#DC2626' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, fontWeight: 700, flexWrap: 'wrap' }}>
                    <span style={{ color: '#6D4AFF' }}>🟪 {m(cr.capital_anio1)} a capital ({capPct}%)</span>
                    <span style={{ color: '#DC2626' }}>🟥 {m(cr.interes_anio1)} a interés ({100 - capPct}%)</span>
                  </div>
                  <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 6 }}>Al principio casi todo es interés; con los años, cada vez más se va a capital (baja tu deuda).</div>
                </div>

                {/* AÑO POR AÑO · justo debajo del primer año, visible (no escondido) */}
                {cr.tabla_anual && cr.tabla_anual.length > 0 && (
                  <details style={{ marginTop: 12, border: '1px solid rgba(109,74,255,0.25)', borderRadius: 10, background: 'rgba(109,74,255,0.04)', padding: '10px 13px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#6D4AFF' }}>📅 ¿Y el 2°, 3°… año? Velo año por año hasta liquidar</summary>
                    <div style={{ overflowX: 'auto', marginTop: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr style={{ color: '#6B6F86' }}>{['Año', 'A capital', 'A interés', 'Te falta (saldo)'].map((h, i) => <th key={h} style={{ padding: '5px 8px', fontWeight: 700, textAlign: i ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                        <tbody>{cr.tabla_anual.map((row) => { const tot = row.capital + row.interes; const capPc = tot ? Math.round(row.capital / tot * 100) : 0; return (
                          <tr key={row.anio} style={{ borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                            <td style={{ padding: '5px 8px', fontWeight: 700 }}>{row.anio}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: '#6D4AFF', fontWeight: 700 }}>{m(row.capital)} <span style={{ color: '#A2A6BC', fontWeight: 500 }}>({capPc}%)</span></td>
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
                  <Tile l="Capital (préstamo)" v={m(cr.monto_credito)} c="#6D4AFF" exp="El préstamo que le regresas al banco." />
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
          {/* RENTA FIJA vs AIRBNB · rediseñado — ganador arriba, cifra grande + barra comparativa, lenguaje simple ───── */}
          {paso === 'renta' && r && r.comparar_renta && r.comparar_renta.largo && (() => {
            const cmp = r.comparar_renta;
            const ganaCorto = cmp.gana === 'corto';
            const nombreGana = ganaCorto ? 'Airbnb' : 'la renta fija';
            const quedaLargo = cmp.largo.noi || 0, quedaCorto = cmp.corto.noi || 0;
            const maxQueda = Math.max(Math.abs(quedaLargo), Math.abs(quedaCorto), 1);
            const delta = Math.abs(quedaCorto - quedaLargo);
            const infoRinde = <>Cuánto te deja la renta en un año comparado con lo que cuesta el depa. Ejemplo: si vale 100 y te deja 5 al año, rinde 5%.</>;
            const infoVende = <>Tu ganancia al año si lo rentas y al final lo vendes, juntando la renta y lo que subió de precio.</>;
            const infoMes = <>Lo que te queda cada mes después de gastos y del pago del banco. Si sale en rojo, tú pones esa diferencia.</>;
            const Opcion = ({ icon, titulo, x, comoIngreso, fuente, win, headInfo, gastosInfo }) => {
              const queda = x.noi || 0;
              const barPct = Math.max(5, Math.min(100, Math.round(Math.abs(queda) / maxQueda * 100)));
              return (
                <div style={{ flex: '1 1 280px', borderRadius: 16, background: win ? '#faf9ff' : '#fff', border: win ? '1.5px solid #6D4AFF' : '1px solid #ECECEC', boxShadow: win ? '0 8px 22px rgba(109,74,255,0.10)' : '0 2px 8px rgba(16,18,28,0.03)' }}>
                  <div style={{ padding: '16px 18px 4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 800, color: '#1E2230' }}>{icon} {titulo}<Info>{headInfo}</Info></div>
                      {win && <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: 'linear-gradient(120deg,#6D4AFF,#C63FAE)', borderRadius: 9999, padding: '3px 12px' }}>Gana</span>}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#5A5F6E', fontWeight: 600 }}>Te queda al año</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 27, color: queda >= 0 ? '#0E9F6E' : '#DC2626', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{m(queda)}</div>
                    <div style={{ height: 8, borderRadius: 6, background: '#F1F1F4', marginTop: 9, overflow: 'hidden' }}><div style={{ width: `${barPct}%`, height: '100%', background: win ? 'linear-gradient(90deg,#6D4AFF,#C63FAE)' : '#C7CAD6', borderRadius: 6 }} /></div>
                  </div>
                  <div style={{ padding: '10px 18px 4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', fontFamily: 'DM Sans', fontSize: 12.5 }}><span style={{ color: '#5A5F6E' }}>Lo que cobras al año</span><span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: '#1E2230' }}>{m(x.ingreso_anual)}</span></div>
                    <div style={{ fontSize: 10.5, color: '#A2A6BC', margin: '-3px 0 3px' }}>{comoIngreso}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', borderTop: '1px solid #F1F1F4', fontFamily: 'DM Sans', fontSize: 12.5 }}><span style={{ color: '#5A5F6E' }}>Menos gastos del año<Info>{gastosInfo}</Info></span><span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: '#DC2626' }}>−{m(x.egresos_anual)}</span></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: '10px 18px 16px' }}>
                    {[['Rinde al año', pct(x.cap_rate_pct), '#6D4AFF', infoRinde], ['Si vendes', pct(x.tir_pct), (x.tir_pct || 0) >= 0 ? '#0E9F6E' : '#DC2626', infoVende], ['Al mes', m(x.flujo_mensual), (x.flujo_mensual || 0) >= 0 ? '#1E2230' : '#DC2626', infoMes]].map(([l, v, c, inf]) => (
                      <div key={l} style={{ background: '#fafafb', border: '1px solid #ECECEC', borderRadius: 10, padding: '9px 10px' }}><div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#5A5F6E', fontWeight: 700, lineHeight: 1.2 }}>{l}<Info>{inf}</Info></div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: c, marginTop: 3 }}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: '#A2A6BC', padding: '0 18px 14px' }}>Números según: {fuente}</div>
                </div>
              );
            };
            return (
              <div className="iv4-card" style={{ gridColumn: '1 / -1' }}>
                <div className="iv4-sub" style={{ margin: 0 }}>🏨 ¿Rentar fijo o por Airbnb?</div>
                <div style={{ fontSize: 12, color: '#5B5F76', marginTop: 4, lineHeight: 1.5 }}>El mismo depa, dos maneras de rentarlo: a una persona todo el año (<b>renta fija</b>) o por noches como hotel (<b>Airbnb</b>). Ya restamos los gastos de cada una.</div>
                <div style={{ marginTop: 12, marginBottom: 14, padding: '12px 15px', borderRadius: 12, background: 'linear-gradient(120deg, rgba(109,74,255,0.09), rgba(198,63,174,0.06))', border: '1px solid rgba(109,74,255,0.18)', display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 20 }}>{ganaCorto ? '🏨' : '🏠'}</span>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#5B5F76', lineHeight: 1.5, flex: '1 1 220px' }}>Con tus datos gana <b style={{ color: '#6D4AFF' }}>{nombreGana}</b>: te deja <b>{m(delta)} más al año</b>. Airbnb suele dejar más pero da más trabajo; la renta fija deja menos pero es tranquila y sin broncas.</div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Opcion icon="🏠" titulo="Renta fija" x={cmp.largo} win={cmp.gana === 'largo'} comoIngreso={`${m(cmp.largo.ingreso_mensual)} al mes × 12 meses`} fuente="renta promedio de la zona"
                    headInfo={<>Le rentas a una persona todo el año, con contrato. Es lo más tranquilo: no limpias entre huéspedes ni dependes de la temporada. Ejemplo: la rentas en {m(cmp.largo.ingreso_mensual)} al mes, fijo.</>}
                    gastosInfo={<>Lo que gastas al año teniendo el depa rentado: predial, mantenimiento, seguro y administración. Ejemplo para este depa: {m(cmp.largo.egresos_anual)} al año. No trae los gastos extra de Airbnb.</>} />
                  <Opcion icon="🏨" titulo="Airbnb" x={cmp.corto} win={cmp.gana === 'corto'} comoIngreso={`${m(cmp.corto.tarifa_noche)} la noche × ~${cmp.corto.noches_mes} noches al mes (${cmp.corto.ocupacion_pct}% lleno) × 12`} fuente="AirROI · datos reales de la zona"
                    headInfo={<>Lo rentas por noches, como hotel. Suele dejar más dinero, pero da más trabajo (limpieza, atención) y depende de la temporada. Ejemplo: {m(cmp.corto.tarifa_noche)} la noche, ocupado unas {cmp.corto.noches_mes} noches al mes.</>}
                    gastosInfo={<>Los mismos gastos de la renta fija más los de Airbnb: limpieza, comisión de la plataforma, luz e internet. Por eso Airbnb gasta más. Ejemplo para este depa: {m(cmp.corto.egresos_anual)} al año (~22% de lo que cobras).</>} />
                </div>
              </div>
            );
          })()}

          {/* Cascada visual · de dónde viene tu ganancia */}
          {paso === 'renta' && r && r.atribucion && (() => {
            const a = r.atribucion; const tot = (a.renta_neta_acum || 0) + (a.equity_buildup || 0) + (a.plusvalia || 0);
            const segs = [['Renta', a.renta_neta_acum, '#0E9F6E'], ['Patrimonio', a.equity_buildup, '#6D4AFF'], ['Plusvalía', a.plusvalia, '#6D4AFF']].filter(([, v]) => (v || 0) > 0);
            return (
              <div className="iv4-card">
                <div className="iv4-sub" style={{ marginTop: 0, marginBottom: 10 }}>💹 De dónde viene tu ganancia <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: '#5A5F6E' }}>· {m(tot)}</span><Info><>Tu ganancia total sale de 3 cosas: <b>Renta</b> (lo que junta de rentas, ya sin gastos), <b>Patrimonio</b> (lo que pagaste del crédito y ya es tuyo) y <b>Plusvalía</b> (lo que subió de valor el depa). La barra muestra cuánto pone cada una. <b>Tu caso:</b> total {m(tot)}.</></Info></div>
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
          {paso === 'comparar' && r && r.instrumentos && r.instrumentos.length > 0 && (() => {
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
                <div className="iv4-sub" style={{ margin: 0 }}>📊 Tu inmueble vs otras inversiones</div>
                <div style={{ fontSize: 11.5, color: '#5B5F76', marginTop: 4, marginBottom: 12, lineHeight: 1.5 }}>Comparación con criterios <b>objetivos</b> (el <b>Pentágono de las Inversiones</b>: rendimiento · riesgo · liquidez · plazo · dedicación). Ninguna gana en todo — elige según lo que necesitas. Abajo se explica cada columna.</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead><tr style={{ color: '#6B6F86' }}>
                      <th style={{ padding: '7px 8px', fontWeight: 700, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap' }}>Opción</th>
                      {cols.map(([l]) => <th key={l} style={{ padding: '7px 8px', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>{l}</th>)}
                    </tr></thead>
                    <tbody>{filas.map((x, fi) => (
                      <tr key={fi} style={{ borderTop: '1px solid rgba(16,18,28,0.06)', background: x.hero ? 'rgba(109,74,255,0.07)' : 'transparent' }}>
                        <td style={{ padding: '8px', fontWeight: 800, color: x.hero ? '#6D4AFF' : '#16182A', position: 'sticky', left: 0, background: x.hero ? '#F3EFFF' : '#fff', whiteSpace: 'nowrap' }}>{x.hero ? '🏠 ' : ''}{x.nombre}{x.ejemplos && !x.hero ? <span style={{ display: 'block', fontSize: 9, fontWeight: 600, color: '#A2A6BC' }}>ej. {x.ejemplos}</span> : null}</td>
                        {cols.map(([l, get], ci) => <td key={l} style={{ padding: '8px', whiteSpace: 'nowrap', color: ci === 0 ? (x.hero ? '#6D4AFF' : '#16182A') : '#5B5F76', fontWeight: ci === 0 ? 800 : 600 }}>{get(x)}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {/* LEYENDA visible (los globitos se cortaban dentro del scroll) — qué significa cada columna */}
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(16,18,28,0.025)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#16182A', marginBottom: 8 }}>📖 Qué significa cada columna</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
                    {cols.map(([l, , leg]) => <div key={l} style={{ fontSize: 10.5, color: '#5B5F76', lineHeight: 1.5 }}><b style={{ color: '#6D4AFF' }}>{l}:</b> {leg}</div>)}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: '#5B5F76', marginTop: 12, padding: '10px 12px', background: 'rgba(109,74,255,0.05)', borderRadius: 10, lineHeight: 1.55 }}>💡 <b>Lo que solo el bien raíz te da</b> (fuera de estos ejes): se compra <b>a crédito</b> (apalancas con dinero del banco), es un <b>activo físico</b> que controlas, y te da <b>renta mensual</b> mientras sube de valor. Por eso se usa para diversificar, no para reemplazar a CETES o la bolsa.</div>
                <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 8, lineHeight: 1.5 }}>Fuentes: <b>Banxico</b> (CETES, tasas), <b>BMV</b> (FIBRAs, bolsa), <b>SHF</b> (plusvalía). Rendimientos de referencia jun-2026, no garantizados.</div>
              </div>
            );
          })()}

          {/* RADAR · Pentágono de las inversiones (perfil visual en 5 ejes) */}
          {paso === 'comparar' && r && r.instrumentos && r.instrumentos.length > 0 && (() => {
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
                  <div className="iv4-sub" style={{ margin: 0 }}>🕸️ Pentágono de las inversiones <Info><>Toda inversión se mide por 5 ejes: <b>rendimiento, riesgo, liquidez, plazo y dedicación</b>. El radar muestra el <b>perfil</b> (la forma) de tu inmueble contra otra inversión. Ninguna llena los 5 — cada una tiene su forma. Marco del Pentágono de las inversiones.</></Info></div>
                  <select value={radarK} onChange={(e) => setRadarK(e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 10px', fontSize: 12 }}>{r.instrumentos.map((i) => <option key={i.k} value={i.k}>vs {i.nombre}</option>)}</select>
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                  <svg viewBox="-34 0 368 290" style={{ width: 310, maxWidth: '100%' }}>
                    {[1, 2, 3, 4, 5].map((l) => <polygon key={l} points={grid(l)} fill="none" stroke="#E7E9F1" strokeWidth="1" />)}
                    {axes.map((_, i) => { const [x, y] = pt(i, 5); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#E7E9F1" strokeWidth="1" />; })}
                    <polygon points={polyOf(sC)} fill="rgba(148,153,174,0.22)" stroke="#9499AE" strokeWidth="2" />
                    <polygon points={polyOf(sI)} fill="rgba(109,74,255,0.20)" stroke="#6D4AFF" strokeWidth="2.5" />
                    {axes.map((ax, i) => { const [x, y] = pt(i, 5.82); const anc = x < cx - 10 ? 'end' : x > cx + 10 ? 'start' : 'middle'; return <text key={ax} x={x} y={y} fontSize="10.5" fontWeight="700" fill="#5B5F76" textAnchor={anc} dominantBaseline="middle">{ax}</text>; })}
                  </svg>
                  <div style={{ fontSize: 11.5, lineHeight: 1.6, flex: '1 1 180px' }}>
                    <div><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: '#6D4AFF', marginRight: 6 }} /><b>Tu inmueble</b> (TIR {pct(r.tir_pct)})</div>
                    <div style={{ marginTop: 4 }}><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: '#9499AE', marginRight: 6 }} />{comp.nombre} ({pct(comp.pct)})</div>
                    <div style={{ fontSize: 10, color: '#A2A6BC', marginTop: 10, lineHeight: 1.55 }}>Más hacia afuera = más de ese atributo. En <b>Rendimiento</b> y <b>Liquidez</b>, más es mejor. En <b>Riesgo</b>, <b>Plazo</b> y <b>Dedicación</b>, más = más riesgo / más tiempo comprometido / más trabajo (tú decides qué te conviene).</div>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>{/* fin grid visual */}

          {/* PROYECCIÓN AÑO A AÑO + cuándo salir (tabla + gráfica · ancho completo) */}
          {paso === 'comparar' && r && r.proyeccion && r.proyeccion.rows && r.proyeccion.rows.length > 0 && (
            <div className="iv4-card">
              <div className="iv4-sub" style={{ marginTop: 0, marginBottom: 6 }}>📅 Tu inversión año con año <Info><><b>Cómo leerla:</b> cada renglón es un año. <b>Valor</b> = cuánto valdrá el depa. <b>Renta/mes</b> = lo que paga el inquilino. <b>Ganancia/año</b> = renta menos gastos. <b>Mensualidad</b> = lo que pagas al banco. <b>Diferencial</b> = lo que te queda o pones de tu bolsa al mes. <b>TIR si vendes</b> = cuánto te rindió si vendes ese año.</></Info></div>
              <div style={{ fontSize: 11.5, color: '#6B6F86', marginBottom: 6, lineHeight: 1.45 }}>{r.proyeccion.recomendacion}<Info><><b>¿Cómo decidimos el mejor año para salir?</b> NO es "la TIR más alta" (eso siempre premia esperar, porque los costos de comprar/vender se reparten en más años). Usamos la regla de <b>retorno marginal de retención</b>: te conviene quedártelo mientras retenerlo un año más te rinda (renta sobre su valor actual + plusvalía) <b>más que tu tasa de oportunidad</b> (CETES + prima de riesgo ≈ {r.proyeccion.hurdle_pct}%). Cuando cae por debajo, conviene vender y reinvertir. <b>Depende de:</b> plusvalía esperada, qué tan rápido sube la renta, tasas, y si necesitas el dinero. <b>Fuente:</b> {r.proyeccion.bibliografia}</></Info></div>
              {r.proyeccion.bibliografia && <div style={{ fontSize: 9.5, color: '#A2A6BC', marginBottom: 12, fontStyle: 'italic' }}>Método: retorno marginal de retención vs tu tasa de oportunidad (~{r.proyeccion.hurdle_pct}%). Fuente: {r.proyeccion.bibliografia}</div>}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56, marginBottom: 12 }}>
                {r.proyeccion.rows.map((row) => { const mx = Math.max(...r.proyeccion.rows.map((x) => x.valor || 0)) || 1; const best = row.anio === r.proyeccion.mejor_anio; return (
                  <div key={row.anio} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <div style={{ width: '70%', height: `${Math.max(6, (row.valor / mx) * 44)}px`, background: best ? 'linear-gradient(180deg,#6D4AFF,#6D4AFF)' : '#C7CAD6', borderRadius: '4px 4px 0 0' }} title={m(row.valor)} />
                    <div style={{ fontSize: 9, color: best ? '#6D4AFF' : '#8A8FA6', fontWeight: best ? 800 : 600, marginTop: 4 }}>{row.anio}a</div>
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
                    <tr key={row.anio} style={{ borderTop: '1px solid rgba(16,18,28,0.06)', background: best ? 'rgba(109,74,255,0.07)' : 'transparent' }}>
                      <td style={{ padding: '7px 5px', fontWeight: 800, color: best ? '#6D4AFF' : '#16182A' }}>{row.anio}{best ? ' ⭐' : ''}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right' }}>{m(row.valor)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', color: '#0E9F6E' }}>+{m(row.plusvalia_acum)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right' }}>{m(row.renta_bruta_mensual)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right' }}>{m(row.noi_anual)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', color: '#8A8FA6' }}>{row.mensualidad_credito ? m(row.mensualidad_credito) : '—'}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', fontWeight: 700, color: dif >= 0 ? '#0E9F6E' : '#DC2626' }}>{m(dif)}/mes</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', fontWeight: 800, color: (row.tir_si_vendes || 0) >= 0 ? '#6D4AFF' : '#DC2626' }}>{pct(row.tir_si_vendes)}</td>
                    </tr>
                  ); })}</tbody>
                </table>
              </div>
              <div style={{ fontSize: 9.5, color: '#A2A6BC', fontStyle: 'italic', marginTop: 8 }}>⭐ = el mejor año para salir (TIR máxima). <b style={{ color: '#DC2626' }}>Diferencial en rojo</b> = pones de tu bolsa al mes (la renta aún no cubre el crédito); <b style={{ color: '#0E9F6E' }}>en verde</b> = te sobra. La mensualidad es fija y la renta sube cada año, así que con el tiempo mejora.</div>
            </div>
          )}

          {/* Alertas · tarjetas claras que explican y refieren a la métrica (en la tab Resultado) */}
          {paso === 'resumen' && r && r.alertas && Object.values(r.alertas).some(Boolean) && (() => {
            const items = [
              r.alertas.coc_negativo && { c: '#DC2626', t: 'Sale de tu bolsa cada mes', d: `Tu flujo mensual es negativo (~${m(Math.abs(r.flujo_mensual_1 || 0))}/mes): la renta no alcanza para gastos + mensualidad y tú pones la diferencia. Lo ves en la métrica "Flujo de la renta", aquí arriba.` },
              r.alertas.dscr_bajo_1 && { c: '#B4791F', t: 'La renta no cubre el crédito', d: `La renta paga solo ${pct((r.credito || {}).cobertura_renta_pct)} de tu mensualidad del banco. Sube el enganche o alarga el plazo. El detalle está en la pestaña "Tu crédito".` },
              r.alertas.cap_bajo_cetes && { c: '#B4791F', t: 'Rinde menos que CETES', d: `Tu renta rinde ${pct(r.cap_rate_pct)} al año, menos que CETES (${(r.mercado && (r.mercado.cetes_1a * 100).toFixed(1)) || '7.1'}%), que es más seguro. Aquí ganas sobre todo por plusvalía. Compáralo en la pestaña "Comparar".` },
            ].filter(Boolean);
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
                {items.map((a, i) => (
                  <div key={i} style={{ borderRadius: 14, padding: '13px 15px', background: `${a.c}0D`, border: `1px solid ${a.c}33`, borderLeft: `4px solid ${a.c}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}><span>⚠️</span><span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: a.c }}>{a.t}</span></div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#5A5F6E', lineHeight: 1.5 }}>{a.d}</div>
                  </div>
                ))}
              </div>
            );
          })()}

      {vista === 'institucional' && r && (() => {
        const cr = r.credito || {};
        const dif = (r.tir_pct || 0) - (r.tir_desapalancada_pct || 0);
        const mets = [
          ['Cap rate', pct(r.cap_rate_pct), '#6D4AFF', <>Renta neta ÷ precio. El rendimiento <b>anual</b> de la renta, sin contar el crédito. <b>Tu caso:</b> {pct(r.cap_rate_pct)}.</>],
          ['TIR (con crédito)', pct(r.tir_pct), '#6D4AFF', <>Rendimiento anual total <b>apalancado</b> (renta + plusvalía) si vendes al año {f.horizonte_anios}. <b>Tu caso:</b> {pct(r.tir_pct)}.</>],
          ['TIR al contado', pct(r.tir_desapalancada_pct), '#16182A', <>La TIR si compraras <b>sin crédito</b>. Compárala con la de arriba: la diferencia es el efecto del apalancamiento.</>],
          ['MIRR', pct(r.mirr_pct), '#16182A', <><b>TIR modificada</b>, más realista: asume que reinviertes los flujos a una tasa normal, no a la propia TIR (que suele inflar el número). Por eso suele ser menor que la TIR.</>],
          ['VPN', m(r.vpn), (r.vpn || 0) >= 0 ? '#0E9F6E' : '#DC2626', <><b>Valor Presente Neto:</b> cuánto ganas (o pierdes) <b>hoy</b>, en pesos de hoy, por encima de tu tasa de oportunidad ({pct(r.tasa_descuento_pct)}). Positivo = crea valor. <b>Tu caso:</b> {m(r.vpn)}.</>],
          ['ROI real', pct(r.roi_real_pct), '#16182A', <>Rendimiento <b>ya quitando la inflación</b> — tu poder de compra real. El nominal se ve más alto pero compra menos.</>],
          ['Cash-on-cash', pct(r.cash_on_cash_pct), '#16182A', <>Flujo del <b>primer año</b> ÷ lo que pusiste de tu bolsa. El "efectivo sobre efectivo" — cuánto te regresa en cash el año 1.</>],
          ['Multiplicas', r.equity_multiple ? `${r.equity_multiple}x` : '—', '#6D4AFF', <>Por cada <b>$1</b> que pones de tu bolsa, cuántos recuperas al final (renta + venta). <b>Tu caso:</b> {r.equity_multiple}x.</>],
          ...(cr.dscr != null ? [['DSCR', cr.dscr, (cr.dscr >= 1.2 ? '#0E9F6E' : cr.dscr >= 1 ? '#E0A33E' : '#DC2626'), <><b>Cobertura del crédito</b> (Debt Service Coverage Ratio): NOI ÷ pago anual al banco. Mayor a 1 = la renta cubre el crédito; los bancos suelen pedir <b>≥1.2</b>. <b>Tu caso:</b> {cr.dscr}.</>]] : []),
          ...(cr.debt_yield_pct != null ? [['Debt yield', pct(cr.debt_yield_pct), '#16182A', <>NOI ÷ monto del préstamo. Métrica de riesgo que mira el banco: arriba de <b>~10%</b> se considera sano. <b>Tu caso:</b> {pct(cr.debt_yield_pct)}.</>]] : []),
          ...((r.proyeccion || {}).payback_anio ? [['Recuperas tu inversión', `año ${r.proyeccion.payback_anio}`, '#0E9F6E', <>El año en que lo que te llevas al vender ya <b>recupera lo que pusiste</b> de tu bolsa. Antes de eso, todavía no "sales tablas". <b>Tu caso:</b> ~año {r.proyeccion.payback_anio}.</>]] : []),
        ];
        return (
          <div className="iv4-card" style={{ marginTop: 12, borderTop: '4px solid #6D4AFF' }}>
            <div className="iv4-sub" style={{ margin: 0 }}>🏛️ Métricas institucionales <span style={{ fontFamily: 'DM Sans', fontWeight: 600, color: '#8A8FA6', fontSize: 12 }}>· las mismas cifras, en versión experto</span></div>
            <div style={{ fontSize: 11.5, color: '#5B5F76', marginTop: 4, marginBottom: 12, lineHeight: 1.5 }}>Lo que mira un analista para evaluar a fondo. Cada número trae su <b>?</b> en simple.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
              {mets.map(([l, v, c, info]) => <div key={l} style={{ padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px solid rgba(16,18,28,0.08)' }}><div style={{ fontSize: 10, color: '#6B6F86', fontWeight: 700 }}>{l}<Info>{info}</Info></div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: c, marginTop: 3 }}>{v}</div></div>)}
            </div>
            {r.con_credito && r.tir_desapalancada_pct != null && (
              <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 10, background: r.apalancamiento === 'positivo' ? 'rgba(14,159,110,0.08)' : 'rgba(220,38,38,0.07)', fontSize: 11.5, lineHeight: 1.55, color: '#5B5F76' }}>
                ⚖️ <b>Efecto del crédito (apalancamiento):</b> con crédito tu TIR es <b>{pct(r.tir_pct)}</b> vs <b>{pct(r.tir_desapalancada_pct)}</b> al contado → el crédito <b style={{ color: dif >= 0 ? '#0E9F6E' : '#DC2626' }}>{dif >= 0 ? 'suma' : 'resta'} {Math.abs(dif).toFixed(1)} puntos</b>. {r.apalancamiento === 'positivo' ? 'El inmueble rinde más que la tasa del banco, así que el crédito amplifica tu ganancia.' : 'El inmueble rinde menos que la tasa del banco; el crédito resta — evalúa más enganche, mejor tasa o comprar al contado.'}
              </div>
            )}
            {r.analisis_institucional && (() => {
              const ai = r.analisis_institucional; const d = ai.descomposicion_retorno_pct;
              const sobreApal = r.con_credito && ai.prestamo_max_dscr12 && r.credito && r.credito.monto_credito > ai.prestamo_max_dscr12;
              return (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16182A', marginBottom: 8 }}>🔬 Due diligence de fondo <Info><>El bloque que revisa un comité de inversión: de dónde viene el retorno, si el precio compensa el riesgo (spread), cuánto te presta el banco a un DSCR sano, el reporte a nivel fondo y el riesgo de la zona. Marcos: CFA Institute · NCREIF/PREA · INREV · ULI · Geltner &amp; Miller. La valuación DCF sigue la estructura del RICS Red Book / IVS (tasa de descuento + proyección de ingreso + horizonte + valor de salida).</></Info></div>
                  {d && <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B6F86', marginBottom: 4 }}>¿De dónde viene tu retorno? <span style={{ fontWeight: 600, color: '#A2A6BC' }}>(NCREIF: income vs capital)</span></div>
                    <div style={{ display: 'flex', height: 14, borderRadius: 6, overflow: 'hidden', marginBottom: 5 }}>
                      {[['#0E9F6E', Math.max(0, d.renta)], ['#6D4AFF', Math.max(0, d.patrimonio)], ['#6D4AFF', Math.max(0, d.plusvalia)]].map(([c, v], i) => <div key={i} style={{ width: `${Math.min(100, v)}%`, background: c }} />)}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#5B5F76' }}>🟢 Renta {d.renta}% · 🟣 Patrimonio {d.patrimonio}% · 🟪 Plusvalía {d.plusvalia}% {d.renta < 0 ? <b style={{ color: '#DC2626' }}>· la renta resta (flujo negativo): el retorno es casi todo plusvalía/refugio</b> : null}</div>
                  </div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12 }}>
                    {[['Spread vs CETES', `${ai.spread_vs_cetes_pts >= 0 ? '+' : ''}${ai.spread_vs_cetes_pts} pts`, ai.spread_vs_cetes_pts >= 0 ? '#0E9F6E' : '#DC2626', <>Cap rate − CETES = la <b>prima de riesgo</b> que te paga el inmueble sobre lo seguro. Positivo = el precio compensa el riesgo; negativo = pagas caro vs CETES.</>],
                    ['Yield on cost', pct(ai.yield_on_cost_pct), '#16182A', <>NOI ÷ costo TOTAL (precio + escrituración). El rendimiento real sobre todo lo que pones, no solo el precio. Compáralo con el cap rate de mercado.</>],
                    ['Préstamo máx (DSCR 1.2)', m(ai.prestamo_max_dscr12), sobreApal ? '#DC2626' : '#0E9F6E', <>Lo máximo que un banco te prestaría para que la renta cubra el crédito a <b>1.2x</b> (estándar). Si tu crédito lo supera, estás sobre-apalancado.</>]].map(([l, v, c, info]) => (
                      <div key={l} style={{ padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px solid rgba(16,18,28,0.08)' }}><div style={{ fontSize: 10, color: '#6B6F86', fontWeight: 700 }}>{l}<Info>{info}</Info></div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: c, marginTop: 2 }}>{v}</div></div>
                    ))}
                  </div>
                  {sobreApal && <div style={{ fontSize: 10.5, color: '#8A6A1E', background: 'rgba(224,163,62,0.1)', borderRadius: 9, padding: '8px 11px', marginTop: 10, lineHeight: 1.5 }}>⚠️ <b>Sobre-apalancado:</b> el banco prestaría máx ~{m(ai.prestamo_max_dscr12)} a DSCR 1.2, pero tu crédito es {m(r.credito.monto_credito)} → la renta no cubre el crédito al estándar. Sube enganche o baja el préstamo.</div>}
                  {ai.estabilizacion && <div style={{ fontSize: 10.5, color: '#5B5F76', marginTop: 8 }}>📈 <b>Estabilización (lease-up):</b> con {ai.estabilizacion.vacancia_inicial_pct}% de vacancia inicial, el NOI del año 1 es {m(ai.estabilizacion.noi_ano1_leaseup)} vs {m(ai.estabilizacion.noi_estabilizado)} estabilizado.</div>}
                  {ai.metricas_fondo && (() => { const mfo = ai.metricas_fondo; return (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(16,18,28,0.1)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B6F86', marginBottom: 6 }}>📊 Reporte a nivel fondo <span style={{ fontWeight: 600, color: '#A2A6BC' }}>(estándar INREV / NCREIF · para LPs)</span> <Info><>Las métricas con las que un fondo institucional reporta a sus inversionistas (incluso internacionales). <b>TWR</b> = rendimiento time-weighted sin apalancar (renta + plusvalía, método NCREIF NPI). <b>SI-IRR</b> = TIR desde el inicio (money-weighted, lo que vive el inversionista). <b>TVPI</b> = valor total ÷ capital aportado. <b>DPI</b> = repartido en efectivo ÷ aportado. <b>RVPI</b> = por realizar (la venta) ÷ aportado. <b>PIC</b> = capital aportado. <b>TGER</b> = costos del vehículo ÷ valor.</></Info></div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(92px,1fr))', gap: 10 }}>
                        {[['TWR (s/ apal.)', pct(mfo.twr_unlev_pct), '#0E7A53'], ...(mfo.si_irr_pct != null ? [['SI-IRR', pct(mfo.si_irr_pct), (mfo.si_irr_pct || 0) >= 0 ? '#0E9F6E' : '#DC2626']] : []), ['TVPI', `${mfo.tvpi}×`, '#6D4AFF'], ['DPI', `${mfo.dpi}×`, '#16182A'], ['RVPI', `${mfo.rvpi}×`, '#6D4AFF'], ['PIC', m(mfo.pic), '#16182A'], ...(mfo.tger_pct != null ? [['TGER', pct(mfo.tger_pct), '#6B6F86']] : [])].map(([l, v, c]) => (
                          <div key={l} style={{ padding: '8px 10px', borderRadius: 9, background: '#fff', border: '1px solid rgba(16,18,28,0.07)' }}><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: c, marginTop: 1 }}>{v}</div></div>
                        ))}
                      </div>
                      {mfo.twr_horizontes_pct && <div style={{ marginTop: 8, fontSize: 10.5, color: '#5B5F76' }}>📅 <b>TWR por horizonte</b> (anualizado, sin apalancar): {Object.entries(mfo.twr_horizontes_pct).map(([h, v], i) => <span key={h}>{i ? ' · ' : ' '}<b>{h}a</b> {pct(v)}</span>)} <Info><>Rendimiento total anualizado si mantienes 1, 3, 5 o 10 años (time-weighted, método NCREIF). Es el que un fondo compara contra su índice de referencia.</></Info></div>}
                      {mfo.dpi === 0 && mfo.rvpi > 0 && <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 6 }}>DPI = 0: la renta no reparte efectivo (flujo operativo ≤ 0); el retorno se realiza al vender (RVPI).</div>}
                    </div>
                  ); })()}
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 10.5, color: '#5B5F76' }}>
                    {(() => { const ab = zonaCtx && zonaCtx.absorcion; return (ab && ab.velocidad_mensual != null) ? (
                      <div>🏗️ <b>Absorción de la zona:</b> ~{ab.velocidad_mensual} unidades/mes · {ab.meses_para_agotar != null ? `${ab.meses_para_agotar} meses para agotar el inventario` : 'inventario amplio'} ({ab.disponibles} disponibles{ab.n_proyectos ? ` · ${ab.n_proyectos} proyectos` : ''}){ab.es_estimado ? ' · preliminar' : ''} <Info><>Qué tan rápido se vende la oferta de la zona (ULI). Velocidad = unidades vendidas/mes; meses para agotar = inventario ÷ velocidad. Más meses = más presión a precios. Fuente: motor de absorción DMX ({ab.data_basis === 'real' ? 'oferta real' : 'demo'}).</></Info></div>
                    ) : (numDesarrollos != null && <div>🏗️ <b>Oferta en la zona:</b> ~{numDesarrollos} desarrollos compitiendo <Info><>Cuántos proyectos compiten por el mismo comprador/inquilino (ULI: absorción y pipeline).</></Info></div>); })()}
                    {(() => { const rg = zonaCtx && zonaCtx.riesgo; const tiene = rg && (rg.flood_risk != null || rg.sismic_score != null || rg.subsidence != null) && rg.tiene_datos; return tiene ? (
                      <div>⚠️ <b>Riesgo físico:</b> inundación {rg.flood_risk != null ? `${Math.round(rg.flood_risk)}/100` : 's/d'}{rg.sismic_score != null ? ` · sísmico ${Math.round(rg.sismic_score)}/100` : ''}{rg.subsidence != null ? ` · hundimiento ${rg.subsidence} cm/año` : ''}{rg.drivers && rg.drivers.length ? ` · ${rg.drivers.join(', ')}` : ''} <Info><>Riesgo físico de la zona (cada vez más exigido en comité institucional). Fuente: capas de riesgo natural DMX + CENAPRED/SACMEX. Datos al {rg.completeness || 0}%; lo sísmico/subsidencia se completa por colonia.</></Info></div>
                    ) : (
                      <div>⚠️ <b>Riesgo físico / ESG:</b> sísmico (CDMX) · inundación <Info><>Se alimenta de las capas de riesgo natural DMX (CENAPRED/SACMEX); aún sin datos suficientes para esta colonia.</></Info></div>
                    ); })()}
                  </div>
                  {(() => { const pml = zonaCtx && zonaCtx.riesgo && zonaCtx.riesgo.pml; if (!pml) return null; const valorBase = (r.desglose && r.desglose.valor_propiedad) || 0; return (
                    <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 10.5, color: '#5B5F76' }}>
                      <div>🌐 <b>Riesgo sísmico (PML):</b> pérdida esperada <b>{pml.sel_pct}%</b> ({m(Math.round(valorBase * pml.sel_pct / 100))}) · severa SUL/PML90 <b style={{ color: '#DC2626' }}>{pml.sul_pct}%</b> ({m(Math.round(valorBase * pml.sul_pct / 100))}) <Info><>Probable Maximum Loss sísmico (marco ASTM E2557/E2026). <b>SEL</b> = pérdida esperada del escenario; <b>SUL</b> (PML90) = la que tiene 10% de probabilidad de superarse. {pml.basis === 'atlas' ? `Zona sísmica ${pml.sismic_zone} (Atlas de Riesgos CDMX, dato por colonia).` : pml.basis === 'alcaldia' ? `Zona sísmica ${pml.sismic_zone} estimada por la zona geotécnica de la alcaldía (NTC CDMX) — se afina con el Atlas de Riesgos por colonia.` : 'Screening genérico CDMX — se afina con el Atlas de Riesgos por colonia.'}</></Info></div>
                    </div>
                  ); })()}
                  {(() => { const shf = zonaCtx && zonaCtx.shf; if (!shf) return null; const miPlus = (f.apreciacion_anual || 0) * 100; return (
                    <div style={{ marginTop: 8, fontSize: 10.5, color: '#5B5F76' }}>📈 <b>Plusvalía vs SHF</b> ({shf.fecha}): tu supuesto <b>{miPlus.toFixed(1)}%</b> · SHF <b>Valle de México {shf.apreciacion_valle_mexico_pct}%</b> · nacional {shf.apreciacion_nacional_pct}%{shf.bbva_nueva_pct ? ` · BBVA vivienda nueva ${shf.bbva_nueva_pct}%` : ''} <Info><>El Índice SHF de precios de vivienda (Base {shf.base}) es el benchmark oficial de apreciación en México. Para CDMX/Polanco la referencia es <b>Valle de México ({shf.apreciacion_valle_mexico_pct}%)</b>, más moderada que el promedio nacional. {shf.fuente}. Si tu supuesto se aleja mucho, ajústalo.</></Info></div>
                  ); })()}
                </div>
              );
            })()}
            {capRateMercado != null && r.cap_rate_pct != null && (() => {
              const dif = +(r.cap_rate_pct - capRateMercado).toFixed(2);
              return (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16182A', marginBottom: 8 }}>Calidad de entrada · tu cap rate vs el de la zona <Info><>La primera pregunta de un fondo: <b>¿compras bien?</b> Si tu cap rate de entrada es <b>mayor</b> que el promedio de la zona, pagas relativamente <b>barato</b> (mejor yield); si es menor, pagas caro. Fuente del mercado: promedio de la colonia (motor DMX).</></Info></div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 10, color: '#6B6F86', fontWeight: 700 }}>Tu cap rate</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: '#6D4AFF' }}>{pct(r.cap_rate_pct)}</div></div>
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
                    <div key={k} style={{ padding: '11px 13px', borderRadius: 10, background: k === 'base' ? 'rgba(109,74,255,0.07)' : 'rgba(16,18,28,0.03)', border: k === 'base' ? '1.5px solid #6D4AFF' : '1px solid transparent' }}>
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
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{r.sensibilidad.por_exit_cap.map((s) => <div key={s.exit_cap_pct} style={{ textAlign: 'center', padding: '6px 9px', borderRadius: 8, background: s.es_base ? 'rgba(109,74,255,0.1)' : 'rgba(16,18,28,0.04)', border: s.es_base ? '1.5px solid #6D4AFF' : '1px solid transparent' }}><div style={{ fontSize: 9.5, color: '#8A8FA6' }}>{s.exit_cap_pct}%</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: s.es_base ? '#6D4AFF' : '#16182A' }}>{pct(s.tir_pct)}</div></div>)}</div>
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
                        {f.celdas.map((c, ci) => { const t = c.tir_pct || 0; const bg = t < 0 ? '#FCE4E4' : t < 7 ? '#FCF1DD' : '#E3F5EC'; const col = t < 0 ? '#DC2626' : t < 7 ? '#8A6A1E' : '#0E7A53'; return <td key={ci} style={{ padding: '6px 9px', textAlign: 'center', fontWeight: 800, color: col, background: bg, border: c.es_base ? '2px solid #6D4AFF' : '1px solid #fff' }}>{pct(c.tir_pct)}</td>; })}
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
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 34, marginTop: 8 }}>{r.montecarlo.hist.map((h, i) => { const mx = Math.max(...r.montecarlo.hist.map((x) => x.n)) || 1; return <div key={i} title={`desde ${h.desde}% · ${h.n}`} style={{ flex: 1, height: `${Math.max(4, (h.n / mx) * 100)}%`, background: 'linear-gradient(180deg,#6D4AFF,#6D4AFF)', borderRadius: '3px 3px 0 0', opacity: 0.8 }} />; })}</div>
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
      {paso === 'comparar' && r && (
        <div className="iv4-noprint" style={{ marginTop: 16, padding: '18px 22px', borderRadius: 16, background: 'linear-gradient(120deg, #6D4AFF, #C63FAE)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', boxShadow: '0 10px 28px rgba(109,74,255,0.28)' }}>
          <div style={{ flex: '1 1 280px' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16.5 }}>¿Te late? Llévalo al siguiente paso.</div>
            <div style={{ fontSize: 12, opacity: 0.92, marginTop: 3, lineHeight: 1.45 }}>Un asesor te arma el plan a tu medida —crédito, mejor año para vender, apartado— sin costo y sin compromiso.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('dmx:lead', { detail: { source: 'calculadora_inversion', zona: zoneId, precio: f.valor_propiedad, tir: r.tir_pct } })); } catch { /* noop */ } askAtlax(`Me interesa invertir en este depa de ${m(f.valor_propiedad)} (TIR ${pct(r.tir_pct)}). Ayúdame con el siguiente paso y conéctame con un asesor.`); }} style={{ padding: '12px 18px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, background: '#fff', color: '#6D4AFF' }}>📩 Quiero que me asesoren</button>
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
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: '#5B5F76', cursor: 'pointer', lineHeight: 1.5 }}><input type="checkbox" checked={leadData.privacidad} onChange={(e) => setLead('privacidad', e.target.checked)} style={{ marginTop: 2 }} /><span>Acepto el <a href="/aviso-privacidad" target="_blank" rel="noreferrer" style={{ color: '#6D4AFF' }}>aviso de privacidad</a> y que un asesor me contacte.</span></label>
              {leadState === 'error' && <div style={{ fontSize: 11, color: '#DC2626' }}>Revisa nombre, WhatsApp (10 dígitos) y el aviso de privacidad.</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={enviarLead} disabled={leadState === 'enviando'} style={{ flex: 1, padding: '12px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, background: 'linear-gradient(120deg,#6D4AFF,#6D4AFF)', color: '#fff' }}>{leadState === 'enviando' ? 'Enviando…' : leadState === 'ok' ? '✓ ¡Listo! Abriendo PDF…' : 'Descargar PDF'}</button>
                <button type="button" onClick={() => setLeadOpen(false)} style={{ padding: '12px 16px', borderRadius: 11, border: '1px solid rgba(16,18,28,0.15)', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, background: '#fff', color: '#6B6F86' }}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FUENTES (de dónde sale cada dato · visible) */}
      {paso === 'comparar' && r && r.fuentes && (
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
        {/* NO cambiar el texto con `loading` (saltaba en cada tecla). CETES/UDIS/FIX no cambian al editar → línea estable. */}
        {`Mercado vivo: CETES ${(r && r.mercado && (r.mercado.cetes_1a * 100).toFixed(1)) || '7.0'}% · UDIS ${(r && r.mercado && r.mercado.udis) || '—'} · USD ${(r && r.mercado && r.mercado.fix_usd) || '—'} (Banxico). `}
        Informativo · no sustituye asesoría fiscal/financiera. Cifras estimadas jun-2026. El ISR aquí es una estimación;
        para el detalle de <b>ISAI</b> (al comprar) e <b>ISR</b> (al vender) usa el <ProyectorLink />. El cálculo definitivo lo hace tu contador/notario.
      </div>

      {/* ───── NAV DE TABS · Atrás / Siguiente (lleva al cliente por cada sección) ───── */}
      {isResult && r && (
        <div className="iv4-noprint" style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #ECECEC', paddingTop: 16 }}>
          {prevTab && <button type="button" onClick={() => goTab(prevTab.k)} style={{ padding: '11px 16px', borderRadius: 11, border: '1px solid #ECECEC', background: '#fff', color: '#5A5F6E', fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>← {prevTab.l}</button>}
          {nextTab && <button type="button" onClick={() => goTab(nextTab.k)} style={{ marginLeft: 'auto', padding: '12px 22px', borderRadius: 11, border: 'none', background: 'linear-gradient(120deg, #6D4AFF, #C63FAE)', color: '#fff', fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', boxShadow: '0 8px 20px rgba(109,74,255,0.26)' }}>Siguiente · {nextTab.l} →</button>}
        </div>
      )}

      {/* ───── BARRA STICKY · portal a body (un ancestro .zv2-up tiene transform y rompe position:fixed) ───── */}
      {!noStickyBar && showSticky && r && createPortal(
        <div className="iv4-noprint" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1200, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(6px)', borderTop: '1px solid rgba(16,18,28,0.1)', boxShadow: '0 -6px 22px rgba(16,18,28,0.1)', padding: '9px 16px' }}>
          <div style={{ maxWidth: 1140, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 9, color: '#6B6F86', fontWeight: 700 }}>Renta/año</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: '#6D4AFF', lineHeight: 1 }}>{pct(r.cap_rate_pct)}</div></div>
            <div><div style={{ fontSize: 9, color: '#6B6F86', fontWeight: 700 }}>TIR (vende {f.horizonte_anios}a)</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: sem, lineHeight: 1 }}>{pct(r.tir_pct)}</div></div>
            <div><div style={{ fontSize: 9, color: '#6B6F86', fontWeight: 700 }}>Flujo/mes</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: (r.flujo_mensual_1 || 0) >= 0 ? '#16182A' : '#DC2626', lineHeight: 1 }}>{m(r.flujo_mensual_1)}</div></div>
            <div style={{ width: 1, height: 30, background: 'rgba(16,18,28,0.1)' }} />
            <div style={{ display: 'inline-flex', background: 'rgba(16,18,28,0.05)', borderRadius: 9999, padding: 2 }}>
              {[[false, 'Contado'], [true, 'Crédito']].map(([v, l]) => { const on = f.con_credito === v; return <button key={l} type="button" onClick={() => set('con_credito', v)} style={{ padding: '5px 11px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11.5, background: on ? '#fff' : 'transparent', color: on ? '#6D4AFF' : '#6B6F86', boxShadow: on ? '0 1px 5px rgba(16,18,28,0.1)' : 'none' }}>{l}</button>; })}
            </div>
            {f.con_credito && <select value={f.ltv} onChange={(e) => set('ltv', Number(e.target.value))} style={{ ...inp, width: 'auto', padding: '5px 8px', fontSize: 11.5 }}>{[10, 20, 30, 40, 50, 60, 70, 80, 90].map((e) => <option key={e} value={(100 - e) / 100}>{e}% eng.</option>)}</select>}
            {f.con_credito && <select value={f.plazo_meses} onChange={(e) => set('plazo_meses', Number(e.target.value))} style={{ ...inp, width: 'auto', padding: '5px 8px', fontSize: 11.5 }}>{[[36, '3a'], [60, '5a'], [84, '7a'], [120, '10a'], [180, '15a'], [240, '20a'], [300, '25a']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
            {f.con_credito && <input type="text" inputMode="decimal" placeholder="tasa%" value={f.tasa_anual} onChange={(e) => set('tasa_anual', e.target.value.replace(/[^\d.]/g, ''))} style={{ ...inp, width: 64, padding: '5px 8px', fontSize: 11.5 }} />}
            <button type="button" onClick={() => tusDatosRef.current && tusDatosRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(99,102,241,0.25)', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, background: '#fff', color: '#6D4AFF' }}>↑ Editar todo</button>
          </div>
        </div>, document.body)}
    </div>
  );
}

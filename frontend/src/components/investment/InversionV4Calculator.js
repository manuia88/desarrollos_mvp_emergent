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

export default function InversionV4Calculator({ prefilled = {}, lockPrice = false, zoneId = '' }) {
  const precio0 = prefilled.precio || 5_000_000;
  const [f, setF] = useState({
    valor_propiedad: precio0, num_unidades: 1,
    con_credito: true, ltv: 0.80, tasa_anual: '', plazo_meses: 240, abono_capital_mensual: 0,
    modo_renta: 'largo', renta_mensual: prefilled.renta || Math.round(precio0 * 0.0045), tasa_vacancia: 0.05,
    tarifa_noche: Math.round((prefilled.renta || precio0 * 0.0045) / 30 * 2.2), ocupacion_pct: 0.6,
    predial: Math.round(precio0 * 0.0016), mantenimiento: Math.round(precio0 * 0.0024), seguro: Math.round(precio0 * 0.0012),
    horizonte_anios: 5, apreciacion_anual: 0.075, crecimiento_renta_anual: 0.05,
    perfil: 'fisica', tipo_inmueble: 'residencial', es_casa_habitacion: true, regimen_fiscal: 'auto',
  });
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(false);
  const [vista, setVista] = useState('simple');     // 'simple' (te lleva de la mano) | 'institucional' (experto)
  const [openAdv, setOpenAdv] = useState(false);
  const [comparar, setComparar] = useState([]);
  const [moneda, setMoneda] = useState('MXN');     // MXN | USD (convierte con el FIX vivo de Banxico)
  const [airroi, setAirroi] = useState(null);       // datos reales de renta corta (AirROI) por zona
  const [airroiLoading, setAirroiLoading] = useState(false);
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

  useEffect(() => {
    clearTimeout(timer.current);
    const num = (x) => (x === '' || x === null ? undefined : Number(x));
    const tasaFrac = (f.tasa_anual === '' || f.tasa_anual === null || f.tasa_anual === undefined) ? undefined : Number(f.tasa_anual) / 100;
    const payload = { ...f, incluir_sensibilidad: vista === 'institucional', valor_propiedad: num(f.valor_propiedad), renta_mensual: num(f.renta_mensual), num_unidades: num(f.num_unidades), ltv: num(f.ltv), tasa_anual: tasaFrac, plazo_meses: num(f.plazo_meses), abono_capital_mensual: num(f.abono_capital_mensual) || 0, apreciacion_anual: num(f.apreciacion_anual), crecimiento_renta_anual: num(f.crecimiento_renta_anual), zone_id: zoneId || undefined, usa_airroi: !!(airroi && airroi.adr_mxn) };
    timer.current = setTimeout(() => run(payload), 250);
    return () => clearTimeout(timer.current);
  }, [f, vista, run, zoneId, airroi]);

  // al elegir otra unidad/proyecto (cambia el precio que llega), sincroniza el precio bloqueado → permite comparar proyectos
  useEffect(() => {
    if (prefilled.precio) setF((s) => ({ ...s, valor_propiedad: prefilled.precio, renta_mensual: prefilled.renta || s.renta_mensual }));
  }, [prefilled.precio, prefilled.renta]);

  // estilos
  const inp = { background: '#fff', border: '1px solid rgba(16,18,28,0.16)', borderRadius: 9, color: '#16182A', fontFamily: 'DM Sans', fontSize: 13, padding: '9px 11px', width: '100%', outline: 'none', boxSizing: 'border-box' };
  const lab = { fontFamily: 'DM Sans', fontSize: 10.5, color: '#6B6F86', marginBottom: 5, display: 'block', fontWeight: 700 };
  const sectTitle = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: '#16182A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 };
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
      <div className="iv4-card iv4-noprint" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ ...sectTitle, marginBottom: 0 }}>🏠 Tus datos</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', background: 'rgba(16,18,28,0.05)', borderRadius: 9999, padding: 3 }}>
              {[['simple', '👤 Para ti'], ['institucional', '🏛️ Institucional']].map(([v, l]) => (
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 13, alignItems: 'end' }}>
          <div><span style={lab}>Precio {lockPrice && <span style={{ color: '#8A8FA6', fontWeight: 600 }}>🔒 fijo</span>}</span>
            {lockPrice ? <input type="text" readOnly value={m(f.valor_propiedad)} style={{ ...inp, background: '#F4F5F8', color: '#5B5F76', cursor: 'not-allowed' }} />
              : <input type="text" inputMode="numeric" value={m(f.valor_propiedad)} onChange={(e) => set('valor_propiedad', String(e.target.value).replace(/[^\d]/g, ''))} style={inp} />}</div>
          <div><span style={lab}>Tipo de renta</span><Toggle k="modo_renta" opts={[['largo', 'Largo'], ['corto', 'Airbnb']]} /></div>
          {f.modo_renta === 'corto' ? (<>
            <Field label="Tarifa Por Noche" k="tarifa_noche" money auto />
            <div><span style={lab}>Ocupación (%) <Auto /></span><input type="number" value={Math.round((f.ocupacion_pct || 0.6) * 100)} onChange={(e) => set('ocupacion_pct', Number(e.target.value) / 100)} style={inp} /></div>
          </>) : <Field label="Renta Mensual" k="renta_mensual" money auto />}
          <div><span style={lab}>N° Unidades {multifamily && <span style={{ color: '#6D28D9', fontWeight: 700 }}>·multi</span>}</span><input type="number" value={f.num_unidades} onChange={(e) => set('num_unidades', e.target.value)} style={inp} /></div>
          <div><span style={lab}>Cómo lo pagas</span><Toggle k="con_credito" opts={[[false, 'Contado'], [true, 'Crédito']]} /></div>
          {f.con_credito && <div><span style={lab}>Enganche</span><select value={f.ltv} onChange={(e) => set('ltv', Number(e.target.value))} style={inp}>{[[0.9, '10%'], [0.8, '20%'], [0.7, '30%'], [0.5, '50%']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
          {f.con_credito && <div><span style={lab}>Plazo</span><select value={f.plazo_meses} onChange={(e) => set('plazo_meses', Number(e.target.value))} style={inp}>{[[36, '3 años'], [60, '5 años'], [84, '7 años'], [120, '10 años'], [180, '15 años'], [240, '20 años'], [300, '25 años']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
          {f.con_credito && <div><span style={lab}>Tasa anual (%) <Auto /></span><input type="text" inputMode="decimal" placeholder="11.45 (Banxico)" value={f.tasa_anual} onChange={(e) => set('tasa_anual', e.target.value.replace(/[^\d.]/g, ''))} style={inp} /></div>}
          {f.con_credito && <div><span style={lab}>Abono extra/mes <span style={{ color: '#8A8FA6', fontWeight: 600 }}>opc.</span></span><input type="text" inputMode="numeric" value={m(f.abono_capital_mensual)} onChange={(e) => set('abono_capital_mensual', String(e.target.value).replace(/[^\d]/g, ''))} style={inp} /></div>}
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
        <div style={{ fontSize: 10, color: '#A2A6BC', marginTop: 12, lineHeight: 1.5 }}>Los campos <b style={{ color: '#6D28D9' }}>AUTO</b> son estimados (renta de la zona, predial/mantenim. típicos) — edítalos aquí o en <b>Configuración</b>.{f.con_credito ? ' El abono extra a capital baja el saldo: liquidas antes y pagas menos intereses.' : ''} Solo el precio está fijo.</div>
        {/* CONFIGURACIÓN (supuestos) · dentro de Tus datos */}
        <div style={{ borderTop: '1px solid rgba(16,18,28,0.07)', marginTop: 14, paddingTop: 12 }}>
          <button type="button" onClick={() => setOpenAdv((o) => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: '#16182A' }}>
            <span>⚙️ Configuración <span style={{ fontWeight: 600, color: '#8A8FA6', fontSize: 11 }}>· predial, mantenimiento, horizonte, plusvalía, régimen fiscal</span></span><span style={{ color: '#6D4AFF' }}>{openAdv ? '−' : '+'}</span>
          </button>
          {openAdv && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 14 }}>
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

      {vista === 'simple' && <div style={{ fontSize: 11.5, color: '#8A8FA6', marginBottom: 12 }}>Te explicamos cada número en palabras simples. ¿Eres experto? Cambia a Institucional ↑</div>}

      {/* ───── RESULTADOS (ancho completo · sin columna angosta = sin huecos) ───── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Resultado grande + veredicto */}
          {r && (
            <div className="iv4-card" style={{ borderTop: `5px solid ${sem}`, background: `linear-gradient(180deg, ${sem}0D, #fff 60%)` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11.5, color: '#6B6F86', fontWeight: 700 }}>Rendimiento anual (TIR)<Tip g="tir" /></div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 44, color: sem, letterSpacing: '-0.03em', lineHeight: 1 }}>{pct(r.tir_pct)}</div>
                </div>
                {r.veredicto && <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: sem, background: `${sem}18`, borderRadius: 9999, padding: '6px 14px' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: sem }} />{r.veredicto.nivel}</span>
                </div>}
              </div>
              {vista === 'simple' && <div style={{ fontSize: 11.5, color: '#8A8FA6', marginTop: 8 }}>La TIR es tu ganancia real por año juntando renta + plusvalía. Si supera a CETES ({(r.cetes_1a_pct) || 7}%), tu dinero rinde mejor que sin riesgo.</div>}
              <p style={{ fontSize: 13, color: '#5B5F76', lineHeight: 1.55, marginTop: 10, marginBottom: 0 }}>{r.veredicto && r.veredicto.parrafo}</p>
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
                {items.map(([ic, l, v, c, exp, p], i) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 20px', borderTop: '1px solid rgba(16,18,28,0.06)' }}>
                    <span style={{ fontSize: 16, lineHeight: 1.2 }}>{ic}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: '#16182A' }}>{l}<Badge p={p} /></span>
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
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, alignItems: 'start' }}>
                <Grupo titulo="📈 Si es para invertir (rentarla)" sub="Lo que importa si la vas a rentar." items={[
                  ['🔑', 'Rendimiento de la renta (cap rate)', pct(r.cap_rate_pct), '#C026D3', 'Cuánto te deja la renta sobre el precio, sin contar el crédito.', 'anual'],
                  ['💰', 'Rendimiento promedio (ROI)', pct(r.roi_anualizado_pct), '#0E9F6E', 'Tu ganancia promedio contando TODO (renta + venta), repartida en los años.', 'anual'],
                  ['🏦', 'Flujo de la renta', m(r.flujo_mensual_1) + '/mes', (r.flujo_mensual_1 || 0) >= 0 ? '#0E9F6E' : '#DC2626', 'Lo que te queda (o sale de tu bolsa) cada mes tras gastos y crédito.', 'mensual'],
                  ['✖️', 'Multiplicas tu dinero', r.equity_multiple ? `${r.equity_multiple}x` : '—', '#7C5CFF', 'Por cada peso que pones, cuántos recuperas al final.', 'total'],
                  ['🏁', 'Neto al vender', m(r.neto_al_vender), '#16182A', 'Lo que te llevas al vender, descontando crédito, comisión e impuestos.', 'venta'],
                ]} />
                <Grupo titulo="🏡 Si es para vivir (habitarla)" sub="Lo que importa si la vas a usar tú." items={[
                  ...(r.con_credito && r.credito ? [['💳', 'Mensualidad del crédito', m(r.credito.pmt_mensual) + '/mes', '#16182A', 'Lo que pagas al banco cada mes (capital + intereses).', 'mensual']] : []),
                  ['📈', 'Plusvalía (sube de valor)', `${apre}%/año`, '#0EA5E9', `Si vendieras en 1 año, tu ganancia por plusvalía sería ~${m(gananciaPlusv1)} (el ${apre}% del valor al año, fuente SHF). En ${horizonte} años acumula ~${m((r.atribucion || {}).plusvalia)}. Ganas aunque nunca la rentes.`, 'anual'],
                  ['🏛️', 'Patrimonio que construyes', m((r.atribucion || {}).equity_buildup), '#6D4AFF', `NO es anual: es el ACUMULADO de ${horizonte} años (${mesesHz} mensualidades). De cada pago al banco, una parte abona al capital (baja tu deuda, no es interés). Sumando esa parte de las ${mesesHz} mensualidades, ya es tuyo esto del depa.`, 'total'],
                  ['🧾', r.con_credito ? 'Enganche (de tu bolsa hoy)' : 'Pago de contado', m(deTuBolsa), '#16182A', r.con_credito ? `Lo que pones HOY de tu bolsa: enganche + gastos de escrituración. El resto (${m((r.credito || {}).monto_credito)}) lo presta el banco.` : 'Como es al contado, es todo: precio + escrituración + equipamiento.', 'total'],
                ]} />
              </div>
            );
          })()}

          {/* DESGLOSE + CRÉDITO · se empacan en grid de ancho completo (sin huecos) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, alignItems: 'start' }}>
          {/* DESGLOSE DEL COSTO (cómo se arma la inversión · reading flow) */}
          {r && r.desglose && (
            <div className="iv4-card">
              <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 8 }}>🧾 Cómo Se Arma La Inversión</div>
              {[['Precio del inmueble', r.desglose.valor_propiedad], ['Gastos de escrituración', r.desglose.gastos_escrituracion], ...(r.desglose.equipamiento ? [['Equipamiento', r.desglose.equipamiento]] : []), ['Costo total', r.desglose.costo_total, true]].map(([l, v, tot]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: tot ? '2px solid rgba(16,18,28,0.1)' : '1px solid rgba(16,18,28,0.05)', fontSize: 12.5 }}>
                  <span style={{ color: tot ? '#16182A' : '#5B5F76', fontWeight: tot ? 800 : 600 }}>{l}</span><span style={{ fontWeight: 800, color: '#16182A' }}>{m(v)}</span>
                </div>
              ))}
              {r.con_credito && r.credito && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0 0', fontSize: 12 }}><span style={{ color: '#6B6F86' }}>De tu bolsa hoy (enganche + gastos)</span><span style={{ fontWeight: 800, color: '#7C5CFF' }}>{m(r.credito.capital_propio)}</span></div>}
            </div>
          )}

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
              <div className="iv4-card">
                <div style={{ fontWeight: 800, fontSize: 13 }}>💳 Tu Crédito Hipotecario <span style={{ fontWeight: 600, color: '#8A8FA6', fontSize: 11 }}>· {cr.plazo_anios} años · tasa {pct(cr.tasa_anual_pct)}</span></div>

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

                <Sub>En todo el plazo ({cr.plazo_anios} años)</Sub>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
                  <Tile l="Capital (préstamo)" v={m(cr.monto_credito)} c="#7C5CFF" exp="El préstamo que le regresas al banco." />
                  <Tile l="Interés total" v={m(cr.interes_total)} c="#DC2626" exp={`Solo intereses en ${cr.plazo_anios} años. Por eso conviene liquidar o vender antes.`} />
                  <Tile l="Monto total" v={m(cr.pago_total_plazo)} exp="Préstamo + todos los intereses = todo lo que le das al banco." />
                </div>

                {cr.tabla_anual && cr.tabla_anual.length > 0 && (
                  <details style={{ marginTop: 14 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 800, color: '#6D4AFF' }}>📅 Ver año por año (capital vs interés, hasta liquidar)</summary>
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

                <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(224,163,62,0.09)', borderRadius: 10, fontSize: 10.5, color: '#8A6A1E', lineHeight: 1.5 }}>
                  ⚠️ <b>Números ilustrativos, no una cotización bancaria.</b> Tu tasa y tu mensualidad reales dependen de tu perfil — el banco hace un análisis de crédito y de tu capacidad de pago. Úsalo para decidir con cabeza; para el número final y exacto, acércate al banco. Fines informativos.
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


      {/* ───── SECCIONES VISUALES (ancho completo · se acomodan sin huecos) ───── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginTop: 14, alignItems: 'start' }}>
          {/* LARGO PLAZO vs AIRBNB */}
          {r && r.comparar_renta && r.comparar_renta.largo && (() => {
            const cmp = r.comparar_renta;
            const Opcion = ({ icon, titulo, x, comoIngreso, fuente, win }) => (
              <div style={{ flex: '1 1 240px', padding: '15px 16px', borderRadius: 14, background: win ? 'rgba(124,92,255,0.06)' : 'rgba(16,18,28,0.03)', border: win ? '1.5px solid #7C5CFF' : '1px solid rgba(16,18,28,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#16182A' }}>{icon} {titulo}</div>
                  {win && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#6D28D9', background: 'rgba(124,92,255,0.14)', borderRadius: 6, padding: '2px 8px' }}>GANA</span>}
                </div>
                <div style={{ marginTop: 11, fontSize: 11.5, color: '#5B5F76', lineHeight: 1.5 }}>
                  <div>Ingreso: <b>{m(x.ingreso_anual)}/año</b></div>
                  <div style={{ fontSize: 10.5, color: '#A2A6BC' }}>{comoIngreso}</div>
                  <div style={{ marginTop: 5 }}>− Gastos del año: <b style={{ color: '#DC2626' }}>{m(x.egresos_anual)}</b></div>
                  <div style={{ marginTop: 5, paddingTop: 6, borderTop: '1px dashed rgba(16,18,28,0.14)' }}>= Te queda: <b style={{ color: '#0E9F6E' }}>{m(x.noi)}/año</b></div>
                </div>
                <div style={{ marginTop: 11, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700 }}>Rinde al año (TIR)</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: (x.tir_pct || 0) >= 0 ? '#0E9F6E' : '#DC2626' }}>{pct(x.tir_pct)}</div></div>
                  <div><div style={{ fontSize: 9.5, color: '#6B6F86', fontWeight: 700 }}>Te queda al mes</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: (x.flujo_mensual || 0) >= 0 ? '#16182A' : '#DC2626', marginTop: 2 }}>{m(x.flujo_mensual)}</div></div>
                </div>
                <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 8 }}>Ingreso según: {fuente}</div>
              </div>
            );
            return (
              <div className="iv4-card">
                <div style={{ fontWeight: 800, fontSize: 13 }}>🏨 ¿Rentar fijo o por Airbnb?</div>
                <div style={{ fontSize: 11.5, color: '#5B5F76', marginTop: 4, marginBottom: 12, lineHeight: 1.5 }}>Con el MISMO depa comparamos dos formas de rentarlo: a un inquilino todo el año (<b>largo plazo</b>) o por noches en <b>Airbnb</b> (corto). Mira de dónde sale cada número:</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Opcion icon="🏠" titulo="Largo plazo" x={cmp.largo} win={cmp.gana === 'largo'} comoIngreso={`${m(cmp.largo.ingreso_mensual)}/mes × 12 meses`} fuente="promedio de renta de la zona" />
                  <Opcion icon="🏨" titulo="Airbnb / corto" x={cmp.corto} win={cmp.gana === 'corto'} comoIngreso={`${m(cmp.corto.tarifa_noche)}/noche × ~${cmp.corto.noches_mes} noches al mes (${cmp.corto.ocupacion_pct}% ocupación) × 12`} fuente="AirROI (datos reales de la zona)" />
                </div>
                <div style={{ marginTop: 12, padding: '11px 13px', background: 'rgba(124,92,255,0.06)', borderRadius: 10, fontSize: 11.5, color: '#5B5F76', lineHeight: 1.55 }}>
                  👉 Con tus datos <b style={{ color: '#6D28D9' }}>gana {cmp.gana === 'corto' ? 'Airbnb' : 'largo plazo'}</b> (deja más al año). En general <b>Airbnb</b> rinde más pero da más trabajo (limpieza, huéspedes, temporada baja); <b>largo plazo</b> rinde menos pero es estable y sin broncas. <b>TIR</b> = cuánto te rinde tu dinero al año; <b>te queda al mes</b> = lo que te sobra (o pones de tu bolsa) cada mes.
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
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 10 }}>De dónde viene tu ganancia <span style={{ fontWeight: 700, color: '#16182A' }}>· {m(tot)}</span></div>
                <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
                  {segs.map(([l, v, c]) => <div key={l} title={`${l}: ${m(v)}`} style={{ width: `${tot ? (v / tot) * 100 : 0}%`, background: c }} />)}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {segs.map(([l, v, c]) => <div key={l} style={{ fontSize: 11.5, color: '#5B5F76' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: c, marginRight: 5 }} />{l} <b style={{ color: '#16182A' }}>{m(v)}</b></div>)}
                </div>
              </div>
            );
          })()}

          {/* Barra vs instrumentos */}
          {r && r.instrumentos && r.instrumentos.length > 0 && (
            <div className="iv4-card">
              <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 10 }}>Tu inmueble vs otras opciones</div>
              {[{ nombre: '🏠 Este inmueble', pct: r.tir_pct, hero: true }, ...r.instrumentos.map((i) => ({ nombre: i.nombre, pct: i.pct }))].map((b, i) => {
                const max = Math.max(r.tir_pct || 0, ...r.instrumentos.map((x) => x.pct || 0), 1);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                    <div style={{ width: 120, fontSize: 11.5, color: b.hero ? '#16182A' : '#6B6F86', fontWeight: b.hero ? 800 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.nombre}</div>
                    <div style={{ flex: 1, background: 'rgba(16,18,28,0.05)', borderRadius: 6, height: 14, overflow: 'hidden' }}><div style={{ width: `${Math.max(2, ((b.pct || 0) / max) * 100)}%`, height: '100%', background: b.hero ? 'linear-gradient(90deg,#6D4AFF,#C026D3)' : '#A9ADC4' }} /></div>
                    <div style={{ width: 44, textAlign: 'right', fontWeight: 800, fontSize: 12, color: b.hero ? '#6D28D9' : '#6B6F86' }}>{pct(b.pct)}</div>
                  </div>
                );
              })}
            </div>
          )}
      </div>{/* fin grid visual */}

          {/* PROYECCIÓN AÑO A AÑO + cuándo salir (tabla + gráfica · ancho completo) */}
          {r && r.proyeccion && r.proyeccion.rows && r.proyeccion.rows.length > 0 && (
            <div className="iv4-card">
              <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 4 }}>📅 Tu Inversión Año Con Año</div>
              <div style={{ fontSize: 11.5, color: '#6B6F86', marginBottom: 12, lineHeight: 1.45 }}>{r.proyeccion.recomendacion}</div>
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
                  <thead><tr style={{ color: '#6B6F86' }}>{['Año', 'Valor', 'Plusvalía', 'NOI/Año', 'Renta/Mes', 'Mensual.', 'TIR Si Vendes'].map((h, i) => <th key={h} style={{ padding: '6px 5px', fontWeight: 700, textAlign: i ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>{r.proyeccion.rows.map((row) => { const best = row.anio === r.proyeccion.mejor_anio; return (
                    <tr key={row.anio} style={{ borderTop: '1px solid rgba(16,18,28,0.06)', background: best ? 'rgba(124,92,255,0.07)' : 'transparent' }}>
                      <td style={{ padding: '7px 5px', fontWeight: 800, color: best ? '#6D28D9' : '#16182A' }}>{row.anio}{best ? ' ⭐' : ''}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right' }}>{m(row.valor)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', color: '#0E9F6E' }}>+{m(row.plusvalia_acum)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right' }}>{m(row.noi_anual)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right' }}>{m(row.renta_mensual)}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', color: '#8A8FA6' }}>{row.mensualidad_credito ? m(row.mensualidad_credito) : '—'}</td>
                      <td style={{ padding: '7px 5px', textAlign: 'right', fontWeight: 800, color: (row.tir_si_vendes || 0) >= 0 ? '#7C5CFF' : '#DC2626' }}>{pct(row.tir_si_vendes)}</td>
                    </tr>
                  ); })}</tbody>
                </table>
              </div>
              <div style={{ fontSize: 9.5, color: '#A2A6BC', fontStyle: 'italic', marginTop: 8 }}>⭐ = el mejor año para salir (TIR máxima). La mensualidad es fija; la renta sube cada año, así que con el tiempo te alcanza mejor.</div>
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

      {/* ───── ACCIONES + MODO AVANZADO (ancho completo) ───── */}
      <div className="iv4-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" onClick={() => askAtlax(`¿Qué pasa si…? Analizo una inversión de ${m(f.valor_propiedad)} con renta ${m(f.renta_mensual)}/mes, ${f.con_credito ? 'con crédito' : 'al contado'}, horizonte ${f.horizonte_anios} años. Ayúdame a explorar escenarios.`)} style={{ padding: '9px 15px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, border: 'none', background: 'rgba(99,102,241,0.08)', color: '#6D4AFF' }}>💬 ¿Qué pasa si…?</button>
        {r && <button type="button" onClick={() => setComparar((c) => [...c.slice(-2), { zona: zoneId, precio: f.valor_propiedad, credito: f.con_credito, plazo: Number(f.plazo_meses), modo: f.modo_renta, tir: r.tir_pct, em: r.equity_multiple, neto: r.neto_al_vender }])} style={{ padding: '9px 15px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, border: '1px solid rgba(99,102,241,0.25)', background: comparar.length ? 'rgba(124,92,255,0.1)' : '#fff', color: '#6D4AFF' }}>📌 Guardar para comparar{comparar.length ? ` (${comparar.length} guardado${comparar.length > 1 ? 's' : ''})` : ''}</button>}
        <button type="button" onClick={() => window.print()} style={{ padding: '9px 15px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, border: '1px solid rgba(99,102,241,0.25)', background: '#fff', color: '#4B4F66' }}>📄 PDF</button>
      </div>
      {r && <div className="iv4-noprint" style={{ fontSize: 10.5, color: '#A2A6BC', marginTop: 6, lineHeight: 1.5 }}>💡 Para comparar A/B: toca <b>Guardar para comparar</b>, luego {lockPrice ? 'elige otra unidad arriba (o cambia crédito/plazo)' : 'cambia el precio, el crédito o el plazo'} y guarda otro — aparecen lado a lado abajo.</div>}

      {comparar.length > 0 && (
        <div className="iv4-card" style={{ marginTop: 12, overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={{ fontWeight: 800, fontSize: 13 }}>Comparar escenarios (A/B)</span><button type="button" onClick={() => setComparar([])} style={{ border: 'none', background: 'none', color: '#8A8FA6', fontSize: 11, cursor: 'pointer' }}>limpiar</button></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ color: '#6B6F86', textAlign: 'left' }}>{['', 'Zona', 'Precio', 'Pago', 'Plazo', 'TIR', 'Multiplica', 'Neto'].map((h) => <th key={h} style={{ padding: '6px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>{comparar.map((c, i) => <tr key={i} style={{ borderTop: '1px solid rgba(16,18,28,0.06)' }}><td style={{ padding: '6px 8px', fontWeight: 800 }}>{String.fromCharCode(65 + i)}</td><td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>{(c.zona || '—').replace(/-/g, ' ')}</td><td style={{ padding: '6px 8px' }}>{m(c.precio)}</td><td style={{ padding: '6px 8px' }}>{c.credito ? 'Crédito' : 'Contado'}</td><td style={{ padding: '6px 8px' }}>{c.plazo ? `${Math.round(c.plazo / 12)} años` : '—'}</td><td style={{ padding: '6px 8px', fontWeight: 800, color: '#7C5CFF' }}>{pct(c.tir)}</td><td style={{ padding: '6px 8px' }}>{c.em ? `${c.em}x` : '—'}</td><td style={{ padding: '6px 8px' }}>{m(c.neto)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {vista === 'institucional' && r && (
        <div className="iv4-card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Métricas institucionales <span style={{ fontWeight: 600, color: '#8A8FA6', fontSize: 11 }}>· para experto (TIR/MIRR/VPN/cap rate/DSCR + sensibilidad + Monte Carlo)</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10 }}>
            {[['Cap rate', pct(r.cap_rate_pct)], ['TIR desapal.', pct(r.tir_desapalancada_pct)], ['MIRR', pct(r.mirr_pct)], ['VPN', m(r.vpn)], ['ROI real', pct(r.roi_real_pct)], ['Apalancam.', r.apalancamiento || '—'], ...(r.credito && r.credito.dscr != null ? [['DSCR', r.credito.dscr], ['Debt yield', pct(r.credito.debt_yield_pct)]] : [])].map(([l, v]) => <div key={l}><div style={{ fontSize: 10, color: '#6B6F86', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: '#16182A' }}>{v}</div></div>)}
          </div>
          {r.multifamily_info && r.multifamily_info.num_unidades && <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)', fontSize: 12.5, color: '#5B5F76' }}>Multifamily: cap implícito {pct(r.multifamily_info.cap_implicito_pct)} · valor de mercado {m(r.multifamily_info.valor_mercado)} · <b style={{ color: (r.multifamily_info.brecha_precio_pct || 0) > 0 ? '#DC2626' : '#0E9F6E' }}>brecha {pct(r.multifamily_info.brecha_precio_pct)}</b></div>}
          {r.sensibilidad && r.sensibilidad.por_exit_cap && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6B6F86', marginBottom: 6 }}>Sensibilidad: TIR según el precio de salida (exit cap)</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{r.sensibilidad.por_exit_cap.map((s) => <div key={s.exit_cap_pct} style={{ textAlign: 'center', padding: '6px 9px', borderRadius: 8, background: s.es_base ? 'rgba(124,92,255,0.1)' : 'rgba(16,18,28,0.04)', border: s.es_base ? '1.5px solid #7C5CFF' : '1px solid transparent' }}><div style={{ fontSize: 9.5, color: '#8A8FA6' }}>{s.exit_cap_pct}%</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: s.es_base ? '#6D28D9' : '#16182A' }}>{pct(s.tir_pct)}</div></div>)}</div>
            </div>
          )}
          {r.montecarlo && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6B6F86', marginBottom: 8 }}>Monte Carlo · {r.montecarlo.n} escenarios al azar</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>{[['Peor (5%)', r.montecarlo.p5, '#DC2626'], ['Esperado', r.montecarlo.p50, '#16182A'], ['Mejor (95%)', r.montecarlo.p95, '#0E9F6E']].map(([l, v, c]) => <div key={l} style={{ flex: '1 1 80px', textAlign: 'center', padding: '8px', borderRadius: 8, background: 'rgba(16,18,28,0.03)' }}><div style={{ fontSize: 10, color: '#8A8FA6' }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: c }}>{pct(v)}</div></div>)}</div>
              <div style={{ fontSize: 12, color: r.montecarlo.prob_bajo_cetes_pct >= 50 ? '#DC2626' : '#5B5F76' }}>Probabilidad de rendir <b>menos que CETES</b>: <b>{r.montecarlo.prob_bajo_cetes_pct}%</b></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 34, marginTop: 8 }}>{r.montecarlo.hist.map((h, i) => { const mx = Math.max(...r.montecarlo.hist.map((x) => x.n)) || 1; return <div key={i} title={`desde ${h.desde}% · ${h.n}`} style={{ flex: 1, height: `${Math.max(4, (h.n / mx) * 100)}%`, background: 'linear-gradient(180deg,#7C5CFF,#C026D3)', borderRadius: '3px 3px 0 0', opacity: 0.8 }} />; })}</div>
            </div>
          )}
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
        para el detalle de <b>ISAI e ISR</b> (compra y venta) usa el <b>Proyector de Impuestos</b>. El cálculo definitivo lo hace tu contador/notario.
      </div>
    </div>
  );
}

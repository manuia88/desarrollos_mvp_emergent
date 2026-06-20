/**
 * InversionV4Calculator — Calculadora de inversión inmobiliaria GRADO INSTITUCIONAL (PROMPT v4).
 * Pro por dentro, simple por fuera: capa cliente (etiqueta llana + número + frase) + capa pro (tooltip técnico).
 * 4 ejes (perfil · tipo/escala · adquisición · renta), reactiva (recalcula en vivo, sin botón), tema claro.
 * Motor en backend POST /api/inversion-v4/analyze (motor + fiscal MX + mercado vivo + veredicto).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import CashFlowChart from './CashFlowChart';

const API = process.env.REACT_APP_BACKEND_URL;
const m = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-MX')}`;     // formato $1,000,000
const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);

// Glosario (PROMPT §1): término → [etiqueta cliente, frase]
const GLOSS = {
  tir: ['Rendimiento anual total', 'Tu ganancia anual real juntando renta + plusvalía, considerando el tiempo (TIR).'],
  coc: ['Rendimiento sobre tu dinero', 'De lo que pusiste de tu bolsa, cuánto te regresa la renta al año (cash-on-cash).'],
  flujo: ['Flujo mensual neto', 'Lo que te queda (o sale de tu bolsa) cada mes, después de gastos y crédito.'],
  em: ['Cuánto multiplicas tu dinero', 'Si pones $1, cuántos recuperas al final (equity multiple).'],
  neto: ['Neto al vender', 'Lo que te llevas al vender, ya descontando crédito pendiente, comisión e impuestos.'],
  patrimonio: ['Patrimonio que construyes', 'La parte del crédito que ya pagaste y ahora es tuya (equity buildup).'],
  cap: ['Rendimiento de la renta', 'Cuánto rinde la renta sobre el precio, al año, sin crédito (cap rate).'],
  dscr: ['¿La renta cubre el crédito?', 'Si es ≥1 la renta paga la mensualidad; si es <1, pones de tu bolsa (DSCR).'],
};

const SEM = { verde: '#0E9F6E', amarillo: '#E0A33E', rojo: '#DC2626', gris: '#8A8FA6' };
const REGIMENES = [
  ['auto', 'Automático (el que pague menos)'], ['resico', 'RESICO (1–2.5%)'], ['arrend_ciega', 'Arrendamiento · deducción ciega'],
  ['arrend_real', 'Arrendamiento · gastos reales'], ['asalariado', 'Asalariado'], ['pfae', 'Actividad empresarial'],
];

function Tip({ g }) {
  const [el, fr] = GLOSS[g] || ['', ''];
  return <span className="iv4-tip" tabIndex={0}>ⓘ<span className="iv4-tipbox"><b>{el}</b><br />{fr}</span></span>;
}

export default function InversionV4Calculator({ prefilled = {}, lockPrice = false }) {
  const [f, setF] = useState({
    valor_propiedad: prefilled.precio || 5_000_000,
    num_unidades: 1,
    con_credito: true, ltv: 0.80, tasa_anual: '', plazo_meses: 240,
    modo_renta: 'largo', renta_mensual: Math.round((prefilled.precio || 5_000_000) * 0.0045), tasa_vacancia: 0.05,
    predial: Math.round((prefilled.precio || 5_000_000) * 0.0016), mantenimiento: Math.round((prefilled.precio || 5_000_000) * 0.0024), seguro: Math.round((prefilled.precio || 5_000_000) * 0.0012),
    horizonte_anios: 5, apreciacion_anual: 0.075, crecimiento_renta_anual: 0.05,
    perfil: 'fisica', tipo_inmueble: 'residencial', es_casa_habitacion: true, regimen_fiscal: 'auto',
  });
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pro, setPro] = useState(false);     // modo avanzado / institucional (F5)
  const [comparar, setComparar] = useState([]); // A/B: escenarios guardados (F6)
  const timer = useRef(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const run = useCallback(async (payload) => {
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/inversion-v4/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const d = await resp.json();
      if (d && d.ok) setR(d);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {            // reactivo: recalcula en vivo (debounce 250ms)
    clearTimeout(timer.current);
    const num = (x) => (x === '' || x === null ? undefined : Number(x));
    const payload = { ...f, incluir_sensibilidad: pro,
      valor_propiedad: num(f.valor_propiedad), renta_mensual: num(f.renta_mensual),
      num_unidades: num(f.num_unidades), ltv: num(f.ltv), tasa_anual: num(f.tasa_anual),
      apreciacion_anual: num(f.apreciacion_anual), crecimiento_renta_anual: num(f.crecimiento_renta_anual) };
    timer.current = setTimeout(() => run(payload), 250);
    return () => clearTimeout(timer.current);
  }, [f, pro, run]);

  const askAtlax = (q) => { try { window.dispatchEvent(new CustomEvent('atlax:open', { detail: { query: q } })); } catch { /* noop */ } };

  const multifamily = Number(f.num_unidades) >= 5;
  const inp = { background: '#fff', border: '1px solid rgba(16,18,28,0.16)', borderRadius: 9, color: '#16182A', fontFamily: 'DM Sans', fontSize: 13, padding: '8px 11px', width: '100%', outline: 'none' };
  const lab = { fontFamily: 'DM Sans', fontSize: 10.5, color: '#6B6F86', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 };
  const Toggle = ({ k, opts }) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {opts.map(([v, l]) => {
        const on = String(f[k]) === String(v);
        return <button key={String(v)} type="button" onClick={() => set(k, v)} style={{ padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, border: on ? '1.5px solid #7C5CFF' : '1px solid rgba(99,102,241,0.2)', background: on ? 'rgba(124,92,255,0.1)' : '#fff', color: on ? '#6D28D9' : '#4B4F66' }}>{l}</button>;
      })}
    </div>
  );

  return (
    <div style={{ fontFamily: 'DM Sans', color: '#16182A' }}>
      <style>{`
        .iv4-tip{position:relative;cursor:help;color:#6D4AFF;font-size:11px;margin-left:5px}
        .iv4-tipbox{position:absolute;bottom:135%;left:50%;transform:translateX(-50%);width:230px;background:#1E2230;color:#fff;font-weight:500;font-size:11px;line-height:1.45;padding:9px 11px;border-radius:9px;box-shadow:0 12px 30px rgba(16,18,28,.3);opacity:0;visibility:hidden;transition:opacity .14s;z-index:60;text-transform:none;letter-spacing:0;text-align:left;pointer-events:none}
        .iv4-tip:hover .iv4-tipbox,.iv4-tip:focus .iv4-tipbox{opacity:1;visibility:visible}
        .iv4-card{background:#fff;border:1px solid rgba(16,18,28,.08);border-radius:16px;box-shadow:0 6px 18px rgba(99,102,241,.06);padding:16px 18px}
      `}</style>

      {/* ── 4 EJES ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 16 }}>
        <div><span style={lab}>Perfil</span><Toggle k="perfil" opts={[['fisica', 'Persona física'], ['moral', 'Persona moral / fondo']]} /></div>
        <div><span style={lab}>Adquisición</span><Toggle k="con_credito" opts={[[false, 'Al contado'], [true, 'Con crédito']]} /></div>
        <div><span style={lab}>Renta</span><Toggle k="modo_renta" opts={[['largo', 'Largo plazo'], ['corto', 'Corto plazo']]} /></div>
        <div><span style={lab}>Tipo</span><Toggle k="tipo_inmueble" opts={[['residencial', 'Residencial'], ['comercial', 'Comercial']]} /></div>
      </div>

      {/* ── INPUTS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
        <div><span style={lab}>Precio del inmueble{lockPrice ? ' · del depto' : ''}</span>
          {lockPrice ? <input type="text" readOnly value={m(f.valor_propiedad)} style={{ ...inp, opacity: 0.9, cursor: 'not-allowed' }} />
            : <input type="text" inputMode="numeric" value={m(f.valor_propiedad)} onChange={(e) => set('valor_propiedad', String(e.target.value).replace(/\D/g, ''))} style={inp} />}</div>
        <div><span style={lab}>N° unidades {multifamily ? '· multifamily' : ''}</span><input type="number" value={f.num_unidades} onChange={(e) => set('num_unidades', e.target.value)} style={inp} /></div>
        <div><span style={lab}>Renta mensual</span><input type="text" inputMode="numeric" value={m(f.renta_mensual)} onChange={(e) => set('renta_mensual', String(e.target.value).replace(/\D/g, ''))} style={inp} /></div>
        <div><span style={lab}>Predial / año</span><input type="text" inputMode="numeric" value={m(f.predial)} onChange={(e) => set('predial', String(e.target.value).replace(/\D/g, ''))} style={inp} /></div>
        <div><span style={lab}>Mantenimiento / año</span><input type="text" inputMode="numeric" value={m(f.mantenimiento)} onChange={(e) => set('mantenimiento', String(e.target.value).replace(/\D/g, ''))} style={inp} /></div>
        <div><span style={lab}>Horizonte (años)</span><input type="number" value={f.horizonte_anios} onChange={(e) => set('horizonte_anios', Number(e.target.value))} style={inp} /></div>
        {f.con_credito && <div><span style={lab}>Enganche / crédito</span>
          <select value={f.ltv} onChange={(e) => set('ltv', Number(e.target.value))} style={inp}>
            {[[0.9, '10% enganche'], [0.8, '20% enganche'], [0.7, '30% enganche'], [0.5, '50% enganche']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>}
        {f.con_credito && <div><span style={lab}>Tasa del crédito (%)</span><input type="number" step="0.01" placeholder="11.45 (Banxico)" value={f.tasa_anual === '' ? '' : f.tasa_anual * 100} onChange={(e) => set('tasa_anual', e.target.value === '' ? '' : Number(e.target.value) / 100)} style={inp} /></div>}
        {f.perfil === 'fisica' && <div><span style={lab}>Régimen fiscal</span>
          <select value={f.regimen_fiscal} onChange={(e) => set('regimen_fiscal', e.target.value)} style={inp}>{REGIMENES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
        <div><span style={lab}>Apreciación anual (%)</span><input type="number" step="0.1" value={f.apreciacion_anual * 100} onChange={(e) => set('apreciacion_anual', Number(e.target.value) / 100)} style={inp} /></div>
      </div>

      {/* ── VEREDICTO + SEMÁFORO ── */}
      {r && r.veredicto && (
        <div className="iv4-card" style={{ marginBottom: 16, borderLeft: `5px solid ${SEM[r.veredicto.semaforo] || '#8A8FA6'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: SEM[r.veredicto.semaforo], display: 'inline-block' }} />
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: '#16182A' }}>{r.veredicto.resumen}</span>
          </div>
          <p style={{ fontSize: 13.5, color: '#5B5F76', lineHeight: 1.55, marginTop: 8, marginBottom: 0 }}>{r.veredicto.parrafo}</p>
        </div>
      )}

      {/* ── CAPA CLIENTE: tarjetas grandes ── */}
      {r && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
          {[
            ['tir', pct(r.tir_pct), '#7C5CFF'], ['coc', pct(r.cash_on_cash_pct), '#0E9F6E'],
            ['flujo', m(r.flujo_mensual_1) + '/mes', (r.flujo_mensual_1 || 0) >= 0 ? '#0E9F6E' : '#DC2626'],
            ['em', r.equity_multiple ? `${r.equity_multiple}x` : '—', '#C026D3'],
            ['neto', m(r.neto_al_vender), '#16182A'], ['patrimonio', m((r.atribucion || {}).equity_buildup), '#0E9F6E'],
          ].map(([g, val, c]) => (
            <div key={g} className="iv4-card">
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6B6F86' }}>{GLOSS[g][0]}<Tip g={g} /></div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: c, letterSpacing: '-0.02em', marginTop: 4 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── BARRA vs instrumentos ── */}
      {r && r.instrumentos && r.instrumentos.length > 0 && (
        <div className="iv4-card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Tu inmueble vs otras opciones <span style={{ fontWeight: 600, color: '#8A8FA6', fontSize: 11 }}>(rendimiento anual)</span></div>
          {[{ nombre: '🏠 Este inmueble (TIR)', pct: r.tir_pct, hero: true }, ...r.instrumentos.map((i) => ({ nombre: i.nombre, pct: i.pct }))].map((b, i) => {
            const max = Math.max(r.tir_pct || 0, ...r.instrumentos.map((x) => x.pct || 0), 1);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 150, fontSize: 12, color: b.hero ? '#16182A' : '#6B6F86', fontWeight: b.hero ? 800 : 600 }}>{b.nombre}</div>
                <div style={{ flex: 1, background: 'rgba(16,18,28,0.05)', borderRadius: 6, height: 16, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(2, ((b.pct || 0) / max) * 100)}%`, height: '100%', background: b.hero ? 'linear-gradient(90deg,#6D4AFF,#C026D3)' : '#A9ADC4' }} />
                </div>
                <div style={{ width: 50, textAlign: 'right', fontWeight: 800, fontSize: 12.5, color: b.hero ? '#6D28D9' : '#6B6F86' }}>{pct(b.pct)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ALERTAS ── */}
      {r && r.alertas && Object.values(r.alertas).some(Boolean) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {r.alertas.coc_negativo && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', borderRadius: 8, padding: '5px 11px' }}>⚠️ Sale de tu bolsa cada mes</span>}
          {r.alertas.dscr_bajo_1 && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#E0A33E', background: 'rgba(224,163,62,0.1)', borderRadius: 8, padding: '5px 11px' }}>⚠️ La renta no cubre el crédito</span>}
          {r.alertas.cap_bajo_cetes && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#E0A33E', background: 'rgba(224,163,62,0.1)', borderRadius: 8, padding: '5px 11px' }}>⚠️ La renta rinde menos que CETES</span>}
          {r.alertas.inputs_incoherentes && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#E0A33E', background: 'rgba(224,163,62,0.1)', borderRadius: 8, padding: '5px 11px' }}>⚠️ Revisa los supuestos (incoherentes)</span>}
        </div>
      )}

      {/* ── GRÁFICA (valor a través del tiempo · flujos anuales) ── */}
      {r && r.flujos_anuales && r.flujos_anuales.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <CashFlowChart light base={r.flujos_anuales.map((v) => ({ valor_propiedad: v }))} metric="valor_propiedad" />
        </div>
      )}

      {/* ── MODO AVANZADO / INSTITUCIONAL (F5) + ¿qué pasa si? (F6) ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" onClick={() => setPro((p) => !p)} style={{ padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, border: '1px solid rgba(99,102,241,0.25)', background: pro ? 'rgba(124,92,255,0.08)' : '#fff', color: '#6D28D9' }}>{pro ? '− Ocultar modo avanzado' : '🔬 Modo avanzado (institucional)'}</button>
        <button type="button" onClick={() => askAtlax(`¿Qué pasa si…? Analizo una inversión de ${m(f.valor_propiedad)} con renta ${m(f.renta_mensual)}/mes, ${f.con_credito ? 'con crédito' : 'al contado'}, horizonte ${f.horizonte_anios} años. Ayúdame a explorar escenarios.`)} style={{ padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, border: 'none', background: 'rgba(99,102,241,0.08)', color: '#6D4AFF' }}>💬 ¿Qué pasa si…? · pregúntale a Atlax</button>
        {r && <button type="button" onClick={() => setComparar((c) => [...c.slice(-2), { precio: f.valor_propiedad, credito: f.con_credito, tir: r.tir_pct, coc: r.cash_on_cash_pct, em: r.equity_multiple, neto: r.neto_al_vender }])} style={{ padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, border: '1px solid rgba(99,102,241,0.25)', background: '#fff', color: '#4B4F66' }}>➕ Comparar (A/B)</button>}
        <button type="button" onClick={() => window.print()} style={{ padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, border: '1px solid rgba(99,102,241,0.25)', background: '#fff', color: '#4B4F66' }}>📄 Descargar PDF</button>
      </div>
      {comparar.length > 0 && (
        <div className="iv4-card" style={{ marginBottom: 14, overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>Comparar escenarios (A/B)</span>
            <button type="button" onClick={() => setComparar([])} style={{ border: 'none', background: 'none', color: '#8A8FA6', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans' }}>limpiar</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
            <thead><tr style={{ color: '#6B6F86', textAlign: 'left' }}>{['Escenario', 'Precio', 'Modo', 'TIR', 'Rend. tu dinero', 'Multiplica', 'Neto al vender'].map((h) => <th key={h} style={{ padding: '6px 8px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>{comparar.map((c, i) => (
              <tr key={i} style={{ borderTop: '1px solid rgba(16,18,28,0.06)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 800 }}>{String.fromCharCode(65 + i)}</td>
                <td style={{ padding: '6px 8px' }}>{m(c.precio)}</td><td style={{ padding: '6px 8px' }}>{c.credito ? 'Crédito' : 'Contado'}</td>
                <td style={{ padding: '6px 8px', fontWeight: 800, color: '#7C5CFF' }}>{pct(c.tir)}</td><td style={{ padding: '6px 8px' }}>{pct(c.coc)}</td>
                <td style={{ padding: '6px 8px' }}>{c.em ? `${c.em}x` : '—'}</td><td style={{ padding: '6px 8px' }}>{m(c.neto)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {pro && r && (
        <div className="iv4-card" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Métricas institucionales</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(115px,1fr))', gap: 10 }}>
            {[['Cap rate', pct(r.cap_rate_pct)], ['TIR desapalancada', pct(r.tir_desapalancada_pct)], ['MIRR', pct(r.mirr_pct)], ['VPN', m(r.vpn)], ['ROI real', pct(r.roi_real_pct)], ['Apalancamiento', r.apalancamiento || '—'],
            ...(r.credito && r.credito.dscr != null ? [['DSCR', r.credito.dscr], ['Debt yield', pct(r.credito.debt_yield_pct)]] : [])].map(([l, v]) => (
              <div key={l}><div style={{ fontSize: 10.5, color: '#6B6F86', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: '#16182A' }}>{v}</div></div>
            ))}
          </div>
          {r.atribucion && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6B6F86', marginBottom: 6 }}>De dónde viene tu ganancia (cascada)</div>
              {[['Renta neta acumulada', r.atribucion.renta_neta_acum, '#0E9F6E'], ['Patrimonio (equity buildup)', r.atribucion.equity_buildup, '#7C5CFF'], ['Plusvalía', r.atribucion.plusvalia, '#C026D3']].map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}><span style={{ color: '#5B5F76' }}>{l}</span><span style={{ fontWeight: 800, color: c }}>{m(v)}</span></div>
              ))}
            </div>
          )}
          {r.multifamily_info && r.multifamily_info.num_unidades && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6B6F86', marginBottom: 6 }}>Multifamily · valuación por ingreso</div>
              <div style={{ fontSize: 12.5, color: '#5B5F76' }}>Cap implícito {pct(r.multifamily_info.cap_implicito_pct)} · valor de mercado {m(r.multifamily_info.valor_mercado)} · <b style={{ color: (r.multifamily_info.brecha_precio_pct || 0) > 0 ? '#DC2626' : '#0E9F6E' }}>brecha {pct(r.multifamily_info.brecha_precio_pct)}</b></div>
            </div>
          )}
          {r.sensibilidad && r.sensibilidad.por_exit_cap && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6B6F86', marginBottom: 6 }}>Sensibilidad: TIR según el rendimiento de salida (exit cap)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {r.sensibilidad.por_exit_cap.map((s) => (
                  <div key={s.exit_cap_pct} style={{ textAlign: 'center', padding: '7px 10px', borderRadius: 8, background: s.es_base ? 'rgba(124,92,255,0.1)' : 'rgba(16,18,28,0.04)', border: s.es_base ? '1.5px solid #7C5CFF' : '1px solid transparent' }}>
                    <div style={{ fontSize: 10, color: '#8A8FA6' }}>{s.exit_cap_pct}%</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: s.es_base ? '#6D28D9' : '#16182A' }}>{pct(s.tir_pct)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9.5, color: '#A2A6BC', fontStyle: 'italic', marginTop: 6 }}>0.25% en el exit cap mueve fuerte la TIR — el precio de salida define 60-80% del retorno.</div>
            </div>
          )}
          {r.montecarlo && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6B6F86', marginBottom: 8 }}>Monte Carlo · {r.montecarlo.n} escenarios (apreciación/vacancia/tasa al azar)</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                {[['Peor caso (5%)', r.montecarlo.p5, '#DC2626'], ['Esperado (50%)', r.montecarlo.p50, '#16182A'], ['Mejor caso (95%)', r.montecarlo.p95, '#0E9F6E']].map(([l, v, c]) => (
                  <div key={l} style={{ flex: '1 1 90px', textAlign: 'center', padding: '8px', borderRadius: 8, background: 'rgba(16,18,28,0.03)' }}>
                    <div style={{ fontSize: 10, color: '#8A8FA6' }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: c }}>{pct(v)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: r.montecarlo.prob_bajo_cetes_pct >= 50 ? '#DC2626' : '#5B5F76' }}>
                Probabilidad de rendir <b>menos que CETES</b>: <b>{r.montecarlo.prob_bajo_cetes_pct}%</b>{r.montecarlo.prob_bajo_cetes_pct >= 50 ? ' — riesgo alto de no superar la tasa libre de riesgo.' : '.'}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36, marginTop: 8 }}>
                {r.montecarlo.hist.map((h, i) => { const mx = Math.max(...r.montecarlo.hist.map((x) => x.n)) || 1; return (
                  <div key={i} title={`desde ${h.desde}% · ${h.n}`} style={{ flex: 1, height: `${Math.max(4, (h.n / mx) * 100)}%`, background: 'linear-gradient(180deg,#7C5CFF,#C026D3)', borderRadius: '3px 3px 0 0', opacity: 0.8 }} />
                ); })}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 9.5, color: '#A2A6BC', fontStyle: 'italic', lineHeight: 1.5 }}>
        {loading ? 'Calculando…' : `Mercado vivo: CETES ${(r && r.mercado && (r.mercado.cetes_1a * 100).toFixed(1)) || '7.0'}% · UDIS ${(r && r.mercado && r.mercado.udis) || '—'} (Banxico). `}
        Informativo · no sustituye asesoría fiscal/financiera. Cifras estimadas jun-2026; el ISR definitivo lo calcula tu contador/notario.
      </div>
    </div>
  );
}

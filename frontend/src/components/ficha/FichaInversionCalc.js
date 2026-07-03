/**
 * FichaInversionCalc — calculadora de inversión GUIADA (paso a paso) para la ficha de venta,
 * con el look limpio calcV4 (igual que el comparador hipotecario). REUSA el mismo motor
 * (POST /api/inversion-v4/analyze) — cero duplicación de lógica; solo una piel nueva, guiada
 * y concreta para el comprador. Emite señal de demanda al backend.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { V4, HEAD, SANS, GRAD, fmtMXN, inpV4, cardV4, BtnV4, Field, CalcHeader, ResultCard, Disclaimer, MoneyInput } from './calcV4';
import { sendBuyerSignal } from '../../lib/buyerSignal';

const API = process.env.REACT_APP_BACKEND_URL;
const pct = (n) => (n == null || isNaN(n)) ? '—' : `${Number(n).toFixed(1)}%`;
const SEM = { verde: V4.green, amarillo: V4.amber, rojo: V4.red };
const REGIMENES = [['auto', 'Automático (paga menos)'], ['resico', 'RESICO'], ['arrend_ciega', 'Arrendamiento · ciega'], ['arrend_real', 'Arrendamiento · real'], ['asalariado', 'Asalariado'], ['pfae', 'Actividad empresarial']];

// segmento morado (igual estética que el comparador)
function Seg({ value, onChange, opts, full }) {
  return (
    <div style={{ display: 'inline-flex', gap: 5, background: '#f4f2fd', borderRadius: 11, padding: 4, width: full ? '100%' : undefined }}>
      {opts.map(([v, l]) => {
        const on = value === v;
        return <button key={String(v)} type="button" onClick={() => onChange(v)} style={{ flex: full ? 1 : undefined, padding: '9px 14px', borderRadius: 8, border: 'none', background: on ? GRAD : 'transparent', color: on ? '#fff' : V4.ink2, fontFamily: HEAD, fontWeight: on ? 800 : 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>;
      })}
    </div>
  );
}
const NextBtn = ({ onClick, children }) => <div style={{ marginTop: 20 }}><BtnV4 onClick={onClick}>{children}</BtnV4></div>;

export default function FichaInversionCalc({ precio, renta, zoneId, devId, devName, unitLabel, onLead }) {
  const precio0 = precio || 5000000;
  const [f, setF] = useState({
    valor_propiedad: precio0, num_unidades: 1,
    con_credito: true, ltv: 0.80, tasa_anual: '', plazo_meses: 240, abono_capital_mensual: 0,
    modo_renta: 'largo', renta_mensual: renta || Math.round(precio0 * 0.0045), tasa_vacancia: 0.05,
    tarifa_noche: Math.round((renta || precio0 * 0.0045) / 30 * 2.2), ocupacion_pct: 0.6,
    predial: Math.round(precio0 * 0.0016), mantenimiento: Math.round(precio0 * 0.0024), seguro: Math.round(precio0 * 0.0012),
    horizonte_anios: 5, apreciacion_anual: 0.075, crecimiento_renta_anual: 0.05,
    exit_cap_rate: '', capex_reserve_pct: 0.04, prima_riesgo_inmobiliario: 0.05,
    perfil: 'fisica', tipo_inmueble: 'residencial', es_casa_habitacion: true, regimen_fiscal: 'auto',
  });
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const timer = useRef(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => { if (precio) setF((s) => ({ ...s, valor_propiedad: precio, renta_mensual: renta || s.renta_mensual })); }, [precio, renta]);

  const run = useCallback(async (payload) => {
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/inversion-v4/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await resp.json();
      if (d && d.ok) setR(d);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  // motor reactivo (debounced) — mismo payload que el motor pro, modo individual
  useEffect(() => {
    clearTimeout(timer.current);
    const num = (x) => (x === '' || x == null ? undefined : Number(x));
    const tasaFrac = (f.tasa_anual === '' || f.tasa_anual == null) ? undefined : Number(f.tasa_anual) / 100;
    const payload = {
      ...f, incluir_sensibilidad: true, usa_airroi: false, zone_id: zoneId || undefined,
      valor_propiedad: num(f.valor_propiedad), renta_mensual: num(f.renta_mensual), tarifa_noche: num(f.tarifa_noche),
      predial: num(f.predial), mantenimiento: num(f.mantenimiento), seguro: num(f.seguro), num_unidades: num(f.num_unidades),
      ltv: num(f.ltv), tasa_anual: tasaFrac, plazo_meses: num(f.plazo_meses), abono_capital_mensual: num(f.abono_capital_mensual) || 0,
      apreciacion_anual: num(f.apreciacion_anual), crecimiento_renta_anual: num(f.crecimiento_renta_anual),
      exit_cap_rate: num(f.exit_cap_rate) || 0, capex_reserve_pct: num(f.capex_reserve_pct), prima_riesgo_inmobiliario: num(f.prima_riesgo_inmobiliario),
      tasa_vacancia: num(f.tasa_vacancia),
    };
    timer.current = setTimeout(() => run(payload), 250);
    return () => clearTimeout(timer.current);
  }, [f, run, zoneId]);

  // señal de demanda (fail-open) — alimenta el Modelo de la Demanda
  useEffect(() => {
    if (!r || r.tir_pct == null) return;
    try { sendBuyerSignal('inversion_explore', { entity_id: devId || zoneId, tir_pct: r.tir_pct, cap_rate_pct: r.cap_rate_pct, precio: f.valor_propiedad, con_credito: f.con_credito, horizonte: f.horizonte_anios }); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r && r.tir_pct, r && r.cap_rate_pct]);

  const sem = (r && r.veredicto && SEM[r.veredicto.semaforo]) || V4.ink3;
  const cred = r && r.credito;
  const TABS = [['1', 'Tu inmueble'], ['2', 'Cómo lo pagas'], ['3', 'Supuestos'], ['4', 'Resultado']];
  const H = Number(f.horizonte_anios);

  return (
    <div style={{ ...cardV4, padding: 24 }}>
      <CalcHeader eyebrow="Calculadora de inversión" title={`¿Cuánto te deja${devName ? ` en ${devName}` : ''}?`}
        subtitle="Renta, plusvalía, impuestos y crédito — paso a paso, con datos vivos de mercado." />
      {unitLabel && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 14, borderRadius: 10, background: 'rgba(109,74,255,0.06)', border: '1px solid rgba(109,74,255,0.18)', fontFamily: SANS, fontSize: 12.5, color: V4.ink2 }}>🔗 <b style={{ color: V4.ink }}>{unitLabel}</b></div>}

      {/* pasos numerados (clicables) — misma secuencia guiada que la hipotecaria */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${V4.line}`, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(([n, l]) => { const on = step === Number(n); return (
          <button key={n} onClick={() => setStep(Number(n))} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 4px', marginRight: 22, border: 'none', borderBottom: on ? `2.5px solid ${V4.theme}` : '2.5px solid transparent', background: 'none', color: on ? V4.theme : V4.ink2, fontFamily: HEAD, fontWeight: on ? 800 : 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 9999, fontSize: 11, fontWeight: 800, background: on ? V4.theme : '#eae7f6', color: on ? '#fff' : V4.ink2 }}>{n}</span>{l}
          </button>
        ); })}
      </div>

      {/* ① TU INMUEBLE */}
      {step === 1 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '14px 16px' }}>
            <Field label="Precio de la unidad" hint={precio ? 'Fijo · la unidad que elegiste' : undefined}>
              {precio ? <input readOnly value={fmtMXN(f.valor_propiedad)} style={{ ...inpV4, background: '#f7f7fa', color: V4.ink2, cursor: 'not-allowed' }} />
                : <MoneyInput value={f.valor_propiedad} onChange={(v) => set('valor_propiedad', v)} />}
            </Field>
            <Field label="Tipo de renta"><Seg value={f.modo_renta} onChange={(v) => set('modo_renta', v)} opts={[['largo', 'Renta larga'], ['corto', 'Airbnb']]} full /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '14px 16px', marginTop: 14 }}>
            {f.modo_renta === 'largo'
              ? <Field label="Renta mensual estimada" hint="Lo que crees que rentarías al mes."><MoneyInput value={f.renta_mensual} onChange={(v) => set('renta_mensual', v)} /></Field>
              : (<>
                <Field label="Tarifa por noche"><MoneyInput value={f.tarifa_noche} onChange={(v) => set('tarifa_noche', v)} /></Field>
                <Field label="Ocupación (%)"><input type="number" value={Math.round((f.ocupacion_pct || 0.6) * 100)} onChange={(e) => set('ocupacion_pct', Number(e.target.value) / 100)} style={inpV4} /></Field>
              </>)}
          </div>
          <NextBtn onClick={() => setStep(2)}>Siguiente · cómo lo pagas →</NextBtn>
        </div>
      )}

      {/* ② CÓMO LO PAGAS */}
      {step === 2 && (
        <div>
          <Field label="Forma de pago"><Seg value={f.con_credito} onChange={(v) => set('con_credito', v)} opts={[[false, 'De contado'], [true, 'Con crédito']]} /></Field>
          {f.con_credito && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '14px 16px', marginTop: 14 }}>
              <Field label="Enganche"><select value={f.ltv} onChange={(e) => set('ltv', Number(e.target.value))} style={{ ...inpV4, cursor: 'pointer' }}>{[10, 20, 30, 40, 50, 60, 70, 80, 90].map((e) => <option key={e} value={(100 - e) / 100}>{e}%</option>)}</select></Field>
              <Field label="Plazo"><select value={f.plazo_meses} onChange={(e) => set('plazo_meses', Number(e.target.value))} style={{ ...inpV4, cursor: 'pointer' }}>{[[60, '5 años'], [120, '10 años'], [180, '15 años'], [240, '20 años'], [300, '25 años']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="Tasa anual (%)" hint="Vacío = promedio de mercado."><input type="text" inputMode="decimal" placeholder="11.45" value={f.tasa_anual} onChange={(e) => set('tasa_anual', e.target.value.replace(/[^\d.]/g, ''))} style={inpV4} /></Field>
              <Field label="Abono extra/mes" hint="Opcional."><MoneyInput value={f.abono_capital_mensual} onChange={(v) => set('abono_capital_mensual', v)} /></Field>
            </div>
          )}
          {f.con_credito && cred && cred.pmt_mensual && (
            <div style={{ marginTop: 16, padding: '13px 16px', borderRadius: 12, background: 'rgba(109,74,255,0.06)', border: '1px solid rgba(109,74,255,0.16)', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
              {[['Mensualidad', `${fmtMXN(cred.pmt_mensual)}/mes`], ['Te presta el banco', fmtMXN(cred.monto_credito)], ['Tu enganche', fmtMXN(cred.capital_propio)], ['La renta cubre', pct(cred.cobertura_renta_pct)]].map(([l, v]) => (
                <div key={l}><div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.ink2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: V4.ink }}>{v}</div></div>
              ))}
            </div>
          )}
          <NextBtn onClick={() => setStep(3)}>Siguiente · supuestos →</NextBtn>
        </div>
      )}

      {/* ③ SUPUESTOS */}
      {step === 3 && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink3, marginBottom: 14 }}>Estimados editables. Los valores por defecto son conservadores y de mercado.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '14px 16px' }}>
            <Field label="Horizonte (años)" hint="En cuántos años venderías."><input type="number" value={f.horizonte_anios} onChange={(e) => set('horizonte_anios', Number(e.target.value))} style={inpV4} /></Field>
            <Field label="Plusvalía anual (%)"><input type="number" step="0.1" value={+(f.apreciacion_anual * 100).toFixed(1)} onChange={(e) => set('apreciacion_anual', Number(e.target.value) / 100)} style={inpV4} /></Field>
            <Field label="Crecimiento renta (%)"><input type="number" step="0.1" value={+(f.crecimiento_renta_anual * 100).toFixed(1)} onChange={(e) => set('crecimiento_renta_anual', Number(e.target.value) / 100)} style={inpV4} /></Field>
            <Field label="Predial / año"><MoneyInput value={f.predial} onChange={(v) => set('predial', v)} /></Field>
            <Field label="Mantenimiento / año"><MoneyInput value={f.mantenimiento} onChange={(v) => set('mantenimiento', v)} /></Field>
            <Field label="Seguro / año"><MoneyInput value={f.seguro} onChange={(v) => set('seguro', v)} /></Field>
            <Field label="Perfil fiscal"><select value={f.perfil} onChange={(e) => set('perfil', e.target.value)} style={{ ...inpV4, cursor: 'pointer' }}><option value="fisica">Persona física</option><option value="moral">Persona moral</option></select></Field>
            {f.perfil === 'fisica' && <Field label="Régimen"><select value={f.regimen_fiscal} onChange={(e) => set('regimen_fiscal', e.target.value)} style={{ ...inpV4, cursor: 'pointer' }}>{REGIMENES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>}
          </div>
          <NextBtn onClick={() => setStep(4)}>Ver mi resultado →</NextBtn>
        </div>
      )}

      {/* ④ RESULTADO */}
      {step === 4 && (
        <div>
          {!r ? (
            <div style={{ fontFamily: SANS, fontSize: 13, color: V4.ink3, padding: '20px 0' }}>{loading ? 'Calculando…' : 'Ajusta tus datos en los pasos anteriores para ver el resultado.'}</div>
          ) : (<>
            {/* veredicto */}
            {r.veredicto && (
              <div style={{ borderRadius: 14, padding: '16px 18px', marginBottom: 16, background: `${sem}0F`, border: `1px solid ${sem}44` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 9999, background: sem }} />
                  <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: sem }}>{r.veredicto.nivel}</span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: V4.ink2, lineHeight: 1.55 }}>{r.veredicto.parrafo}</div>
              </div>
            )}
            {/* 4 métricas hero */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
              <ResultCard eyebrow="Rinde al año · solo renta" value={pct(r.cap_rate_pct)} sub="Cap rate · estable, no depende de cuándo vendas" accent={V4.theme} />
              <ResultCard eyebrow={`Si vendes al año ${H}`} value={pct(r.tir_pct)} sub="TIR · renta + plusvalía" accent={sem} />
              <ResultCard eyebrow="Flujo cada mes" value={`${fmtMXN(r.flujo_mensual_1)}${(r.flujo_mensual_1 || 0) >= 0 ? '' : ''}`} sub={(r.flujo_mensual_1 || 0) >= 0 ? 'Te queda en la bolsa' : 'Pones de tu bolsa'} accent={(r.flujo_mensual_1 || 0) >= 0 ? V4.green : V4.amber} />
              <ResultCard eyebrow="Multiplicas tu dinero" value={r.equity_multiple != null ? `${Number(r.equity_multiple).toFixed(2)}×` : '—'} sub="Por cada $1 que pones, al final" accent={V4.theme} />
            </div>

            {/* ¿cuándo vender? — TIR por año de salida */}
            {r.proyeccion && r.proyeccion.rows && r.proyeccion.rows.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: V4.ink, marginBottom: 8 }}>¿En qué año conviene vender?</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {r.proyeccion.rows.map((row) => { const on = row.anio === H; const best = r.proyeccion.mejor_anio === row.anio; return (
                    <button key={row.anio} type="button" onClick={() => set('horizonte_anios', row.anio)} style={{ cursor: 'pointer', fontFamily: HEAD, fontSize: 12, fontWeight: 800, padding: '8px 12px', borderRadius: 10, border: best ? `1.5px solid ${V4.theme}` : `1px solid ${V4.line}`, background: on ? 'rgba(109,74,255,0.12)' : '#fff', color: (row.tir_si_vendes || 0) >= 0 ? (on ? V4.theme : V4.ink) : V4.red }}>
                      {row.anio}a · {pct(row.tir_si_vendes)}{best ? ' ★' : ''}
                    </button>
                  ); })}
                </div>
                {r.proyeccion.payback_anio && <div style={{ fontFamily: SANS, fontSize: 11.5, color: V4.ink3, marginTop: 8 }}>Recuperas tu inversión alrededor del <b style={{ color: V4.ink2 }}>año {r.proyeccion.payback_anio}</b>. ★ = mejor año para vender.</div>}
              </div>
            )}

            {/* escenarios */}
            {r.escenarios && r.escenarios.base && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: V4.ink, marginBottom: 8 }}>¿Y si sale mejor o peor?</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
                  {[['🟢 Optimista', 'optimista'], ['⚪ Base', 'base'], ['🔴 Pesimista', 'pesimista']].map(([t, k]) => { const s = r.escenarios[k] || {}; return (
                    <div key={k} style={{ padding: '12px 14px', borderRadius: 12, background: k === 'base' ? 'rgba(109,74,255,0.07)' : '#fafafb', border: k === 'base' ? `1.5px solid ${V4.theme}` : `1px solid ${V4.line}` }}>
                      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 12, color: V4.ink }}>{t}</div>
                      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: (s.tir_pct || 0) >= 0 ? V4.green : V4.red, marginTop: 3 }}>{pct(s.tir_pct)} <span style={{ fontSize: 10, color: V4.ink3, fontWeight: 600 }}>TIR</span></div>
                      <div style={{ fontFamily: SANS, fontSize: 11, color: V4.ink2, marginTop: 2 }}>flujo {fmtMXN(s.flujo_mensual)}/mes</div>
                    </div>
                  ); })}
                </div>
              </div>
            )}

            {/* vs otras inversiones */}
            {r.instrumentos && r.instrumentos.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: V4.ink, marginBottom: 8 }}>Comparado con otras inversiones (rendimiento anual)</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ padding: '9px 13px', borderRadius: 10, background: 'rgba(109,74,255,0.1)', border: `1.5px solid ${V4.theme}` }}>
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.ink2, fontWeight: 700 }}>Este depa (TIR)</div>
                    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: V4.theme }}>{pct(r.tir_pct)}</div>
                  </div>
                  {r.instrumentos.map((i) => (
                    <div key={i.k || i.nombre} style={{ padding: '9px 13px', borderRadius: 10, background: '#fafafb', border: `1px solid ${V4.line}` }} title={i.riesgo ? `Riesgo ${i.riesgo}` : undefined}>
                      <div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.ink2, fontWeight: 700 }}>{i.nombre}</div>
                      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: V4.ink }}>{pct(i.pct)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={{ marginTop: 20, padding: '18px 20px', borderRadius: 14, background: GRAD, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', boxShadow: '0 10px 28px rgba(109,74,255,0.28)' }}>
              <div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17 }}>¿Te late? Llévalo al siguiente paso.</div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, opacity: 0.92, marginTop: 3 }}>Un asesor te arma el plan a tu medida —crédito, mejor año para vender— sin costo.</div>
              </div>
              <button className="dmx-press" onClick={() => onLead && onLead()} style={{ padding: '12px 20px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: HEAD, fontWeight: 800, fontSize: 13, background: '#fff', color: V4.theme, whiteSpace: 'nowrap' }}>Quiero que me asesoren →</button>
            </div>
            <div style={{ marginTop: 14 }}><Disclaimer>Estimación de referencia con el motor de inversión de DesarrollosMX (datos vivos de mercado). No sustituye asesoría fiscal ni financiera; el rendimiento real depende del mercado y de tu crédito.</Disclaimer></div>
          </>)}
        </div>
      )}
    </div>
  );
}

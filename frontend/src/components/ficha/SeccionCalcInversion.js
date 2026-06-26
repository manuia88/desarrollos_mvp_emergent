/**
 * SeccionCalcInversion — la CALCULADORA REAL (InversionV4Calculator) de la tab "para invertir" de zona, traída a la ficha.
 * Ya NO trae selector de unidades (las unidades se eligen ARRIBA, en el Paso 2) — toma la unidad elegida de la ficha. Toggle
 * 👤 Para ti (1 unidad = la elegida) / 🏛️ Institucional (un fondo: N unidades disponibles). Re-skineado a nuestro diseño.
 */
import React, { useState, useEffect } from 'react';
import { Card, Stat, SERIF, SANS, HEAD } from './ui';
import InversionV4Calculator from '../investment/InversionV4Calculator';
import ComparadorInversion from './ComparadorInversion';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n != null ? `$${Number(n).toLocaleString('es-MX')}` : '—');
const pct = (n) => (n != null && !isNaN(n) ? `${Number(n).toFixed(1)}%` : '—');
const SEM = { verde: '#059669', amarillo: '#B45309', rojo: '#DC2626', gris: '#8A8FA6' };

export default function SeccionCalcInversion({ dev, unit, mode = 'individual', units = [], onGoTo }) {
  const [inv, setInv] = useState(null);             // contexto de inversión de la zona (renta_prom, cap_rate)
  const [result, setResult] = useState(null);       // resultado VIVO del calculador (para el resumen concreto)
  const [detalle, setDetalle] = useState(false);    // "ve los números a detalle" → muestra el calculador completo

  useEffect(() => {
    const col = dev.colonia_id || dev.colonia;
    if (!col) return undefined;
    let alive = true;
    fetch(`${API}/api/zona/${encodeURIComponent(col)}/inversion`).then((r) => r.json()).then((d) => { if (alive) setInv(d); }).catch(() => {});
    return () => { alive = false; };
  }, [dev.colonia_id, dev.colonia]);

  const fondoUnits = units || [];   // unidades del fondo (institucional), elegidas ARRIBA en el Paso 2
  const mounted = (mode === 'individual' && unit) || (mode === 'institucional' && fondoUnits.length >= 1);

  const descargarAnalisis = () => {
    try {
      window.dispatchEvent(new CustomEvent('dmx:lead', { detail: { source: 'calc_inversion_pdf', devId: dev.id, devName: dev.name, unit: unit && unit.unit_number, tir_pct: result && result.tir_pct, precio: unit && unit.price } }));
    } catch (e) { /* noop */ }
    setDetalle(true);
  };

  return (
    <Card>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(20px,2.4vw,26px)', color: 'var(--cream)' }}>Veamos qué tan tuyo puede ser</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-3)', margin: '6px 0 14px' }}>El cálculo completo con TUS datos — enganche, crédito, lo que te deja al mes y cuánto vale en unos años.</div>

      {/* contexto: qué unidad(es) — elegidas arriba en el Paso 2 */}
      <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>
        {mode === 'individual'
          ? <>Calculando con <b style={{ color: 'var(--cream)' }}>{unit.unit_number}</b> · {money(unit.price)}.</>
          : <>Fondo de <b style={{ color: 'var(--cream)' }}>{fondoUnits.length} {fondoUnits.length === 1 ? 'unidad' : 'unidades'}</b> · {money(fondoUnits.reduce((s, u) => s + (u.price || 0), 0))} total.</>}
        {' '}<button onClick={() => onGoTo && onGoTo('unidades')} style={{ background: 'none', border: 'none', color: 'var(--theme)', fontFamily: SANS, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0 }}>cambiar ↑</button>
      </div>

      {/* MOUNT · RESUMEN concreto + botón "ve los números a detalle" → calculador completo */}
      {mounted && (
        <div style={{ marginTop: 20 }}>
          {result ? (() => {
            const v = result.veredicto, c = SEM[(v && v.semaforo)] || '#B45309';
            const tir = result.tir_pct, cetes = result.cetes_1a_pct;
            const gana = tir != null && cetes != null && tir > cetes;
            const flujo = result.flujo_mensual_1 || 0;
            return (
              <div>
                {/* veredicto concreto: ¿conviene? en una línea */}
                <div style={{ padding: '16px 18px', borderRadius: 14, background: `${c}0D`, border: `1.5px solid ${c}33` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 9999, background: c }} />
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: c, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{v ? `Inversión ${v.nivel}` : 'Tu inversión'}</span>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 14, color: 'var(--cream-2)', marginTop: 8, lineHeight: 1.55 }}>
                    Rinde <b style={{ color: 'var(--cream)' }}>{pct(tir)}</b> al año{cetes != null ? <> vs CETES {pct(cetes)} — <b style={{ color: gana ? '#059669' : '#DC2626' }}>{gana ? 'le gana al banco' : 'por debajo de CETES'}</b></> : ''}.{flujo < 0 ? <> La renta no cubre el crédito: pondrías <b style={{ color: '#DC2626' }}>~{money(Math.abs(flujo))}/mes</b> de tu bolsa.</> : flujo > 0 ? <> Te deja <b style={{ color: '#059669' }}>~{money(flujo)}/mes</b> en flujo.</> : ''}
                  </div>
                </div>

                {/* los números clave */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 'clamp(14px,2vw,26px)', marginTop: 18 }}>
                  <Stat value={pct(tir)} label="Rendimiento (TIR)" accent="var(--theme)" sub={result.tir_desapalancada_pct != null ? `${pct(result.tir_desapalancada_pct)} sin crédito` : null} />
                  <Stat value={pct(result.cap_rate_pct)} label="Renta al año (cap rate)" />
                  <Stat value={money(result.capital_invertido)} label="Lo que necesitas (enganche+gastos)" />
                  <Stat value={result.equity_multiple != null ? `${Number(result.equity_multiple).toFixed(2)}x` : '—'} label="Multiplica tu capital" sub={result.neto_al_vender != null ? `${money(result.neto_al_vender)} al vender` : null} />
                </div>

                {/* ⚖️ comparar la inversión de 2 unidades (solo modo individual) */}
                {mode === 'individual' && <ComparadorInversion dev={dev} unit={unit} />}

                {/* acciones: ve a detalle + descarga el análisis (PDF + lead) */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 22 }}>
                  <button onClick={() => setDetalle((x) => !x)} style={{ flex: '1 1 300px', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '17px 28px', borderRadius: 14, border: 'none', background: detalle ? 'var(--surface-card)' : 'var(--grad)', color: detalle ? 'var(--theme)' : '#fff', boxShadow: detalle ? 'none' : '0 14px 32px rgba(109,74,255,0.36)', outline: detalle ? '1px solid var(--card-border, var(--border))' : 'none', fontFamily: HEAD, fontWeight: 800, fontSize: 16.5, cursor: 'pointer' }}>
                    {detalle ? 'Ocultar el detalle ▲' : '📊 Ve los números a detalle →'}
                  </button>
                  <button onClick={descargarAnalisis} style={{ padding: '14px 18px', borderRadius: 13, border: '1px solid var(--card-border, var(--border))', background: 'transparent', color: 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>📄 Descarga tu análisis</button>
                </div>
                {!detalle && <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginTop: 8 }}>El detalle: edita enganche, plazo, régimen fiscal, escenarios, Monte Carlo y compara contra CETES/FIBRA.</div>}
              </div>
            );
          })() : <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-3)' }}>Calculando tu inversión…</div>}

          {/* el calculador REAL — siempre montado (calcula + alimenta el resumen), visible al pedir el detalle */}
          <div key={`${mode}-${unit ? unit.id : ''}-${fondoUnits.map((u) => u.id).join(',')}`} style={{ display: detalle ? 'block' : 'none', marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--card-border, var(--border))' }}>
            <InversionV4Calculator
              mode={mode}
              prefilled={mode === 'individual' && unit ? { precio: unit.price, renta: inv && inv.renta_prom } : {}}
              portfolioUnits={mode === 'institucional' ? fondoUnits.map((u) => ({ label: u.unit_number || u.prototype || 'Unidad', precio: u.price, renta: Math.round((u.price || 0) * 0.0045) })) : []}
              lockPrice
              noStickyBar
              onResult={setResult}
              zoneId={dev.colonia_id || dev.colonia}
              capRateMercado={inv && inv.cap_rate_anual_pct}
              devId={dev.id}
              numDesarrollos={null}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

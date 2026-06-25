/**
 * SeccionCalcInversion — la CALCULADORA REAL (InversionV4Calculator) de la tab "para invertir" de zona, traída a la ficha.
 * Ya NO trae selector de unidades (las unidades se eligen ARRIBA, en el Paso 2) — toma la unidad elegida de la ficha. Toggle
 * 👤 Para ti (1 unidad = la elegida) / 🏛️ Institucional (un fondo: N unidades disponibles). Re-skineado a nuestro diseño.
 */
import React, { useState, useEffect } from 'react';
import { Card, Stat, SERIF, SANS, HEAD } from './ui';
import InversionV4Calculator from '../investment/InversionV4Calculator';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n != null ? `$${Number(n).toLocaleString('es-MX')}` : '—');
const pct = (n) => (n != null && !isNaN(n) ? `${Number(n).toFixed(1)}%` : '—');
const SEM = { verde: '#059669', amarillo: '#B45309', rojo: '#DC2626', gris: '#8A8FA6' };

export default function SeccionCalcInversion({ dev, unit, onGoTo }) {
  const [mode, setMode] = useState('individual');   // 'individual' (la unidad elegida) | 'institucional' (N unidades)
  const [nFondo, setNFondo] = useState(5);          // cuántas unidades evalúa el fondo
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

  const dispo = (dev.units || []).filter((u) => u.status === 'disponible').sort((a, b) => (a.price || 0) - (b.price || 0));
  const fondoUnits = dispo.slice(0, Math.min(nFondo, dispo.length));
  const mounted = (mode === 'individual' && unit) || (mode === 'institucional' && fondoUnits.length >= 1);

  return (
    <Card>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(20px,2.4vw,26px)', color: 'var(--cream)' }}>Veamos qué tan tuyo puede ser</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-3)', margin: '6px 0 18px' }}>El cálculo completo con TUS datos — enganche, crédito, lo que te deja al mes y cuánto vale en unos años.</div>

      {/* ¿Para ti o institucional? */}
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>¿Para ti o institucional?</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        {[['individual', '👤 Para ti', 'Compras 1 departamento'], ['institucional', '🏛️ Institucional', 'Un fondo compra 2 o más']].map(([v, l, d]) => {
          const on = mode === v;
          return (
            <button key={v} onClick={() => setMode(v)} style={{ textAlign: 'left', padding: '12px 18px', borderRadius: 13, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: on ? 'rgba(109,74,255,0.07)' : 'var(--surface-card)', color: on ? 'var(--theme)' : 'var(--cream)' }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14 }}>{l}</div>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: 'var(--cream-3)', marginTop: 1 }}>{d}</div>
            </button>
          );
        })}
      </div>

      {/* contexto: qué unidad(es) usa — conectado a lo elegido arriba */}
      <div style={{ marginTop: 16 }}>
        {mode === 'individual' ? (
          unit ? (
            <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>Calculando con tu unidad elegida: <b style={{ color: 'var(--cream)' }}>{unit.unit_number}</b> · {money(unit.price)}. <button onClick={() => onGoTo && onGoTo('unidades')} style={{ background: 'none', border: 'none', color: 'var(--theme)', fontFamily: SANS, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0 }}>cambiar ↑</button></div>
          ) : (
            <div style={{ padding: '13px 16px', borderRadius: 12, background: 'rgba(109,74,255,0.05)', border: '1px solid rgba(109,74,255,0.2)', fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>Elige tu unidad arriba para calcular con sus números exactos.</span>
              <button onClick={() => onGoTo && onGoTo('unidades')} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>Elegir unidad ↑</button>
            </div>
          )
        ) : (
          <div>
            <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)', marginBottom: 10 }}>El fondo evalúa las unidades disponibles más accesibles. ¿Cuántas?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[2, 5, 10, dispo.length].filter((n, i, a) => n > 0 && a.indexOf(n) === i).map((n) => {
                const on = nFondo === n;
                return <button key={n} onClick={() => setNFondo(n)} style={{ padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${on ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: on ? 'rgba(109,74,255,0.07)' : 'var(--surface-card)', color: on ? 'var(--theme)' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{n === dispo.length ? `Todas (${dispo.length})` : n}</button>;
              })}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginTop: 8 }}>Portafolio: {fondoUnits.length} unidades · {money(fondoUnits.reduce((s, u) => s + (u.price || 0), 0))} total.</div>
          </div>
        )}
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

                {/* botón → ve los números a detalle */}
                <button onClick={() => setDetalle((x) => !x)} style={{ marginTop: 20, padding: '14px 24px', borderRadius: 13, border: 'none', background: detalle ? 'var(--surface-card)' : 'var(--grad)', color: detalle ? 'var(--theme)' : '#fff', boxShadow: detalle ? 'none' : '0 10px 26px rgba(109,74,255,0.28)', outline: detalle ? '1px solid var(--card-border, var(--border))' : 'none', fontFamily: HEAD, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                  {detalle ? 'Ocultar el detalle ▲' : 'Ve los números a detalle →'}
                </button>
                {!detalle && <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginTop: 8 }}>Edita enganche, plazo, régimen fiscal, escenarios, Monte Carlo y compara contra CETES/FIBRA.</div>}
              </div>
            );
          })() : <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-3)' }}>Calculando tu inversión…</div>}

          {/* el calculador REAL — siempre montado (calcula + alimenta el resumen), visible al pedir el detalle */}
          <div key={`${mode}-${unit ? unit.id : ''}-${nFondo}`} style={{ display: detalle ? 'block' : 'none', marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--card-border, var(--border))' }}>
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

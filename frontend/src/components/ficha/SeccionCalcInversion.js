/**
 * SeccionCalcInversion — la CALCULADORA DE INVERSIÓN REAL de la tab "para invertir" de zona, TRAÍDA a la ficha (no una versión
 * mía). Reusa el componente InversionV4Calculator (individual + institucional, portafolio, Monte Carlo, sensibilidad, PDF) tal
 * cual; lo que re-skineo a nuestro diseño es el wrapper: toggle 👤/🏛️ + selector de unidades de ESTE desarrollo. Scoped al dev.
 */
import React, { useState, useEffect } from 'react';
import { Card, SERIF, SANS, HEAD } from './ui';
import InversionV4Calculator from '../investment/InversionV4Calculator';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n != null ? `$${Number(n).toLocaleString('es-MX')}` : '—');

export default function SeccionCalcInversion({ dev, unit }) {
  const [mode, setMode] = useState('individual');     // 'individual' (1 depa) | 'institucional' (2+)
  const [pick, setPick] = useState(unit || null);      // unidad (modo individual)
  const [selUnits, setSelUnits] = useState([]);        // unidades (modo institucional)
  const [inv, setInv] = useState(null);                // contexto de inversión de la zona (renta_prom, cap_rate)

  useEffect(() => { setPick(unit || null); }, [unit]);
  useEffect(() => {
    const col = dev.colonia_id || dev.colonia;
    if (!col) return undefined;
    let alive = true;
    fetch(`${API}/api/zona/${encodeURIComponent(col)}/inversion`).then((r) => r.json()).then((d) => { if (alive) setInv(d); }).catch(() => {});
    return () => { alive = false; };
  }, [dev.colonia_id, dev.colonia]);

  const units = (dev.units || []).filter((u) => u.status === 'disponible');
  const mounted = (mode === 'individual' && pick) || (mode === 'institucional' && selUnits.length >= 1);

  const toggleUnit = (u) => {
    if (mode === 'institucional') setSelUnits((s) => (s.some((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]));
    else setPick(u);
  };

  return (
    <Card>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(20px,2.4vw,26px)', color: 'var(--cream)' }}>Veamos qué tan tuyo puede ser</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-3)', margin: '6px 0 18px' }}>El cálculo completo con TUS datos — enganche, crédito, lo que te deja al mes y cuánto vale en unos años.</div>

      {/* 1 · ¿Para ti o institucional? */}
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>1 · ¿Para ti o institucional?</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        {[['individual', '👤 Para ti', 'Compras 1 departamento'], ['institucional', '🏛️ Institucional', 'Un fondo compra 2 o más']].map(([v, l, d]) => {
          const on = mode === v;
          return (
            <button key={v} onClick={() => { setMode(v); setSelUnits([]); if (v === 'individual') setPick(unit || null); }} style={{ textAlign: 'left', padding: '11px 18px', borderRadius: 12, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: on ? 'rgba(99,102,241,0.07)' : 'var(--surface-card)', color: on ? 'var(--theme)' : 'var(--cream)' }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 13.5 }}>{l}</div>
              <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 600, color: 'var(--cream-3)', marginTop: 1 }}>{d}</div>
            </button>
          );
        })}
      </div>

      {/* 2 · unidad(es) de ESTE desarrollo */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{mode === 'institucional' ? '2 · Elige las unidades · 1 o más' : '2 · Elige la unidad'}</div>
        {units.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 9, marginTop: 12 }}>
            {units.slice(0, 18).map((u) => {
              const on = mode === 'institucional' ? selUnits.some((x) => x.id === u.id) : (pick && pick.id === u.id);
              const m2 = u.m2_total || u.m2_privative;
              const pm2 = m2 && u.price ? Math.round(u.price / m2) : null;
              return (
                <button key={u.id} onClick={() => toggleUnit(u)} style={{ position: 'relative', padding: '11px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${on ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: on ? 'rgba(99,102,241,0.06)' : 'var(--surface-card)' }}>
                  {on && <span style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: '50%', background: 'var(--theme)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: on ? 'var(--theme)' : 'var(--cream)' }}>{u.unit_number || u.prototype || 'Unidad'}</div>
                  <div style={{ fontFamily: SANS, fontSize: 10, color: 'var(--cream-3)', marginTop: 2, lineHeight: 1.5 }}>{m2}m² · {u.bedrooms || '—'} rec{u.bathrooms ? ` · ${u.bathrooms} baño` : ''}</div>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 13.5, color: '#059669', marginTop: 6 }}>{money(u.price)}</div>
                  {pm2 ? <div style={{ fontFamily: SANS, fontSize: 9.5, color: 'var(--cream-3)', marginTop: 1 }}>${pm2.toLocaleString('es-MX')}/m²</div> : null}
                </button>
              );
            })}
          </div>
        ) : <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginTop: 10 }}>Sin unidades disponibles para calcular.</div>}
        {mode === 'institucional' && <div style={{ fontFamily: SANS, fontSize: 11.5, color: selUnits.length >= 1 ? 'var(--theme)' : 'var(--cream-3)', marginTop: 10, fontWeight: 700 }}>{selUnits.length >= 1 ? `✓ ${selUnits.length} ${selUnits.length === 1 ? 'unidad elegida' : 'unidades elegidas'}` : 'Elige 1 o más unidades.'}</div>}
      </div>

      {/* MOUNT · la calculadora real (individual con 1, o institucional con 1+) */}
      {mounted && (
        <div key={`${mode}-${pick ? pick.id : ''}-${selUnits.length}`} style={{ marginTop: 22 }}>
          <InversionV4Calculator
            mode={mode}
            prefilled={mode === 'individual' && pick ? { precio: pick.price, renta: inv && inv.renta_prom } : {}}
            portfolioUnits={mode === 'institucional' ? selUnits.map((u) => ({ label: u.unit_number || u.prototype || 'Unidad', precio: u.price, renta: Math.round((u.price || 0) * 0.0045) })) : []}
            lockPrice
            zoneId={dev.colonia_id || dev.colonia}
            capRateMercado={inv && inv.cap_rate_anual_pct}
            devId={dev.id}
            numDesarrollos={null}
          />
        </div>
      )}
    </Card>
  );
}

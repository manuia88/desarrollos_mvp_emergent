/**
 * PlanDePago — el esquema de pago tal como lo definió el DESARROLLADOR en su portal (db.dev_payment_schemes), por dev.
 *   Estructura FIJA por esquema: apartado · firma/enganche% · mensualidades% (N meses, de hoy→entrega) · escritura%.
 *   Lo ÚNICO que elige el comprador es el ENGANCHE (= elegir esquema; a mayor enganche, mejor precio — descuento del dev).
 *   Incluye el DESGLOSE DEL CRÉDITO hipotecario para la escrituración (se movió aquí desde la calc; la calc ya hace TIR).
 * Datos reales: GET /api/public/payment-schemes/{dev}. Sin esquema → no se muestra (hide-if-empty).
 */
import React, { useState, useEffect } from 'react';
import { Card, SERIF, SANS, HEAD } from './ui';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n != null && !isNaN(n) ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');
const TASA = 0.1145; // tasa hipotecaria promedio (Banxico, misma que la calculadora — consistencia)

const mensualidadCredito = (monto, anios) => {
  const r = TASA / 12, n = anios * 12;
  return (!monto || !n) ? 0 : monto * r / (1 - Math.pow(1 + r, -n));
};

export default function PlanDePago({ dev, unit }) {
  const basePrice = (unit && unit.price) || dev.price_from || 0;
  const [data, setData] = useState(null);
  const [selId, setSelId] = useState(null);
  const [plazo, setPlazo] = useState(20);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/public/payment-schemes/${dev.id}`).then((r) => r.json()).then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [dev.id]);

  const schemes = (data && data.schemes) || [];
  const meses = (data && data.meses_auto) || 18;
  if (!schemes.length) return null;
  const sel = schemes.find((s) => s.id === selId) || schemes[0];
  const listaPrice = basePrice; // el descuento se mide contra el precio de lista (esquema base)

  const desc = (sel.descuento_pct || 0) / 100;
  const price = Math.round(basePrice * (1 - desc));
  const apartado = sel.apartado_mxn || 0;
  const firma = price * (sel.firma_pct || 0) / 100;
  const mensual = meses ? (price * (sel.mensualidades_pct || 0) / 100) / meses : 0;
  const escr = price * (sel.escritura_pct || 0) / 100;
  const gastos = price * 0.08;
  const entrada = firma + gastos;
  const credMensual = mensualidadCredito(escr, plazo);
  const ahorro = listaPrice - price;

  // "esperar te cuesta": cuánto subió el precio desde el lanzamiento (price_history real del dev)
  const ph = Array.isArray(dev.price_history) ? dev.price_history.filter((x) => x && x.price) : [];
  const phUp = ph.length >= 2 ? Math.round((ph[ph.length - 1].price / ph[0].price - 1) * 100) : null;

  const steps = [
    { ic: '🔖', l: 'Apartado', amt: money(apartado), sub: 'Reservas tu unidad · se acredita a la firma' },
    { ic: '✍️', l: `Enganche · ${sel.firma_pct}%`, amt: money(firma), sub: 'Al firmar el contrato' },
    ...(sel.mensualidades_pct > 0 ? [{ ic: '📅', l: `Mensualidades · ${sel.mensualidades_pct}%`, amt: `${money(mensual)}/mes`, sub: `${meses} pagos durante la obra` }] : []),
    { ic: '🔑', l: `Escrituración · ${sel.escritura_pct}%`, amt: money(escr), sub: 'Al recibir · financiable con crédito (abajo)' },
  ];

  return (
    <Card>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)' }}>Plan de pago</div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', margin: '4px 0 16px' }}>Como lo definió el desarrollador. Tú eliges cuánto enganche das — a mayor enganche, mejor precio.</div>

      {/* ELEGIR ESQUEMA (= enganche). Lo único editable del plan. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 18 }}>
        {schemes.map((s) => {
          const a = s.id === sel.id;
          return (
            <button key={s.id} onClick={() => setSelId(s.id)} style={{ textAlign: 'left', padding: '13px 15px', borderRadius: 13, border: `1.5px solid ${a ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: a ? 'rgba(99,102,241,0.07)' : 'var(--surface-card)', cursor: 'pointer' }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: a ? 'var(--theme)' : 'var(--cream)' }}>{s.nombre}</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)', marginTop: 3 }}>Enganche {s.firma_pct}%</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 12.5, color: s.descuento_pct > 0 ? '#059669' : 'var(--cream-3)', marginTop: 4 }}>{s.descuento_pct > 0 ? `−${s.descuento_pct}% precio` : 'Precio de lista'}</div>
            </button>
          );
        })}
      </div>

      {/* precio efectivo + ahorro */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, color: 'var(--cream)' }}>{money(price)}</span>
        {ahorro > 0 && <span style={{ fontFamily: SANS, fontSize: 13, color: '#059669', fontWeight: 700 }}>ahorras {money(ahorro)} vs precio de lista</span>}
      </div>

      {/* de un vistazo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: '1 1 210px', padding: '14px 16px', borderRadius: 14, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', fontWeight: 700 }}>Para entrar necesitas</div>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 25, color: 'var(--theme)' }}>{money(entrada)}</div>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>enganche {money(firma)} + escrituración {money(gastos)}</div>
        </div>
        {sel.mensualidades_pct > 0 && (
          <div style={{ flex: '1 1 210px', padding: '14px 16px', borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))' }}>
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', fontWeight: 700 }}>Durante la obra pagas</div>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 25, color: 'var(--cream)' }}>{money(mensual)}<span style={{ fontSize: 14, color: 'var(--cream-3)' }}>/mes</span></div>
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>{meses} meses</div>
          </div>
        )}
      </div>

      {/* timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--grad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{s.ic}</div>
              {i < steps.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--card-border, var(--border))', margin: '3px 0' }} />}
            </div>
            <div style={{ flex: 1, marginBottom: 11, padding: '11px 15px', borderRadius: 12, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14.5, color: 'var(--cream)' }}>{s.l}</div><div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)' }}>{s.sub}</div></div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: 'var(--theme)', whiteSpace: 'nowrap' }}>{s.amt}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CRÉDITO HIPOTECARIO (movido aquí desde la calc): financiar la escrituración */}
      <div style={{ marginTop: 6, padding: '16px 18px', borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>🏦</span>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>Crédito para la escrituración</div>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 14 }}>El {sel.escritura_pct}% que pagas al recibir lo puedes financiar con crédito hipotecario.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 14, marginBottom: 14 }}>
          {[['Te prestan', money(escr)], ['Tasa', `${(TASA * 100).toFixed(2)}%`], ['Plazo', `${plazo} años`], ['Pago mensual', `${money(credMensual)}/mes`]].map(([l, v], i) => (
            <div key={l}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: i === 3 ? 'var(--theme)' : 'var(--cream)' }}>{v}</div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)', fontWeight: 600, marginBottom: 5 }}>
          <span>Plazo del crédito</span><span style={{ color: 'var(--theme)', fontWeight: 800 }}>{plazo} años</span>
        </div>
        <input type="range" min={10} max={25} step={1} value={plazo} onChange={(e) => setPlazo(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--theme)', cursor: 'pointer' }} />
      </div>

      {/* gastos de escrituración */}
      <div style={{ marginTop: 14, padding: '12px 15px', borderRadius: 12, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.16)', fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--cream)' }}>Gastos de escrituración ≈ {money(gastos)}</b> (~8%): notario, ISAI/traslado de dominio, registro y avalúo. Van <b>aparte</b> del precio.
      </div>

      {/* upgrade: esperar te cuesta (price_history) */}
      {phUp != null && phUp > 0 && (
        <div style={{ marginTop: 12, padding: '12px 15px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)', fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
          ⏳ <b style={{ color: 'var(--cream)' }}>Esperar te cuesta.</b> En preventa el precio ya subió <b style={{ color: '#b45309' }}>+{phUp}%</b> desde el lanzamiento y sigue subiendo conforme avanza la obra. Entrar antes = mejor precio.
        </div>
      )}
    </Card>
  );
}

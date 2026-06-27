/**
 * PlanDePago — simulador del esquema de pago EN PREVENTA (cómo le pagas al desarrollador). Desglosado:
 *   Apartado → Enganche (firma) % → Mensualidades % (cuántas) → Escrituración % · + Gastos de escrituración (~8%, aparte).
 * Regla del motor payment_schemes: firma% + mensualidades% + escritura% = 100. # mensualidades = de hoy a la entrega.
 * NO duplica el simulador de CRÉDITO (eso vive en la calculadora a fondo); aquí solo la estructura de pago al dev.
 * Si el dev no definió esquema, arranca en uno TÍPICO editable (claramente "ajústalo · el dev define el final").
 */
import React, { useState } from 'react';
import { Card, SERIF, SANS, HEAD } from './ui';

const money = (n) => (n != null && !isNaN(n) ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');

function mesesAEntrega(deliveryStr) {
  const m = String(deliveryStr || '').match(/(\d{4})-(\d{2})/);
  if (!m) return 18;
  const now = new Date();
  return Math.max(1, Math.min(72, (+m[1] - now.getFullYear()) * 12 + (+m[2] - 1 - now.getMonth())));
}

function Lever({ label, value, suffix, min, max, step = 1, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)', fontWeight: 600, marginBottom: 5 }}>
        <span>{label}</span><span style={{ color: 'var(--theme)', fontWeight: 800 }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--theme)', cursor: 'pointer' }} />
    </div>
  );
}

export default function PlanDePago({ dev, unit }) {
  const price = (unit && unit.price) || dev.price_from || 0;
  const auto = mesesAEntrega(dev.delivery_estimate);
  const [apartado, setApartado] = useState(100000);
  const [engPct, setEngPct] = useState(20);
  const [mensPct, setMensPct] = useState(20);
  const [meses, setMeses] = useState(auto);
  const escrPct = Math.max(0, 100 - engPct - mensPct);
  const eng = price * engPct / 100;
  const mensual = meses ? (price * mensPct / 100) / meses : 0;
  const escr = price * escrPct / 100;
  const gastos = price * 0.08;                       // gastos de escrituración del comprador (~8%, igual que el motor)
  const entrada = eng + gastos;                      // lo que necesitas para entrar (el apartado se acredita a la firma)

  const steps = [
    { ic: '🔖', l: 'Apartado', amt: money(apartado), sub: 'Reservas tu unidad · se acredita a la firma' },
    { ic: '✍️', l: `Enganche · ${engPct}%`, amt: money(eng), sub: 'Al firmar el contrato' },
    { ic: '📅', l: `Mensualidades · ${mensPct}%`, amt: `${money(mensual)}/mes`, sub: `${meses} pagos durante la obra` },
    { ic: '🔑', l: `Escrituración · ${escrPct}%`, amt: money(escr), sub: 'Al recibir · financiable con crédito' },
  ];

  return (
    <Card>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)' }}>Plan de pago</div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', margin: '4px 0 18px' }}>Cómo le pagas al desarrollador en preventa. Ajústalo a tu medida — el desarrollador define el esquema final.</div>

      {/* lo clave de un vistazo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: '1 1 210px', padding: '14px 16px', borderRadius: 14, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', fontWeight: 700 }}>Para entrar necesitas</div>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 25, color: 'var(--theme)' }}>{money(entrada)}</div>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>enganche {money(eng)} + escrituración {money(gastos)}</div>
        </div>
        <div style={{ flex: '1 1 210px', padding: '14px 16px', borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))' }}>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', fontWeight: 700 }}>Durante la obra pagas</div>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 25, color: 'var(--cream)' }}>{money(mensual)}<span style={{ fontSize: 14, color: 'var(--cream-3)' }}>/mes</span></div>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>{meses} meses · {mensPct}% del valor</div>
        </div>
      </div>

      {/* timeline de pagos */}
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

      {/* palancas (simulador) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '14px 22px', marginTop: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))' }}>
        <Lever label="Enganche" value={engPct} suffix="%" min={5} max={50} onChange={(v) => { setEngPct(v); if (v + mensPct > 100) setMensPct(100 - v); }} />
        <Lever label="Mensualidades" value={mensPct} suffix="%" min={0} max={Math.max(0, 100 - engPct)} onChange={setMensPct} />
        <Lever label="# mensualidades" value={meses} suffix=" meses" min={1} max={Math.max(12, auto + 12)} onChange={setMeses} />
        <Lever label="Apartado" value={Math.round(apartado / 1000)} suffix="k" min={0} max={500} step={10} onChange={(v) => setApartado(v * 1000)} />
      </div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', marginTop: 8 }}>La escrituración se ajusta sola: <b style={{ color: 'var(--cream-2)' }}>{escrPct}%</b> = 100 − enganche − mensualidades.</div>

      {/* gastos de escrituración */}
      <div style={{ marginTop: 14, padding: '12px 15px', borderRadius: 12, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.16)', fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--cream)' }}>Gastos de escrituración ≈ {money(gastos)}</b> (~8%): notario, ISAI/traslado de dominio, registro y avalúo. Van <b>aparte</b> del precio. La parte de escrituración la puedes financiar con crédito hipotecario — el simulador está en el análisis a fondo, abajo. 👇
      </div>
    </Card>
  );
}

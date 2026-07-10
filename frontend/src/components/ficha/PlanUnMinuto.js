/*
 *  Plan de inversión en 1 minuto (founder 07-09, investing.com "plan de trading en 1 min").
 *  Síntesis en 3 ideas — entrada / salida / veredicto — sobre el motor inversion-v4 que ya vive.
 *  El principio: SÍNTESIS > volcado. No repite la calculadora larga; da lo que importa de un vistazo.
 */
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL || '';
const FONT = "'DM Sans', system-ui, -apple-system, sans-serif";
const HEAD = "'Outfit', system-ui, -apple-system, sans-serif";
const SEMA = { verde: '#1E9E63', amarillo: '#D98A00', rojo: '#D64545' };
const money = (n) => (n != null ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');
const pct = (n) => (n != null ? `${n > 0 ? '+' : ''}${Number(n).toFixed(1)}%` : '—');

export default function PlanUnMinuto({ dev, unit }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const price = (unit && (unit.price || unit.price_mxn)) || dev.price_from || dev.price_min_mxn;

  useEffect(() => {
    let alive = true;
    if (!price) { setLoading(false); return; }
    (async () => {
      try {
        const r = await fetch(`${API}/api/inversion-v4/analyze`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valor_propiedad: price, enganche_pct: 0.20, plazo_anios: 20, horizonte_anios: 10, renta_mensual: Math.round(price * 0.0045), colonia: dev.colonia_id || dev.colonia }),
        }).then((r) => r.json());
        if (alive) setD(r);
      } catch (e) { /* fail-soft */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [price, dev.colonia_id, dev.colonia]);

  if (!price) return null;
  const v = (d && d.veredicto) || {};
  const semaColor = SEMA[v.semaforo] || '#8A8594';
  const sobre = unit && unit.sobre_mercado_pct;   // % vs mercado de la zona (ya lo calcula ingested_reader)

  const IDEAS = [
    {
      k: 'Entrada', emoji: '🎯',
      big: sobre != null ? pct(sobre) : (d ? pct(d.cap_rate_pct) : '—'),
      lbl: sobre != null ? (sobre <= 0 ? 'bajo el mercado de la zona' : 'sobre el mercado de la zona') : 'renta al año (cap rate)',
      color: sobre != null ? (sobre <= 0 ? SEMA.verde : SEMA.amarillo) : '#15121C',
    },
    {
      k: 'Rendimiento', emoji: '📈',
      big: d ? pct(d.tir_pct) : '—', lbl: 'a 10 años (TIR estimada)', color: '#15121C',
    },
    {
      k: 'Al vender', emoji: '💰',
      big: d ? money(d.neto_al_vender) : '—', lbl: 'neto estimado en tu bolsillo', color: '#15121C',
    },
  ];

  return (
    <div className="dmx-card" style={{ border: `1px solid #EFEBF4`, borderRadius: 16, padding: 18, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ width: 11, height: 11, borderRadius: 999, background: semaColor, flex: 'none' }} />
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: '#15121C' }}>Tu plan en 1 minuto</div>
        {v.nivel && <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: semaColor, textTransform: 'capitalize' }}>· {v.nivel}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '12px 0' }}>
        {IDEAS.map((it) => (
          <div key={it.k} style={{ background: '#FBFAFC', border: '1px solid #F1EEF7', borderRadius: 12, padding: '12px 12px' }}>
            <div style={{ fontFamily: FONT, fontSize: 12, color: '#9A93A6', fontWeight: 600 }}>{it.emoji} {it.k}</div>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: it.color, marginTop: 3, letterSpacing: '-0.01em' }}>{loading ? '…' : it.big}</div>
            <div style={{ fontFamily: FONT, fontSize: 11.5, color: '#5B5568', lineHeight: 1.35, marginTop: 2 }}>{it.lbl}</div>
          </div>
        ))}
      </div>
      {v.acciones && v.acciones.length > 0 && (
        <div style={{ fontFamily: FONT, fontSize: 13, color: '#5B5568', background: '#F7F5FC', borderRadius: 10, padding: '10px 12px' }}>
          <b style={{ color: '#15121C' }}>Qué hacer:</b> {v.acciones[0]}.
        </div>
      )}
      <div style={{ fontFamily: FONT, fontSize: 11, color: '#9A93A6', marginTop: 8 }}>
        Estimación con supuestos estándar (20% enganche, 10 años). Ajústalos en la calculadora. No es asesoría.
      </div>
    </div>
  );
}

/**
 * ComparadorInversion — compara la INVERSIÓN de 2 unidades del mismo desarrollo lado a lado (la decisión real del comprador:
 * ¿cuál me conviene más?). Reusa el motor /api/inversion-v4/analyze con los MISMOS supuestos para ambas (comparación justa).
 * Resalta la mejor por métrica. Sistema visual único.
 */
import React, { useState, useEffect } from 'react';
import { SERIF, SANS, HEAD } from './ui';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n != null && !isNaN(n) ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');
const pct = (n) => (n != null && !isNaN(n) ? `${Number(n).toFixed(1)}%` : '—');

const analyze = (dev, price) => fetch(`${API}/api/inversion-v4/analyze`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ valor_propiedad: price, enganche_pct: 0.20, plazo_anios: 20, horizonte_anios: 10, renta_mensual: Math.round(price * 0.0045), colonia: dev.colonia_id || dev.colonia }),
}).then((r) => r.json()).catch(() => null);

// métrica → cómo leerla y si "más es mejor"
const METRICAS = [
  ['Rendimiento (TIR)', (d) => d && d.tir_pct, pct, true],
  ['Renta al año (cap rate)', (d) => d && d.cap_rate_pct, pct, true],
  ['Flujo al mes', (d) => d && d.flujo_mensual_1, money, true],
  ['Lo que necesitas', (d) => d && d.capital_invertido, money, false],
  ['Multiplica tu capital', (d) => d && d.equity_multiple, (n) => (n != null ? `${Number(n).toFixed(2)}x` : '—'), true],
  ['Neto al vender', (d) => d && d.neto_al_vender, money, true],
];

export default function ComparadorInversion({ dev, unit }) {
  const [open, setOpen] = useState(false);
  const [cmpId, setCmpId] = useState('');
  const [a, setA] = useState(null);   // unidad base (la elegida)
  const [b, setB] = useState(null);   // unidad a comparar
  const [loading, setLoading] = useState(false);

  const dispo = (dev.units || []).filter((u) => u.status === 'disponible' && (!unit || u.id !== unit.id)).sort((x, y) => (x.price || 0) - (y.price || 0));
  const cmpUnit = dispo.find((u) => u.id === cmpId) || null;

  useEffect(() => {
    if (!open || !unit || !cmpUnit) return undefined;
    let alive = true; setLoading(true);
    Promise.all([analyze(dev, unit.price), analyze(dev, cmpUnit.price)]).then(([ra, rb]) => {
      if (alive) { setA(ra && ra.ok ? ra : null); setB(rb && rb.ok ? rb : null); setLoading(false); }
    });
    return () => { alive = false; };
  }, [open, unit && unit.id, cmpId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!unit || dispo.length === 0) return null;

  const Col = ({ u, data, head }) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: head ? 'var(--theme)' : 'var(--cream)' }}>{u.unit_number}</div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 4 }}>{money(u.price)} · piso {u.level}</div>
    </div>
  );

  return (
    <div style={{ marginTop: 18 }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ padding: '11px 18px', borderRadius: 12, border: '1px solid var(--card-border, var(--border))', background: 'transparent', color: 'var(--theme)', fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>⚖️ Comparar con otra unidad</button>
      ) : (
        <div style={{ padding: 'clamp(16px,2.4vw,22px)', borderRadius: 14, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, color: 'var(--cream)' }}>¿Cuál te conviene más?</div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', fontFamily: SANS, fontSize: 12.5, cursor: 'pointer' }}>cerrar ✕</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>
            <span>Comparar <b style={{ color: 'var(--theme)' }}>{unit.unit_number}</b> contra:</span>
            <select value={cmpId} onChange={(e) => setCmpId(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)', fontFamily: HEAD, fontWeight: 700, fontSize: 14, color: 'var(--cream)', cursor: 'pointer' }}>
              <option value="">Elige una unidad…</option>
              {dispo.map((u) => <option key={u.id} value={u.id}>{u.unit_number} · {money(u.price)}</option>)}
            </select>
          </div>

          {!cmpUnit ? (
            <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-3)' }}>Elige una segunda unidad para ver cuál rinde mejor.</div>
          ) : loading ? (
            <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-3)' }}>Comparando…</div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--card-border, var(--border))' }}>
                <div />
                <Col u={unit} data={a} head />
                <Col u={cmpUnit} data={b} />
              </div>
              {METRICAS.map(([label, get, fmt, hiBetter], i) => {
                const va = get(a), vb = get(b);
                const aWins = va != null && vb != null && (hiBetter ? va > vb : va < vb);
                const bWins = va != null && vb != null && (hiBetter ? vb > va : vb < va);
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--card-border, var(--border))' }}>
                    <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', fontWeight: 700 }}>{label}</span>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: aWins ? '#059669' : 'var(--cream)' }}>{fmt(va)}{aWins ? ' ✓' : ''}</span>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: bWins ? '#059669' : 'var(--cream)' }}>{fmt(vb)}{bWins ? ' ✓' : ''}</span>
                  </div>
                );
              })}
              {a && b && (
                <div style={{ marginTop: 14, fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>
                  {(() => {
                    const ta = a.tir_pct || 0, tb = b.tir_pct || 0;
                    if (ta === tb) return 'Ambas rinden parecido — decide por piso, vista o flujo.';
                    const winU = ta > tb ? unit : cmpUnit;
                    return <>💡 Como inversión, la <b style={{ color: 'var(--cream)' }}>{winU.unit_number}</b> rinde más (mejor TIR).</>;
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

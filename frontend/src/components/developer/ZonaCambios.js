// "Tu Zona Cambió" (Inicio · conciencia ambiental · proactivo · L63) — NO el nivel de demanda (eso es Demand Intel) sino
// el MOVIMIENTO: la búsqueda en tu zona subió/bajó, el presupuesto se movió, apareció una amenidad nueva pedida.
// Tendencia que dispara acción/timing. Consume /api/dev/market/zona-cambios. Hide-if-empty (si no hay movimiento, no renderiza).
import React, { useEffect, useState } from 'react';
import { getZonaCambios } from '../../api/developer';
import { Activity } from '../icons';

const dirColor = (x) => (x === 'sube' ? 'var(--ok, #1FA06A)' : x === 'baja' ? 'var(--hot, #F2635B)' : 'var(--theme, #6D4AFF)');
const dirGlyph = (x) => (x === 'sube' ? '↑' : x === 'baja' ? '↓' : '◆');

export default function ZonaCambios() {
  const [d, setD] = useState(null);
  useEffect(() => { getZonaCambios(30).then(setD).catch(() => setD(false)); }, []);
  if (!d || d.vacio || !(d.cambios || []).length) return null;   // hide-if-empty (consistente con el resto del Inicio)

  return (
    <div data-testid="zona-cambios" style={{
      marginBottom: 18, borderRadius: 16, overflow: 'hidden',
      background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', boxShadow: 'var(--asr-shadow, none)',
    }}>
      {/* franja IA */}
      <div style={{ padding: '15px 18px 14px', borderBottom: '1px solid var(--border, rgba(var(--cream-rgb),0.08))' }}>
        <div className="eyebrow" style={{ marginBottom: 7, color: 'var(--theme)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={11} /> TU ZONA CAMBIÓ
          <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>
            últimos {d.ventana_dias}d · señal {d.confianza}
          </span>
        </div>
        <p data-testid="zc-lectura" style={{ margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 16.5, color: 'var(--cream)', lineHeight: 1.4 }}>
          {d.lectura}
        </p>
      </div>

      {/* cada movimiento: señal + dirección + valor (antes → ahora) + lectura */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 1, background: 'var(--border, rgba(var(--cream-rgb),0.08))' }}>
        {d.cambios.map((c, i) => (
          <div key={i} data-testid="zc-cambio" style={{ background: 'var(--surface, #fff)', padding: '13px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: dirColor(c.direccion), lineHeight: 1 }}>{dirGlyph(c.direccion)}</span>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{c['señal']}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 15, color: dirColor(c.direccion) }}>{c.valor}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.45 }}>{c.lectura}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

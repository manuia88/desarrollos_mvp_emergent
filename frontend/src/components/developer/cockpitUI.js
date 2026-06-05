/**
 * cockpitUI — primitivas compartidas de los cockpits prácticos de la ficha del dev.
 * Doctrina del dato práctico: cada tarjeta = NÚMERO + PLAZO + COMPARATIVO + PARA QUÉ SIRVE.
 * Usado por UbicacionIntel, VentasIntel y las demás tabs (memory/DEV_TAB_COCKPIT_PROMPT.md).
 */
import React from 'react';

export const fmtMXN = (v) => {
  if (v == null) return '—';
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
};
export const fmtFull = (v) => (v == null ? '—' : `$${Math.round(v).toLocaleString('es-MX')}`);

export const TONE = { green: '#15803d', amber: '#B7791F', red: '#DC2626', flat: 'var(--cream-3)' };
export const DOT = { green: '#1FA06A', amber: '#E2982E', red: '#F2635B', flat: 'rgba(var(--cream-rgb),0.3)' };
export const grid = (min) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 12 });

// Bloque temático con título-pregunta.
export function Block({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--theme)', marginBottom: 10 }}>
        {title}{hint && <span style={{ color: 'var(--cream-3)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}> · {hint}</span>}
      </div>
      {children}
    </div>
  );
}

// Tarjeta chica: label + número + comparación/acción + semáforo.
export function Stat({ label, value, unit, framing, tone = 'flat', stub }) {
  return (
    <div className="dmx-card" style={{ background: '#fff', padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{label}</span>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: DOT[tone] }} />
      </div>
      <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 23, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--cream)', lineHeight: 1.05 }}>
        {value}{unit && <span style={{ fontSize: 12, color: 'var(--cream-3)', fontWeight: 700 }}>{unit}</span>}
      </div>
      {framing && <div style={{ fontSize: 11, color: 'var(--cream-2)', lineHeight: 1.4, marginTop: 7 }}>{framing}</div>}
      {stub && <div style={{ fontSize: 9.5, color: 'var(--cream-3)', marginTop: 6, fontStyle: 'italic' }}>○ se conecta pronto</div>}
    </div>
  );
}

// Tarjeta grande con ícono + título + número grande + sub + encuadre + tag (estrategias/jugadas).
export function BigCard({ icon, name, big, sub, framing, tag, tone = 'green', note }) {
  return (
    <div className="dmx-card" style={{ background: '#fff', padding: '15px 16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        <b style={{ fontSize: 13, color: 'var(--cream)' }}>{name}</b>
        {tag && <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, color: TONE[tone], background: `${DOT[tone]}22`, padding: '2px 8px', borderRadius: 999 }}>{tag}</span>}
      </div>
      <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--cream)', lineHeight: 1 }}>{big}</div>
      {sub && <div style={{ fontSize: 11.5, fontWeight: 700, color: TONE[tone], marginTop: 5 }}>{sub}</div>}
      {framing && <div style={{ fontSize: 11.5, color: 'var(--cream-2)', lineHeight: 1.45, marginTop: 8 }}>{framing}</div>}
      {note && <div style={{ fontSize: 9.5, color: 'var(--cream-3)', marginTop: 7, fontStyle: 'italic' }}>○ {note}</div>}
    </div>
  );
}

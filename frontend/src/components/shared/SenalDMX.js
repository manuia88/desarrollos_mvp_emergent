// SenalDMX — Sello honesto de "Señal DMX" (Tanda B.1).
// Muestra un índice como NIVEL en lenguaje normal (Muy Baja … Muy Alta) en vez de un
// número crudo "/100". Reusable en los 4 portales (marketplace · asesor · dev · superadmin).
// La leyenda ("de dónde sale") va en el tooltip. Tema claro/oscuro vía tokens CSS.
import React from 'react';

const COLOR = {
  verde:  { fg: 'var(--ok, #1FA06A)',   bg: 'rgba(31,160,106,0.10)' },
  ambar:  { fg: 'var(--warm, #E2982E)', bg: 'rgba(226,152,46,0.12)' },
  rojo:   { fg: 'var(--hot, #F2635B)',  bg: 'rgba(242,99,91,0.10)' },
  neutro: { fg: 'var(--cream-3)',       bg: 'rgba(var(--cream-rgb),0.06)' },
};

export default function SenalDMX({
  etiqueta, color = 'neutro', percentil, comparadoCon,
  esEstimado = false, leyenda, valor, showValor = false, size = 'md', style = {},
}) {
  const c = COLOR[color] || COLOR.neutro;
  const sm = size === 'sm';
  const tip = leyenda || (esEstimado
    ? 'Señal DMX · guía orientativa, no una medición exacta.'
    : (comparadoCon ? `Señal DMX · comparada con ${comparadoCon} zonas de la ciudad.` : 'Señal DMX'));
  return (
    <span title={tip} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: sm ? '2px 8px' : '3px 10px', borderRadius: 999,
        background: c.bg, color: c.fg, fontWeight: 700,
        fontSize: sm ? 11 : 12.5, lineHeight: 1.2, whiteSpace: 'nowrap',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: c.fg, opacity: 0.9 }} />
        {etiqueta || 'Sin Dato'}
        {showValor && valor != null && (
          <span style={{ opacity: 0.6, fontWeight: 600, marginLeft: 2 }}>· {valor}</span>
        )}
      </span>
      {esEstimado && (
        <span style={{ fontSize: sm ? 9 : 10, color: 'var(--warm, #E2982E)', fontWeight: 600 }}>estimado</span>
      )}
    </span>
  );
}

// Línea de leyenda reusable ("de dónde sale la señal") — se pone una vez por bloque.
export function SenalLeyenda({ texto, style = {} }) {
  if (!texto) return null;
  return (
    <div style={{ fontSize: 10.5, color: 'var(--cream-3)', display: 'inline-flex', alignItems: 'center', gap: 5, ...style }}>
      <span aria-hidden style={{ fontSize: 11 }}>ⓘ</span>{texto}
    </div>
  );
}

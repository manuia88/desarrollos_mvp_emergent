import React from 'react';

/**
 * Candado 5 (anti-parches) · Píldora ÚNICA de disclosure de calidad de dato.
 *
 * Estandariza el "esto es dato de ejemplo/estimado" que hoy se hace ad-hoc por feature
 * (spans inline, props sueltas). Una sola fuente visual para todo el producto.
 *
 * Props:
 *   quality: 'real' | 'seeded' | 'estimated' | 'placeholder'   (preferido)
 *   esEstimado: boolean                                         (legacy · → 'estimated')
 *   size: 'xs' | 'sm' | 'md'
 *
 * 'real' (o sin señal) → no renderiza nada (cero ruido cuando el dato es real).
 */

const STYLES = {
  seeded: {
    label: 'Datos de ejemplo', bg: '#FEF3C7', fg: '#92400E',
    title: 'Dato del catálogo de ejemplo — aún sin dato real en la plataforma.',
  },
  estimated: {
    label: 'Estimado', bg: '#FEF3C7', fg: '#92400E',
    title: 'Valor estimado con el dato disponible (no medido directamente).',
  },
  placeholder: {
    label: 'Sin dato', bg: '#F3F4F6', fg: '#6B7280',
    title: 'Aún no hay dato real para esto.',
  },
};

export default function DisclosurePill({ quality, esEstimado, size = 'sm', style }) {
  let q = quality;
  if (!q && esEstimado) q = 'estimated';
  if (!q || q === 'real') return null;

  const s = STYLES[q] || STYLES.estimated;
  const fontSize = size === 'xs' ? 9.5 : size === 'md' ? 12 : 11;

  return (
    <span
      title={s.title}
      data-data-quality={q}
      style={{
        display: 'inline-flex', alignItems: 'center',
        fontSize, fontWeight: 600, lineHeight: 1.4,
        padding: '1px 7px', borderRadius: 999,
        background: s.bg, color: s.fg, whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {s.label}
    </span>
  );
}

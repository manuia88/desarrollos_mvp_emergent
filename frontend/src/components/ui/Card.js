import React from 'react';

/**
 * DMX UI · Card — primitiva única de tarjeta. Consolida el estándar `.dmx-card` (borde + hover
 * que eleva + glow discreto · regla global del founder) en un componente, con padding y variantes.
 *
 * variant: 'default' (panel --bg-2) · 'flat' (transparente) · 'elevated' (sombra fuerte)
 * pad: número (px) o 'none'   ·   hover: activa el lift (default true)   ·   as: tag
 */
function bg(variant) {
  if (variant === 'flat') return 'transparent';
  if (variant === 'elevated') return 'var(--bg-2)';
  return 'var(--bg-2)';
}

export default function Card({
  children, variant = 'default', pad = 16, hover = true, as = 'div',
  className = '', style, ...rest
}) {
  const Tag = as;
  return (
    <Tag
      className={`${hover ? 'dmx-card' : ''} ${className}`.trim()}
      style={{
        background: bg(variant),
        border: hover ? undefined : '1px solid var(--border)',  // .dmx-card ya pone borde+hover
        borderRadius: 'var(--r-card)',
        padding: pad === 'none' ? 0 : pad,
        boxShadow: variant === 'elevated' ? 'var(--sh-card)' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

import React, { useState } from 'react';

/**
 * DMX UI · Card — tarjeta que RESALTA del fondo (fix nistora). En claro la página es blanca y la
 * tarjeta es OFF-WHITE (#F8F9F8 vía --surface-card) → contrasta sin necesidad de sombra. La sombra
 * y la elevación aparecen SOLO en hover (vida). Para tarjetas-foto usa `photo` (recorta la imagen).
 *
 * variant: 'default' (off-white) · 'flat' (transparente) · 'elevated' (sombra fija) · 'dark' (banda oscura)
 * photo: overflow hidden para que la foto herede el radio · pad: número (px) o 'none'
 */
export default function Card({
  children, variant = 'default', pad = 16, hover = true, photo = false,
  as = 'div', className = '', style, ...rest
}) {
  const Tag = as;
  const [h, setH] = useState(false);
  const lifted = hover && h && variant !== 'elevated';

  const bg = variant === 'flat' ? 'transparent'
    : variant === 'dark' ? '#0B0B12'
    : lifted ? 'var(--bg-2)' : 'var(--surface-card)';

  return (
    <Tag
      className={className}
      onMouseEnter={() => hover && setH(true)}
      onMouseLeave={() => hover && setH(false)}
      style={{
        background: bg,
        color: variant === 'dark' ? '#fff' : undefined,
        border: variant === 'flat' || variant === 'dark' ? '1px solid transparent' : '1px solid var(--card-border)',
        borderRadius: 'var(--r-card)',
        overflow: photo ? 'hidden' : undefined,
        padding: pad === 'none' ? 0 : pad,
        boxShadow: variant === 'elevated' ? 'var(--sh-card)' : (lifted ? '0 14px 32px rgba(16,24,40,0.12)' : 'none'),
        transform: lifted ? 'translateY(-4px)' : 'none',
        transition: 'transform .25s ease, box-shadow .25s ease, background .2s ease, border-color .2s ease',
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

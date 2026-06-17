import React from 'react';

/**
 * DMX UI · Button — primitiva única de botón. Sobre los tokens (var(--theme)/--cream/--border)
 * → se adapta solo al tema de cada portal. Reemplaza los botones inline ad-hoc.
 *
 * variant: 'primary' (gradiente del tema) · 'secondary' (borde) · 'ghost' (texto) · 'danger'
 * size: 'sm' | 'md' | 'lg'   ·   block: ocupa todo el ancho   ·   loading / disabled
 */
const SIZES = {
  sm: { fontSize: 12.5, padding: '7px 14px', gap: 6 },
  md: { fontSize: 14, padding: '10px 18px', gap: 8 },
  lg: { fontSize: 15.5, padding: '13px 24px', gap: 9 },
};

function variantStyle(variant) {
  switch (variant) {
    case 'secondary':
      return { background: 'transparent', color: 'var(--cream)', border: '1px solid var(--border-2)' };
    case 'ghost':
      return { background: 'transparent', color: 'var(--cream-2)', border: '1px solid transparent' };
    case 'danger':
      return { background: 'var(--red)', color: '#fff', border: '1px solid transparent' };
    case 'primary':
    default:
      return { background: 'var(--grad)', color: '#fff', border: '1px solid transparent' };
  }
}

export default function Button({
  children, variant = 'primary', size = 'md', block = false,
  loading = false, disabled = false, leftIcon, rightIcon, style, ...rest
}) {
  const s = SIZES[size] || SIZES.md;
  const isOff = disabled || loading;
  return (
    <button
      disabled={isOff}
      style={{
        display: block ? 'flex' : 'inline-flex', width: block ? '100%' : undefined,
        alignItems: 'center', justifyContent: 'center', gap: s.gap,
        fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: s.fontSize,
        padding: s.padding, borderRadius: 'var(--r-pill)', cursor: isOff ? 'not-allowed' : 'pointer',
        opacity: isOff ? 0.55 : 1, transition: 'transform .12s ease, opacity .12s ease, filter .12s ease',
        whiteSpace: 'nowrap', lineHeight: 1, ...variantStyle(variant), ...style,
      }}
      onMouseDown={(e) => { if (!isOff) e.currentTarget.style.transform = 'translateY(1px)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      {...rest}
    >
      {loading ? '…' : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

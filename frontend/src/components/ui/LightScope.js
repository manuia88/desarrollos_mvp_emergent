import React from 'react';

/**
 * DMX UI · LightScope — el FONDO CLARO del rediseño (decisión founder 2026-06-16).
 *
 * Envuelve una página/portal en el tema CLARO reusando los tokens `.theme-light-scope` que ya
 * existen (fondo #FAFAFB, superficies blancas, tinta #1E2230, tema morado). Todas las primitivas
 * (Button/Card/Badge/Input) usan var(--*), así que adentro de este scope se vuelven claras SOLAS.
 *
 * Se aplica a la cara pública + marketplace primero, y a cada portal conforme se rediseña — sin
 * tocar los portales aún oscuros (cero big-bang).
 */
export default function LightScope({ children, full = true, className = '', style, ...rest }) {
  return (
    <div
      className={`theme-light-scope ${className}`.trim()}
      style={{
        background: 'var(--bg)',
        color: 'var(--cream)',
        fontFamily: "'DM Sans', sans-serif",
        minHeight: full ? '100vh' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

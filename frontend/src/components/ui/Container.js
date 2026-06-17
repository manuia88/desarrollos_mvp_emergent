import React from 'react';

/**
 * DMX UI · Container + Section — primitivas de layout. Container centra y limita el ancho;
 * Section da el ritmo vertical. Mantienen el espaciado coherente en todas las páginas.
 */
export function Container({ children, max = 1200, pad = 24, style, ...rest }) {
  return (
    <div style={{ maxWidth: max, margin: '0 auto', padding: `0 ${pad}px`, width: '100%', ...style }} {...rest}>
      {children}
    </div>
  );
}

export function Section({ children, py = 56, style, ...rest }) {
  return (
    <section style={{ paddingTop: py, paddingBottom: py, ...style }} {...rest}>
      {children}
    </section>
  );
}

export default Container;

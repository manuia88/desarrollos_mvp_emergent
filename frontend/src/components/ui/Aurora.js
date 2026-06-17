import React from 'react';

/**
 * DMX UI · Aurora — fondo de auroras animadas (glows morado/magenta que se mueven lento) para
 * fondo CLARO. Da vida sin colores oscuros. Respeta nuestros colores (--theme / --theme-3).
 * Úsalo como capa absoluta dentro de un contenedor `position:relative; overflow:hidden`.
 * Las animaciones (keyframes dmxAurora*) viven en index.css.
 */
export default function Aurora({ intensity = 1, className = '', style }) {
  return (
    <div aria-hidden className={`dmx-aurora-wrap ${className}`} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity: intensity, ...style }}>
      <span className="dmx-aurora dmx-aurora-a" />
      <span className="dmx-aurora dmx-aurora-b" />
      <span className="dmx-aurora dmx-aurora-c" />
    </div>
  );
}

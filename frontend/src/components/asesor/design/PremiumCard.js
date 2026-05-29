// PremiumCard — la card con profundidad/glassmorphism del Sistema de Diseño asesor.
// QUÉ ES: el contenedor base (patrón EB #6: aire + jerarquía) vestido en estilo DMX
//         — sin shadow-2xl, solo borde + backdrop-blur (clase .asr-premium del CSS).
// CUÁNDO: cada lead en el pipeline/lista y los bloques de la Ficha360.
// Props: hover (eleva en translateY al pasar el mouse) · dragging · onClick · draggable handlers.
import React from 'react';

export default function PremiumCard({
  children, hover = false, dragging = false, onClick, style = {},
  className = '', ...rest
}) {
  const cls = [
    'asr-premium',
    hover ? 'asr-premium--hover' : '',
    dragging ? 'asr-premium--dragging' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      onClick={onClick}
      style={{ padding: 16, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

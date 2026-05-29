// StatusDot — punto semántico de estatus/temperatura.
// QUÉ ES: el dot de color mínimo del patrón EB #5 (color semántico sin ruido).
// CUÁNDO: encabezados de columna kanban, listas, donde haga falta señalar estado
//         de un vistazo. Toma el color de la paleta (palette.js), no inventa hex.
// Props: temp ('frio'|'tibio'|'caliente'|'cliente') | rgb (override numérico) · size.
import React from 'react';
import { tempMeta } from './palette';

export default function StatusDot({ temp, rgb, size = 8, style = {} }) {
  const color = rgb || tempMeta(temp).rgb;
  return (
    <span
      data-testid="asr-status-dot"
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 9999,
        background: `rgb(${color})`,
        boxShadow: `0 0 0 3px rgba(${color}, 0.18)`,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

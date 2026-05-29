// TemperaturePill — pill de temperatura del lead (dot + texto, sin emoji).
// QUÉ ES: el indicador térmico de cada card/ficha (caliente/tibio/frío/cliente).
// CUÁNDO: cards premium de Leads, header de la Ficha360, encabezado de columna.
// Cero emoji: usa el ícono Flame de lucide para "caliente". Color desde palette.js.
// Props: temp ('frio'|'tibio'|'caliente'|'cliente') · size ('sm'|'md').
import React from 'react';
import { Flame } from 'lucide-react';
import { tempMeta, tone } from './palette';

export default function TemperaturePill({ temp, size = 'md' }) {
  const meta = tempMeta(temp);
  const t = tone(meta.rgb);
  const sm = size === 'sm';
  return (
    <span
      data-testid={`asr-temp-pill-${meta.key}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sm ? 4 : 5,
        padding: sm ? '2px 8px' : '3px 10px',
        borderRadius: 9999,
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.text,
        fontFamily: 'DM Sans, sans-serif',
        fontWeight: 600,
        fontSize: sm ? 10 : 11,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {meta.key === 'caliente'
        ? <Flame size={sm ? 10 : 12} />
        : <span style={{ width: sm ? 5 : 6, height: sm ? 5 : 6, borderRadius: 9999, background: t.dot, display: 'inline-block' }} />}
      {meta.label}
    </span>
  );
}

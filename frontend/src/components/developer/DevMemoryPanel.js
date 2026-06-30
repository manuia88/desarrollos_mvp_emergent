// DevMemoryPanel — "Lo que aprendí de ti" (lente Personal del dev). Muestra el contexto persistente que el sistema
// derivó de las decisiones del dev (qué aplica/rechaza y por qué) + sus zonas de foco. Hide-if-empty.
import React, { useEffect, useState } from 'react';
import { getDevMemory } from '../../api/developer';

export default function DevMemoryPanel() {
  const [m, setM] = useState(null);
  useEffect(() => { getDevMemory().then(setM).catch(() => setM(null)); }, []);
  if (!m || !m.tesis) return null; // hide-if-empty (sin decisiones aún, no hay nada que recordar)

  const d = m.decisiones || {};
  const motivos = m.motivos_rechazo || [];
  return (
    <div style={{
      border: '1px solid rgba(236,72,153,0.28)', borderRadius: 14, padding: '13px 16px',
      background: 'linear-gradient(180deg, rgba(236,72,153,0.06), transparent)', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span style={{ color: '#EC4899', fontSize: 13 }}>◇</span>
        <strong style={{ fontSize: 14, color: 'var(--cream, #f0ebe0)' }}>Lo que aprendí de ti</strong>
        <span style={{ fontSize: 11, color: '#8a8a96', marginLeft: 'auto' }}>tu contexto · se afina con cada decisión</span>
      </div>
      <p style={{ fontSize: 13, color: '#e6e6ee', lineHeight: 1.5, margin: '0 0 8px' }}>{m.tesis}.</p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#b9b9c4' }}>
        <span>Aplicadas <b style={{ color: '#22c55e' }}>{d.aplicadas ?? 0}</b></span>
        <span>Rechazadas <b style={{ color: '#f59e0b' }}>{d.rechazadas ?? 0}</b></span>
        {d.tasa_aplicacion_pct != null && <span>Aplicación <b style={{ color: 'var(--cream)' }}>{d.tasa_aplicacion_pct}%</b></span>}
        {motivos.length > 0 && <span>Rechazas más por <b style={{ color: 'var(--cream)' }}>{motivos[0].motivo}</b></span>}
      </div>
    </div>
  );
}

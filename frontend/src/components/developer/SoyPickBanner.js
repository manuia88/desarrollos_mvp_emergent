/*
 *  ¿Soy pick? — le dice al desarrollador si SU proyecto (o su colonia) es un DMX Pick vigente.
 *  Consume /api/picks/lookup. Cierra el loop: los picks que ve el inversor, vistos desde la oferta.
 */
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function SoyPickBanner({ projectId, coloniaId }) {
  const [res, setRes] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!projectId && !coloniaId) return;
    const p = new URLSearchParams();
    if (projectId) p.set('entity_id', projectId);
    if (coloniaId) p.set('colonia_id', coloniaId);
    fetch(`${API}/api/picks/lookup?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setRes(d); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [projectId, coloniaId]);

  if (!loaded) return null;
  const directo = res && res.directo;
  const zona = res && res.por_zona;
  const esPick = directo || zona;

  const wrap = {
    borderRadius: 14, padding: '14px 18px', marginBottom: 18,
    display: 'flex', alignItems: 'center', gap: 12,
    border: `1px solid ${esPick ? 'rgba(99,102,241,0.4)' : 'rgba(var(--cream-rgb),0.1)'}`,
    background: esPick ? 'rgba(99,102,241,0.12)' : 'rgba(var(--cream-rgb),0.03)',
  };
  const title = { fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 };
  const sub = { fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(var(--cream-rgb),0.6)', marginTop: 3, lineHeight: 1.45 };

  if (directo) {
    return (
      <div style={wrap}>
        <span style={{ fontSize: 26 }}>🏆</span>
        <div>
          <p style={title}>Tu proyecto es DMX Pick #{directo.rank || '—'} · {directo.estrategia_label}</p>
          <p style={sub}>{directo.tesis} <b style={{ color: 'rgba(var(--cream-rgb),0.8)' }}>Congelado {(directo.fecha_pick || '').slice(0, 10)}</b> — el inversor lo ve en DMX Picks IA.</p>
        </div>
      </div>
    );
  }
  if (zona) {
    return (
      <div style={wrap}>
        <span style={{ fontSize: 26 }}>📈</span>
        <div>
          <p style={title}>Tu colonia es DMX Pick #{zona.rank || '—'} · {zona.estrategia_label}</p>
          <p style={sub}>{zona.entity_name} está entre las zonas que la IA recomienda. Aprovecha el pull de demanda de tu colonia.</p>
        </div>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <span style={{ fontSize: 22, opacity: 0.7 }}>🎯</span>
      <div>
        <p style={{ ...title, fontSize: 15 }}>Aún no eres DMX Pick</p>
        <p style={sub}>Los picks se eligen por plusvalía, renta, preventa y riesgo de zona. Mejora tu precio vs el mercado y tu score para entrar al radar del inversor.</p>
      </div>
    </div>
  );
}

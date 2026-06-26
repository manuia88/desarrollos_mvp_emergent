// El MOMENTO de la zona (motor zone_cycle_engine): fase del ciclo inmobiliario + lectura para el comprador ("¿buen momento
// para entrar?") + gentrificación. Reusa /api/zona/{slug}/ciclo. Hide-if-empty: null si el motor no tiene señal.
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const COLOR = { azul: '#3B82F6', verde: '#0E7A53', ambar: '#C98A1A', rojo: '#D14343' };
const FASE_EMO = { recuperacion: '🌱', expansion: '🚀', maduro: '🏛️', contraccion: '📉' };

export default function ZoneCycleBlock({ slug, name }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!slug) return undefined;
    fetch(`${API}/api/zona/${encodeURIComponent(slug)}/ciclo`)
      .then((r) => r.json()).then((d) => { if (alive) setData(d && d.available && d.ciclo ? d : null); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [slug]);

  if (!data) return null;   // hide-if-empty
  const { ciclo, gentrificacion: gent, lectura_comprador } = data;
  const col = COLOR[ciclo.color] || '#6366F1';

  return (
    <section style={{ width: '100%', background: 'linear-gradient(180deg,#FAFAFE,#FFFFFF)', padding: 'clamp(50px,7vw,82px) 0', borderTop: '1px solid rgba(16,18,28,0.06)' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 28px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800, background: 'linear-gradient(90deg,#6366F1,#EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>El momento de la zona</div>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px,3.6vw,40px)', letterSpacing: '-0.03em', color: '#10121C', margin: '8px 0 0', lineHeight: 1.06 }}>
          ¿Es buen momento para entrar a {name || 'esta zona'}?
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 9999, background: `${col}14`, border: `1px solid ${col}55`, color: col, fontFamily: 'Outfit', fontWeight: 800, fontSize: 15 }}>
            {FASE_EMO[ciclo.fase_key] || '📊'} {ciclo.label}
          </span>
          {ciclo.momentum_pct != null && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#5B5F76' }}>Tendencia: <b style={{ color: ciclo.momentum_pct >= 0 ? '#0E7A53' : '#D14343' }}>{ciclo.momentum_pct >= 0 ? '+' : ''}{ciclo.momentum_pct}%</b></span>
          )}
        </div>
        {lectura_comprador && (
          <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(16px,2vw,19px)', color: '#1F2333', maxWidth: 680, margin: '16px 0 0', lineHeight: 1.6, fontWeight: 500 }}>{lectura_comprador}</p>
        )}
        {gent && gent.etiqueta && (
          <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 14, background: '#fff', border: '1px solid rgba(16,18,28,0.08)' }}>
            <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, color: '#10121C' }}>Gentrificación: <span style={{ color: COLOR[gent.color] || '#6366F1' }}>{gent.etiqueta}</span>{gent.lectura ? ` — ${gent.lectura}` : ''}</div>
            {gent.leyenda && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC', marginTop: 4 }}>{gent.leyenda}</div>}
          </div>
        )}
        {data.nota && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC', marginTop: 12 }}>{data.nota}</div>}
      </div>
    </section>
  );
}

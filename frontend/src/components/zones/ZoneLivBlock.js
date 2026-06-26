// Habitabilidad por PERFIL (motor LIV · el moat de "qué tan buena es la zona para vivir"). Reusa /api/indices/zona/{slug}.
// Hide-if-empty: si el motor no tiene perfiles disponibles, no renderiza nada (cero tarjetas vacías).
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const ORDER = ['familia', 'joven', 'senior', 'inversion'];
const EMO = { familia: '👨‍👩‍👧', joven: '🧑‍🤝‍🧑', senior: '🌿', inversion: '📈' };
const letterColor = (l) => ({ A: '#0E7A53', B: '#1FA06A', C: '#C98A1A', D: '#D4711A', E: '#D14343', F: '#D14343' }[l] || '#6366F1');

export default function ZoneLivBlock({ slug, name }) {
  const [liv, setLiv] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!slug) return undefined;
    fetch(`${API}/api/indices/zona/${encodeURIComponent(slug)}`)
      .then((r) => r.json()).then((d) => { if (alive) setLiv(d && d.liv ? d.liv : null); })
      .catch(() => { if (alive) setLiv(null); });
    return () => { alive = false; };
  }, [slug]);

  const perfiles = liv && liv.perfiles ? ORDER.map((k) => [k, liv.perfiles[k]]).filter(([, v]) => v && v.available && v.valor != null) : [];
  if (perfiles.length === 0) return null;   // hide-if-empty

  return (
    <section style={{ width: '100%', background: '#fff', padding: 'clamp(50px,7vw,82px) 0', borderTop: '1px solid rgba(16,18,28,0.06)' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 28px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800, background: 'linear-gradient(90deg,#6366F1,#EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Habitabilidad real</div>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px,3.6vw,40px)', letterSpacing: '-0.03em', color: '#10121C', margin: '8px 0 0', lineHeight: 1.06 }}>
          ¿Qué tan buena es {name || 'esta zona'} para vivir?
        </h2>
        <p style={{ fontFamily: 'DM Sans', fontSize: 15.5, color: '#5B5F76', maxWidth: 640, margin: '12px 0 0', lineHeight: 1.6 }}>
          Calificación por perfil — calculada de seguridad, escuelas, parques, conectividad y servicios reales de la zona.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginTop: 24 }}>
          {perfiles.map(([k, v]) => (
            <div key={k} style={{ background: 'linear-gradient(180deg,#FAFAFE,#FFFFFF)', border: '1px solid rgba(16,18,28,0.08)', borderRadius: 16, padding: '18px 18px', boxShadow: '0 8px 24px rgba(99,102,241,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14, color: '#10121C' }}>{EMO[k]} {v.nombre}</span>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: letterColor(v.letra), lineHeight: 1 }}>{v.letra}</span>
              </div>
              <div style={{ marginTop: 10, height: 7, borderRadius: 9999, background: 'rgba(16,18,28,0.07)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.round(v.valor))}%`, height: '100%', background: letterColor(v.letra), borderRadius: 9999 }} />
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#8A8FA6', marginTop: 6 }}>{Math.round(v.valor)}/100 · {v.que_busca}</div>
            </div>
          ))}
        </div>
        {liv.fuente === 'estimado' && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC', marginTop: 14 }}>
            Estimado a partir de los subíndices reales de la zona (se afina conforme entra más dato).
          </div>
        )}
      </div>
    </section>
  );
}

/*
 *  Munición del asesor — los DMX Picks IA como argumento de venta. El mismo motor que ve el inversor,
 *  puesto en manos del asesor: "esto recomienda la IA, con su tesis". Consume /api/picks. Cero costo.
 */
import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';
const money = (n) => (n ? `$${Math.round(n).toLocaleString('es-MX')}` : null);
const EMOJI = { plusvalia: '📈', renta: '💸', preventa: '🏗️', refugio: '🛡️', emergentes: '🌱' };

export default function PicksMunicion() {
  const [picks, setPicks] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/picks`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const es = d.estrategias || {};
        // el #1 de cada estrategia = la munición de más alto nivel
        const top = Object.entries(es).map(([k, g]) => (g.picks || [])[0] ? { ...g.picks[0], _est: k } : null).filter(Boolean);
        setPicks(top);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, []);

  if (!loaded || picks.length === 0) return null;

  return (
    <div className="dmx-card" style={{ padding: '16px 18px', borderRadius: 16, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.22)', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <TrendingUp size={16} color="#A5B4FC" />
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', margin: 0 }}>Munición: lo que la IA recomienda hoy</h3>
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.6)', margin: '0 0 12px' }}>
        Úsalos con tu cliente — cada pick trae su tesis (el "por qué"). Es el mismo análisis que ve el inversor.
      </p>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {picks.map((p, i) => (
          <div key={p.id || i} style={{ flex: 'none', minWidth: 230, maxWidth: 260, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)', marginBottom: 4 }}>{EMOJI[p._est] || '•'} {p.estrategia_label}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{p.entity_name}</div>
            {p.alcaldia && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.5)' }}>{p.alcaldia}</div>}
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.72)', marginTop: 6, lineHeight: 1.4 }}>{p.tesis}</div>
            {(money(p.precio_ref_m2) || money(p.precio_ref_desde)) && (
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: '#A5B4FC', marginTop: 8 }}>
                {p.precio_ref_m2 ? `${money(p.precio_ref_m2)}/m²` : `Desde ${money(p.precio_ref_desde)}`}
              </div>
            )}
          </div>
        ))}
      </div>
      <a href="/picks" style={{ display: 'inline-block', marginTop: 10, fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, color: '#A5B4FC', textDecoration: 'none' }}>Ver los 5 de cada estrategia →</a>
    </div>
  );
}

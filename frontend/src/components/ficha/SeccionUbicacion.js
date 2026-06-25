/**
 * SeccionUbicacion — UI NUEVA (de cero) para "¿Cómo es vivir aquí?". Reusa motores reales:
 *   · /api/zona/{col}/lugares  (Google) → metro caminando + "lo mejor cerca" con rating real
 *   · /api/zona/{col}/vida      (OSM)    → "la zona en números" (densidad de servicios)
 * Sistema visual único. Solo dato real (cero inventado). Si no hay dato, no se pinta (hideIfEmpty).
 */
import React, { useState, useEffect } from 'react';
import { Card, Stat, SERIF, SANS, HEAD } from './ui';

const API = process.env.REACT_APP_BACKEND_URL;

const CAT = {
  parque: { icon: '🌳', label: 'Parques' },
  restaurante: { icon: '🍽️', label: 'Restaurantes' },
  cafe: { icon: '☕', label: 'Cafés' },
  escuela: { icon: '🎓', label: 'Escuelas' },
  hospital: { icon: '🏥', label: 'Hospitales' },
  supermercado: { icon: '🛒', label: 'Súper' },
  gimnasio: { icon: '🏋️', label: 'Gimnasios' },
  bar: { icon: '🍸', label: 'Bares' },
};
const VIDA_LABEL = { restaurante: 'Restaurantes', otro_comercio: 'Comercios', cafe: 'Cafés', banco: 'Bancos', mercado: 'Mercados', escuela: 'Escuelas', farmacia: 'Farmacias', bar: 'Bares', transporte: 'Transporte' };

export default function SeccionUbicacion({ dev }) {
  const col = dev.colonia_id || dev.colonia;
  const [lug, setLug] = useState(null);
  const [vida, setVida] = useState(null);

  useEffect(() => {
    if (!col) return undefined;
    let alive = true;
    fetch(`${API}/api/zona/${encodeURIComponent(col)}/lugares`).then((r) => r.json()).then((d) => { if (alive) setLug(d); }).catch(() => {});
    fetch(`${API}/api/zona/${encodeURIComponent(col)}/vida`).then((r) => r.json()).then((d) => { if (alive) setVida(d); }).catch(() => {});
    return () => { alive = false; };
  }, [col]);

  const metro = lug && lug.metro;
  const lugares = (lug && lug.lugares) || {};
  // mejor lugar por categoría (rating real de Google)
  const mejores = Object.entries(lugares).map(([cat, items]) => {
    if (!CAT[cat] || !Array.isArray(items) || !items.length) return null;
    const top = items.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
    return { cat, top, count: items.length };
  }).filter(Boolean).sort((a, b) => (b.top.rating || 0) - (a.top.rating || 0)).slice(0, 6);

  const vidaItems = vida && vida.amenidades
    ? Object.entries(vida.amenidades).filter(([k, v]) => VIDA_LABEL[k] && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];

  if (!metro && !mejores.length && !vidaItems.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* conectividad */}
      {metro && metro.nombre && (
        <Card>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Conectividad</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 26 }}>🚇</span>
            <div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, color: 'var(--cream)' }}>Metro {metro.nombre}</div>
              <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>a {metro.min_caminando} min caminando{metro.metros ? ` · ${metro.metros} m` : ''}</div>
            </div>
          </div>
        </Card>
      )}

      {/* lo mejor cerca (Google) */}
      {mejores.length > 0 && (
        <Card>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 4 }}>Lo mejor cerca</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginBottom: 16 }}>Lugares mejor calificados a la redonda · Google</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            {mejores.map(({ cat, top, count }) => (
              <div key={cat} style={{ display: 'flex', gap: 11, padding: '13px 15px', borderRadius: 13, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)' }}>
                <span style={{ fontSize: 20 }}>{CAT[cat].icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{CAT[cat].label}</div>
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{top.name}</div>
                  <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)', marginTop: 2 }}>{top.rating ? `⭐ ${top.rating}` : ''}{top.reviews ? ` · ${top.reviews} reseñas` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* la zona en números (OSM) */}
      {vidaItems.length > 0 && (
        <Card>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 4 }}>La zona en números</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginBottom: 16 }}>{vida.amenidades_total ? `${vida.amenidades_total} servicios a la redonda` : 'Servicios a la redonda'} · OpenStreetMap</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 'clamp(14px,2vw,28px)' }}>
            {vidaItems.map(([k, v]) => <Stat key={k} value={v} label={VIDA_LABEL[k]} />)}
          </div>
        </Card>
      )}
    </div>
  );
}

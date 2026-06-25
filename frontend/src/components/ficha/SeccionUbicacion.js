/**
 * SeccionUbicacion — UI NUEVA (de cero) para "¿Cómo es vivir aquí?". Reusa el MAPA interactivo de la zona (LugaresMap, mismo
 * componente de la página de colonia) con TABS por categoría (escuelas/restaurantes/parques…), lista de lugares clickeable
 * (vuela el mapa al pin) y el pin del desarrollo cuando hay coords. Datos reales:
 *   · /api/zona/{col}/lugares (Google) → pins + metro caminando
 *   · /api/zona/{col}/vida    (OSM)    → "la zona en números"
 * Sistema visual único. hideIfEmpty.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Stat, SERIF, SANS, HEAD } from './ui';
import LugaresMap from './LugaresMap';

const API = process.env.REACT_APP_BACKEND_URL;

const CAT = {
  restaurante: { icon: '🍽️', label: 'Restaurantes' },
  cafe: { icon: '☕', label: 'Cafés' },
  parque: { icon: '🌳', label: 'Parques' },
  escuela: { icon: '🎓', label: 'Escuelas' },
  hospital: { icon: '🏥', label: 'Salud' },
  supermercado: { icon: '🛒', label: 'Súper' },
  gimnasio: { icon: '🏋️', label: 'Gimnasios' },
  bar: { icon: '🍸', label: 'Bares' },
};
const CAT_ORDER = ['restaurante', 'cafe', 'parque', 'escuela', 'hospital', 'supermercado', 'gimnasio', 'bar'];
const VIDA_LABEL = { restaurante: 'Restaurantes', otro_comercio: 'Comercios', cafe: 'Cafés', banco: 'Bancos', mercado: 'Mercados', escuela: 'Escuelas', farmacia: 'Farmacias', bar: 'Bares', transporte: 'Transporte' };
const byRating = (arr) => (arr || []).slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));

export default function SeccionUbicacion({ dev }) {
  const col = dev.colonia_id || dev.colonia;
  const [lug, setLug] = useState(null);
  const [vida, setVida] = useState(null);
  const [cat, setCat] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    if (!col) return undefined;
    let alive = true;
    fetch(`${API}/api/zona/${encodeURIComponent(col)}/lugares`).then((r) => r.json()).then((d) => { if (alive) setLug(d); }).catch(() => {});
    fetch(`${API}/api/zona/${encodeURIComponent(col)}/vida`).then((r) => r.json()).then((d) => { if (alive) setVida(d); }).catch(() => {});
    return () => { alive = false; };
  }, [col]);

  const lugares = (lug && lug.lugares) || {};
  const metro = lug && lug.metro;
  // categorías con pins reales, en orden preferente
  const cats = CAT_ORDER.filter((k) => CAT[k] && Array.isArray(lugares[k]) && lugares[k].some((p) => p.loc && p.loc.latitude));
  const active = cat && cats.includes(cat) ? cat : cats[0];
  const items = useMemo(() => byRating(lugares[active]).filter((p) => p.loc && p.loc.latitude), [lugares, active]);

  // centro del mapa = centroide de los lugares de la categoría activa
  const center = useMemo(() => {
    const pts = items.filter((p) => p.loc);
    if (!pts.length) return null;
    const lat = pts.reduce((s, p) => s + p.loc.latitude, 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p.loc.longitude, 0) / pts.length;
    return [lng, lat];
  }, [items]);

  // pin del desarrollo si tiene coords (build-for-endstate; hoy normalmente sin coords)
  const home = (dev.lat && dev.lng) ? { loc: { latitude: dev.lat, longitude: dev.lng }, label: dev.name }
    : (dev.location && dev.location.lat ? { loc: { latitude: dev.location.lat, longitude: dev.location.lng }, label: dev.name } : null);

  const vidaItems = vida && vida.amenidades
    ? Object.entries(vida.amenidades).filter(([k, v]) => VIDA_LABEL[k] && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];

  if (!metro && !cats.length && !vidaItems.length) return null;

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

      {/* MAPA interactivo + tabs de categoría + lista */}
      {cats.length > 0 && active && (
        <Card>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 3 }}>Explora la zona</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginBottom: 14 }}>Elige qué buscar y toca un lugar para verlo en el mapa · Google</div>

          {/* tabs categoría */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {cats.map((k) => {
              const a = k === active;
              return (
                <button key={k} onClick={() => { setCat(k); setSel(null); }} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10, border: `1.5px solid ${a ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: a ? 'rgba(99,102,241,0.07)' : 'var(--surface-card)', color: a ? 'var(--theme)' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  <span>{CAT[k].icon}</span> {CAT[k].label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
            {/* mapa */}
            <LugaresMap places={items} icon={CAT[active].icon} center={center} selected={sel} onResetView={() => setSel(null)} home={home} />
            {/* lista clickeable */}
            <div style={{ maxHeight: 'clamp(300px,42vw,420px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7, paddingRight: 4 }}>
              {items.slice(0, 14).map((p, i) => {
                const a = sel && sel.name === p.name;
                return (
                  <button key={i} onClick={() => setSel(a ? null : p)} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 11, border: `1px solid ${a ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: a ? 'rgba(99,102,241,0.06)' : 'var(--surface-card)', cursor: 'pointer' }}>
                    <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    {p.rating ? <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)', marginTop: 2 }}>⭐ {p.rating}{p.reviews ? ` · ${p.reviews > 999 ? `${Math.round(p.reviews / 1000)}k` : p.reviews} reseñas` : ''}</div> : null}
                  </button>
                );
              })}
            </div>
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

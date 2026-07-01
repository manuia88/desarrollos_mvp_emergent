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
  const [pick, setPick] = useState({});   // "el finde perfecto" — elección por slot

  useEffect(() => {
    if (!col) return undefined;
    let alive = true;
    fetch(`${API}/api/zona/${encodeURIComponent(col)}/lugares`).then((r) => r.json()).then((d) => { if (alive) setLug(d); }).catch(() => {});
    fetch(`${API}/api/zona/${encodeURIComponent(col)}/vida`).then((r) => r.json()).then((d) => { if (alive) setVida(d); }).catch(() => {});
    return () => { alive = false; };
  }, [col]);

  const lugares = (lug && lug.lugares) || {};
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

  // pin del desarrollo — el dev trae coords en `dev.center` [lng, lat] (la dirección geocodificada). Antes se buscaba en
  // dev.lat / dev.location (que no existen) → por eso nunca salía el pin. Ahora marca exactamente dónde está el desarrollo.
  const home = (Array.isArray(dev.center) && dev.center.length === 2)
    ? { loc: { latitude: dev.center[1], longitude: dev.center[0] }, label: dev.name }
    : (dev.lat && dev.lng) ? { loc: { latitude: dev.lat, longitude: dev.lng }, label: dev.name }
    : (dev.location && dev.location.lat ? { loc: { latitude: dev.location.lat, longitude: dev.location.lng }, label: dev.name } : null);

  const vidaItems = vida && vida.amenidades
    ? Object.entries(vida.amenidades).filter(([k, v]) => VIDA_LABEL[k] && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];

  // "El finde perfecto" — arma un sábado con lugares reales (top por ★), editable.
  const byR = (arr) => (arr || []).filter((p) => p && p.name).slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const fslots = [['☕', 'Café de la mañana', byR(lugares.cafe)], ['🍴', 'La comida', byR(lugares.restaurante)], ['🌳', 'Tarde de paseo', byR(lugares.parque)], ['🌙', 'La cena', byR(lugares.restaurante)]].filter((s) => s[2].length);

  if (!cats.length && !vidaItems.length && !fslots.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* MAPA interactivo + tabs de categoría + lista */}
      {cats.length > 0 && active && (
        <Card>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 3 }}>Explora la zona</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginBottom: 14 }}>📍 {dev.address_full || dev.street || dev.name} · elige qué buscar y toca un lugar para verlo en el mapa · Google</div>

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

      {/* El finde perfecto — arma tu sábado con lugares reales */}
      {fslots.length >= 2 && (
        <Card>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 3 }}>Arma tu sábado</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginBottom: 18 }}>Así se vería un día aquí, con lugares reales. Cámbialos a tu gusto.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {fslots.map(([ic, label, arr], i) => {
              const idx = Math.min(pick[i] || 0, arr.length - 1);
              const p = arr[idx] || arr[0];
              const last = i === fslots.length - 1;
              return (
                <div key={label} style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>{ic}</div>
                    {!last && <div style={{ width: 2, flex: 1, background: 'var(--card-border, var(--border))', margin: '4px 0' }} />}
                  </div>
                  <div style={{ flex: 1, marginBottom: 14, padding: '12px 15px', borderRadius: 12, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)' }}>
                    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                      <select name={`slot-${i}`} aria-label={label} value={idx} onChange={(e) => setPick({ ...pick, [i]: Number(e.target.value) })} style={{ flex: '1 1 200px', minWidth: 0, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--card-border, var(--border))', fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: 'var(--cream)', background: 'var(--surface-card)', cursor: 'pointer' }}>
                        {arr.slice(0, 8).map((x, j) => <option key={`${x.name}-${j}`} value={j}>{x.name}{x.rating ? `  ·  ★${x.rating}` : ''}</option>)}
                      </select>
                      {p && p.rating ? <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 13, color: '#059669', whiteSpace: 'nowrap' }}>★{p.rating}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
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

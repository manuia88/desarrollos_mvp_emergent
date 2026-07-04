/**
 * LugaresPanel — panel COMPACTO de "qué hay alrededor" para la ficha de venta. REUSA (un solo origen):
 *   · el endpoint cacheado GET /api/zona/{colonia}/lugares (Google Places · se paga UNA vez al ingestar, no por vista)
 *   · el componente compartido LugaresMap (maplibre-gl + CARTO Positron → mapa GRATIS, sin token ni API key de Google)
 * Marca la ubicación del desarrollo (📍 home) y los locales de cada categoría a su alrededor. Toca un lugar → el mapa lo
 * ubica, sin sacar al comprador a Google. Reemplaza al iframe de Google (que no cobra pero es genérico y externo).
 * Emite señal de demanda de cercanías (onCat) por categoría explorada.
 */
import React, { useEffect, useMemo, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import LugaresMap from './LugaresMap';

const API = process.env.REACT_APP_BACKEND_URL;
const CATS = [
  ['🏫', 'escuela', 'Escuelas'], ['🌳', 'parque', 'Parques'], ['🍴', 'restaurante', 'Restaurantes'],
  ['☕', 'cafe', 'Cafés'], ['🏥', 'hospital', 'Salud'], ['🛒', 'supermercado', 'Súper'], ['🚇', 'transporte', 'Transporte'],
];
const fmtN = (n) => (n > 999 ? `${Math.round(n / 1000)}k` : `${n}`);

export default function LugaresPanel({ coloniaId, center, devName, address, onCat }) {
  const [lugares, setLugares] = useState(null);
  const [sel, setSel] = useState(null);
  const [selName, setSelName] = useState(null);

  useEffect(() => {
    if (!coloniaId) return undefined;
    let alive = true;
    fetch(`${API}/api/zona/${encodeURIComponent(coloniaId)}/lugares`)
      .then((r) => r.json())
      .then((d) => { if (alive && d && d.lugares) setLugares(d); })
      .catch(() => { /* fail-open */ });
    return () => { alive = false; };
  }, [coloniaId]);

  // pin del desarrollo (📍) a partir de center [lng,lat] | {lat,lng}
  const home = useMemo(() => {
    const c = center;
    const ll = (Array.isArray(c) && c[1] != null && c[0] != null) ? { latitude: c[1], longitude: c[0] }
      : (c && c.lat != null && c.lng != null) ? { latitude: c.lat, longitude: c.lng } : null;
    return ll ? { loc: ll, label: devName || 'El desarrollo' } : null;
  }, [center, devName]);

  const cats = useMemo(() => {
    const LG = (lugares && lugares.lugares) || {};
    return CATS
      .map(([ic, k, l]) => ({ ic, k, l, arr: (LG[k] || []).filter((p) => p && p.name).filter((p, i, a) => a.findIndex((x) => x.name === p.name) === i) }))
      .filter((c) => c.arr.length);
  }, [lugares]);

  const mapCenter = home ? [home.loc.longitude, home.loc.latitude] : null;
  const active = cats.find((c) => c.k === sel) || cats[0] || null;
  const arr = active ? active.arr : [];
  const selected = arr.find((p) => p.name === selName) || null;

  const gmaps = `https://www.google.com/maps/search/${encodeURIComponent(address || devName || '')}`;

  // Sin POIs cacheados NI coords → fallback honesto: dirección + link a Google Maps (no dejamos la sección vacía).
  if (!cats.length && !home) {
    return (
      <div style={{ border: '1px solid #ECECEC', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 14, color: '#3A3E55' }}>📍 {address || 'Ubicación del desarrollo'}</span>
        <a href={gmaps} target="_blank" rel="noreferrer" style={{ color: '#6D4AFF', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>Abrir en Google Maps →</a>
      </div>
    );
  }

  return (
    <div>
      {/* chips de categoría (con conteo real) */}
      {cats.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {cats.map((c) => {
            const on = active && c.k === active.k;
            return (
              <button key={c.k} type="button" onClick={() => { setSel(c.k); setSelName(null); if (onCat) onCat(c.k); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, border: on ? '1.5px solid transparent' : '1px solid rgba(16,18,28,0.12)', background: on ? 'linear-gradient(90deg,#6D4AFF,#C63FAE)' : '#fff', color: on ? '#fff' : '#4B4F66', boxShadow: on ? '0 6px 16px rgba(109,74,255,0.26)' : 'none', transition: 'all .16s' }}>
                <span style={{ fontSize: 15 }}>{c.ic}</span> {c.l}
                <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 9999, background: on ? 'rgba(255,255,255,0.24)' : 'rgba(109,74,255,0.1)', color: on ? '#fff' : '#6D4AFF' }}>{c.arr.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* grid: lista (izq) + mapa con pin del desarrollo (der) */}
      <div className="fv-lugares-grid" style={{ display: 'grid', gridTemplateColumns: cats.length ? '300px 1fr' : '1fr', gap: 14, alignItems: 'start' }}>
        {cats.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'clamp(300px,42vw,420px)', overflowY: 'auto', paddingRight: 4 }}>
            {arr.slice(0, 14).map((p) => {
              const son = selName === p.name;
              return (
                <button key={p.name} type="button" onClick={() => setSelName(son ? null : p.name)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left', cursor: 'pointer', width: '100%', padding: '11px 13px', borderRadius: 11, background: son ? 'rgba(109,74,255,0.08)' : '#fff', border: son ? '1.5px solid rgba(109,74,255,0.4)' : '1px solid rgba(16,18,28,0.08)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, overflow: 'hidden' }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{active.ic}</span>
                    <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: '#3A3E55', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  </span>
                  {p.rating ? <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: '#0E7A53', whiteSpace: 'nowrap', flexShrink: 0 }}>★{p.rating}{p.reviews ? <span style={{ color: '#A2A6BC', fontWeight: 600, fontSize: 11 }}> · {fmtN(p.reviews)}</span> : ''}</span> : <span style={{ color: '#C7CAD6', flexShrink: 0 }}>📍</span>}
                </button>
              );
            })}
          </div>
        )}
        <LugaresMap places={arr} icon={active ? active.ic : '📍'} center={mapCenter} home={home} selected={selected} onResetView={() => setSelName(null)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', fontStyle: 'italic' }}>
          {address ? `📍 ${address} · ` : ''}Lugares y calificaciones reales de Google alrededor del desarrollo. Toca uno y el mapa lo ubica — sin salir de aquí.
        </div>
        <a href={gmaps} target="_blank" rel="noreferrer" style={{ color: '#6D4AFF', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, textDecoration: 'none', whiteSpace: 'nowrap' }}>Abrir en Google Maps →</a>
      </div>

      <style>{`@media(max-width:640px){ .fv-lugares-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

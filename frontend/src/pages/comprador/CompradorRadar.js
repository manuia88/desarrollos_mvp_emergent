/*
 *  Radar del comprador — zonas, desarrollos y unidades que vigilas, cada uno con su ÚLTIMO CAMBIO, en UNA
 *  vista. Reusa /api/comprador/radar (favoritos + búsquedas + señales + alertas). build-for-endstate:
 *  se prende solo cuando vigilas algo y entran cambios (bajó precio, nuevo pick, etc.).
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import { fetchRadar } from '../../api/comprador';
import { Target, Building, MapPin, Home } from '../../components/icons';

const money = (n) => (n ? `$${Math.round(n).toLocaleString('es-MX')}` : null);

function Col({ icon: Icon, title, items, empty, render }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon size={16} color="var(--theme)" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.5)', padding: '10px 0', lineHeight: 1.5 }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{items.map(render)}</div>
      )}
    </div>
  );
}

function Cambio({ c }) {
  if (!c) return <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.4)' }}>Sin cambios recientes</span>;
  return <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, color: '#4ADE80', background: 'rgba(74,222,128,0.12)', borderRadius: 999, padding: '2px 8px' }}>🔔 {c.resumen || c.tipo}</span>;
}

export default function CompradorRadar() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchRadar().then((x) => { if (alive) { setD(x); setLoading(false); } }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const zonas = (d && d.zonas) || [];
  const devs = (d && d.desarrollos) || [];
  const units = (d && d.unidades) || [];
  const resumen = (d && d.resumen) || { total_vigilados: 0, con_cambio: 0 };

  return (
    <CompradorLayout>
      <div style={{ maxWidth: 1040 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Target size={20} color="var(--theme)" />
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>Radar</h1>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.72)', margin: '0 0 16px', maxWidth: 640 }}>
          Todo lo que vigilas en un solo lugar — con su último cambio. {resumen.con_cambio > 0 ? `${resumen.con_cambio} con novedad.` : 'Te avisamos cuando algo se mueva.'}
        </p>

        {loading ? (
          <div style={{ padding: 26, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Cargando tu radar…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <Col icon={MapPin} title="Zonas" items={zonas} empty={<>Aún no vigilas zonas. Guarda una búsqueda en <Link to="/comprador/saved-searches" style={{ color: 'var(--theme)' }}>Búsquedas</Link>.</>}
              render={(z, i) => (
                <Link key={i} to={`/fundamentales/${z.colonia_id}`} style={{ textDecoration: 'none', display: 'block', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 11 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{z.name}</div>
                  <div style={{ marginTop: 4 }}><Cambio c={z.ultimo_cambio} /></div>
                </Link>
              )} />
            <Col icon={Building} title="Desarrollos" items={devs} empty={<>Aún no vigilas desarrollos. Marca ♥ en una ficha o en <Link to="/comprador/favoritos" style={{ color: 'var(--theme)' }}>Favoritos</Link>.</>}
              render={(dv, i) => (
                <Link key={i} to={`/desarrollo/${dv.id}`} style={{ textDecoration: 'none', display: 'block', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 11 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{dv.name}</div>
                  {(dv.colonia || money(dv.precio_desde)) && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)' }}>{[dv.colonia, money(dv.precio_desde) && `desde ${money(dv.precio_desde)}`].filter(Boolean).join(' · ')}</div>}
                  <div style={{ marginTop: 4 }}><Cambio c={dv.ultimo_cambio} /></div>
                </Link>
              )} />
            <Col icon={Home} title="Unidades" items={units} empty="Aún no vigilas unidades. Guarda una en la ficha de un desarrollo."
              render={(u, i) => (
                <Link key={i} to={`/desarrollo/${u.dev_id}`} style={{ textDecoration: 'none', display: 'block', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 11 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>Unidad {u.unit_number || '—'}</div>
                  <div style={{ marginTop: 4 }}><Cambio c={u.ultimo_cambio} /></div>
                </Link>
              )} />
          </div>
        )}
      </div>
    </CompradorLayout>
  );
}

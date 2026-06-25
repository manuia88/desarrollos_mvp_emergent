/**
 * GeneralidadesDev — "Lo esencial" del desarrollo, ARRIBA (lo primero que un comprador quiere saber al entrar). Solo dato
 * real del proyecto: características, entrega, precio/m², plusvalía desde lanzamiento, unidades, desarrollador + track record,
 * amenidades destacadas y formas de pago disponibles. Sin métricas internas del dev. Nada inventado.
 */
import React, { useEffect, useState } from 'react';
import { fetchBuySignal } from '../../api/marketplace';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (s) => {
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})/);
  if (m) return `${MES[parseInt(m[2], 10) - 1] || ''} ${m[1]}`;
  return s;
};
const STAGE = { preventa: 'Preventa', construccion: 'En construcción', entrega_inmediata: 'Entrega inmediata', terminado: 'Terminado' };

// Amenidades → etiqueta humana + emoji (las comunes; el resto se humaniza)
const AMEN = {
  gym: '🏋️ Gimnasio', alberca: '🏊 Alberca', roof: '🌆 Roof garden', roof_garden: '🌆 Roof garden',
  spa: '💆 Spa', concierge: '🛎️ Concierge', seguridad: '🔒 Seguridad 24/7', sky_lounge: '🥂 Sky lounge',
  cava: '🍷 Cava', sala_juntas: '💼 Sala de juntas', coworking: '💻 Coworking', cine: '🎬 Cine',
  ludoteca: '🧸 Ludoteca', pet_friendly: '🐶 Pet friendly', terraza: '🌿 Terraza', jardin: '🌳 Jardín',
  bodega: '📦 Bodegas', elevador: '🛗 Elevador', sauna: '🧖 Sauna', asadores: '🔥 Asadores',
};
const humAmen = (k) => AMEN[k] || String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Tile({ icon, v, l }) {
  if (!v) return null;
  return (
    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))' }}>
      <div style={{ fontSize: 17, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(16px,1.9vw,21px)', color: 'var(--cream)', lineHeight: 1, letterSpacing: '-0.02em' }}>{v}</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{l}</div>
    </div>
  );
}

export default function GeneralidadesDev({ dev }) {
  const cfg = dev.config || {};
  const beds = dev.bedrooms_range || [];
  const m2 = dev.m2_range || [];
  const park = dev.parking_range || [];
  // Precio/m² desde la MISMA fuente que el veredicto (motor compute_price_context · este_pm2) para que NO se contradigan.
  const [pm2, setPm2] = useState(null);
  useEffect(() => {
    if (!dev.id) return;
    fetchBuySignal(dev.id).then((d) => setPm2(d?.precio_contexto?.este_pm2 || null)).catch(() => {});
  }, [dev.id]);
  const rng = (a) => (a.length ? (a[0] === a[1] ? `${a[0]}` : `${a[0]}–${a[1]}`) : null);
  const plus = cfg.plusvalia_desde_lanzamiento_pct;
  const nUnits = dev.total_units || (dev.units ? dev.units.length : null);
  const amen = (Array.isArray(cfg.amenidades) ? cfg.amenidades : (Array.isArray(dev.amenities) ? dev.amenities : [])).slice(0, 10);
  const tipoMap = { departamento: 'Departamento', casa: 'Casa', loft: 'Loft', ph: 'Penthouse', estudio: 'Estudio' };
  const tipo = tipoMap[dev.property_type] || (dev.property_type ? dev.property_type[0].toUpperCase() + dev.property_type.slice(1) : null);
  const d = dev.developer || {};

  // Formas de pago disponibles (real: config.formas_pago)
  const pagos = [];
  if (cfg.formas_pago) { pagos.push('Preventa con mensualidades'); pagos.push('Contado con descuento'); }
  pagos.push('Crédito hipotecario');

  return (
    <section data-testid="generalidades" style={{ marginTop: 24 }}>
      <div className="eyebrow" style={{ color: 'var(--theme)' }}>Lo esencial</div>
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.8vw,30px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 18px' }}>
        Generalidades del desarrollo
      </h2>

      {/* Ficha técnica — los datos que un comprador busca primero (grid compacto que cabe en 1-2 filas sin huérfanos) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(128px,1fr))', gap: 10 }}>
        <Tile icon="🏢" v={tipo} l="Tipo" />
        <Tile icon="🛏️" v={rng(beds) && `${rng(beds)}`} l="Recámaras" />
        <Tile icon="📐" v={rng(m2) && `${rng(m2)} m²`} l="Superficie" />
        <Tile icon="🚗" v={rng(park)} l="Estacionamientos" />
        <Tile icon="📅" v={fechaCorta(dev.delivery_estimate)} l={`Entrega · ${STAGE[dev.stage] || dev.stage || ''}`} />
        <Tile icon="💵" v={pm2 && `$${Number(pm2).toLocaleString('es-MX')}`} l="Precio / m²" />
        <Tile icon="📈" v={plus != null && `+${plus}%`} l="Plusvalía desde lanzamiento" />
        <Tile icon="🏗️" v={nUnits && `${nUnits}`} l="Unidades" />
      </div>

      {/* Desarrollador + track record (confianza) */}
      {d.name && (
        <div style={{ marginTop: 14, padding: '14px 18px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(99,102,241,0.07), rgba(16,185,129,0.04))', border: '1px solid var(--card-border, var(--border))', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: `hsl(${d.logo_hue || 231}, 55%, 55%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{(d.name || '?')[0]}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Desarrollador</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)' }}>{d.name}{d.founded_year ? <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, color: 'var(--cream-3)' }}> · desde {d.founded_year}</span> : ''}</div>
          </div>
          {d.projects_delivered ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: '#059669', lineHeight: 1 }}>{d.projects_delivered}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 3 }}>proyectos entregados</div>
            </div>
          ) : null}
        </div>
      )}

      {/* Amenidades destacadas */}
      {amen.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 8 }}>Amenidades destacadas</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {amen.map((a, i) => (
              <span key={i} style={{ padding: '7px 13px', borderRadius: 9999, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, color: 'var(--cream)' }}>{humAmen(a)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Formas de pago disponibles */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 8 }}>Cómo lo puedes pagar</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {pagos.map((p, i) => (
            <span key={i} style={{ padding: '7px 13px', borderRadius: 9999, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, color: '#059669' }}>✓ {p}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

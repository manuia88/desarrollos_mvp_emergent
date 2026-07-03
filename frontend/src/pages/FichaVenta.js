/**
 * FichaVenta — ficha del desarrollo con la UX/UI de apartments.com REPLICADA sección por sección,
 * adaptada a VENTA de preventa, en el lenguaje claro/editorial de DMX (LightScope).
 *
 * Patrones replicados del listing de apartments.com (estudiados en vivo):
 *  · Hero-galería mosaico con contadores de media.
 *  · Sub-nav pegajosa de anclas + columna sticky "Comunícate con esta propiedad".
 *  · PRECIOS Y MODELOS: tarjeta por MODELO (plano-thumbnail + rango de precio + specs + links) con una
 *    TABLA de unidades disponibles (Unidad · Precio · m² · Disponibilidad · posición AVM · acción) + "mostrar más".
 *  · AMENIDADES: 4 tarjetas con ícono destacado + lista de viñetas a 3 columnas.
 *  · RESEÑAS: caja de calificación + barras de desglose por estrella + tarjetas de comentario.
 * Reusa los MOTORES vivos (AVM /precio-posicion-batch, calculadoras, riesgo, zona, reseñas, 3D) — cero motor nuevo.
 * Ruta: /desarrollo/:id?venta=1 (preview) — no toca la ficha default.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LightScope, PublicNav } from '../components/ui';
import { fetchDevelopment, fetchDevelopments } from '../api/marketplace';
import { sendBuyerSignal } from '../lib/buyerSignal';
import { Card, SERIF, SANS, HEAD } from '../components/ficha/ui';
import { amenInfo } from '../components/ficha/amenIcons';
import PhotoGallery from '../components/dev/PhotoGallery';
import SeccionLente from '../components/ficha/SeccionLente';
import SeccionPanorama from '../components/ficha/SeccionPanorama';
import PlanDePago from '../components/ficha/PlanDePago';
import SeccionCalcInversion from '../components/ficha/SeccionCalcInversion';
import SeccionDinero from '../components/ficha/SeccionDinero';
import SeccionConfianza from '../components/ficha/SeccionConfianza';
import SeccionUbicacion from '../components/ficha/SeccionUbicacion';
import LeadCaptureModal from '../components/ficha/LeadCaptureModal';
import Tour3DViewer from '../components/tour3d/Tour3DViewer';
import { ComplianceBadgeInline } from '../components/marketplace/ComplianceBadge';
import AtlaxBubble from '../components/landing/AtlaxBubble';
import DevStructuredData from '../components/seo/DevStructuredData';
import { tc as titleCase } from '../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n != null && n !== '' ? `$${Number(n).toLocaleString('es-MX')}` : '—');
const STAGE = { preventa: 'Preventa', construccion: 'En construcción', entrega_inmediata: 'Entrega inmediata', terminado: 'Terminado' };
const PROTO = { PH: 'Penthouse', ph: 'Penthouse' };
const protoName = (p) => (p ? (PROTO[p] || `Tipo ${p}`) : 'Modelo');
const m2of = (u) => u.m2_total || u.m2_privative || null;

// Estado real por unidad (colores DMX: disponible verde · reservado/apartado naranja · vendido rojo)
const ESTADO = {
  disponible: { label: 'Disponible', c: '#15803d' },
  reservado: { label: 'Reservado', c: '#c2410c' },
  apartado: { label: 'Apartado', c: '#c2410c' },
  vendido: { label: 'Vendido', c: '#b91c1c' },
  bloqueado: { label: 'No disp.', c: '#64748b' },
};
// AVM (posición de precio vs mercado real) — mismo motor que el portal dev
const AVM_COLOR = { rojo: '#dc2626', naranja: '#ea580c', amarillo: '#d97706', ambar: '#d97706', verde: '#059669', gris: 'var(--cream-3)' };
const AVM_LABEL = { bajo: 'Buen precio', justo: 'En línea', alto: 'Sobre mercado' };
const planoOf = (dev, u) => u.plano_url || u.render_url || ((dev.config || {}).planos || {})[u.prototype] || (dev.photos || [])[0] || null;

const NAV = [
  ['destacados', 'Destacados'],
  ['precios', 'Precios y modelos'],
  ['dinero', 'Tu dinero'],
  ['tour', 'Recorrido 3D'],
  ['amenidades', 'Amenidades'],
  ['detalles', 'Detalles'],
  ['zona', 'La zona'],
  ['resenas', 'Reseñas'],
  ['confianza', 'Confianza'],
];

// ════════════════════ PRECIOS Y MODELOS (patrón apartments.com) ════════════════════
function VentaPrecios({ dev, selectedUnit, onSelectUnit }) {
  const allUnits = dev.units || [];
  const [avm, setAvm] = useState({});
  const [expanded, setExpanded] = useState({});   // {proto: true} = mostrar todas las unidades del modelo
  const [bed, setBed] = useState('all');           // filtro por recámaras (Todas / 1 / 2 / 3…)

  // opciones de recámaras presentes (para las tabs estilo apartments.com)
  const bedOpts = [...new Set(allUnits.map((u) => u.bedrooms).filter((x) => x != null))].sort((a, b) => a - b);
  const units = bed === 'all' ? allUnits : allUnits.filter((u) => String(u.bedrooms) === String(bed));

  useEffect(() => {
    const colid = dev.colonia_id || dev.colonia;
    const us = allUnits.filter((u) => u.price && m2of(u));
    if (!colid || !us.length) return undefined;
    let alive = true;
    fetch(`${API}/api/precio-posicion-batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colonia: colid, nueva: true, unidades: us.map((u) => ({ id: u.id, precio: u.price, m2: u.m2_privative || u.m2_total, rec: u.bedrooms, ban: u.bathrooms })) }),
    }).then((r) => r.json()).then((d) => { if (!alive) return; const m = {}; (d.unidades || []).forEach((v) => { if (v.id && v.etiqueta) m[v.id] = v; }); setAvm(m); }).catch(() => {});
    return () => { alive = false; };
  }, [dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allUnits.length) return <Card style={{ padding: 22, fontFamily: SANS, color: 'var(--cream-3)' }}>La lista de precios se publica pronto. Pídesela a tu asesor.</Card>;

  // agrupar por modelo/prototipo
  const groups = {};
  units.forEach((u) => { const k = u.prototype || '?'; (groups[k] = groups[k] || []).push(u); });
  const models = Object.entries(groups).map(([proto, us]) => {
    const prices = us.map((u) => u.price).filter(Boolean);
    const m2s = us.map(m2of).filter(Boolean);
    const beds = [...new Set(us.map((u) => u.bedrooms).filter((x) => x != null))].sort((a, b) => a - b);
    const baths = [...new Set(us.map((u) => u.bathrooms).filter((x) => x != null))].sort((a, b) => a - b);
    const avail = us.filter((u) => u.status === 'disponible').length;
    return { proto, us, min: Math.min(...prices), max: Math.max(...prices), m2min: Math.min(...m2s), m2max: Math.max(...m2s), beds, baths, avail };
  }).sort((a, b) => a.min - b.min);

  const rangeTxt = (a, b) => (a === b ? money(a) : `${money(a)} – ${money(b)}`);
  const rangeNum = (arr, suf) => (arr.length ? (arr[0] === arr[arr.length - 1] ? `${arr[0]}${suf}` : `${arr[0]}–${arr[arr.length - 1]}${suf}`) : null);
  const bedLabel = (n) => (n === 0 ? 'Estudio' : `${n} rec`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* filtro por recámaras (tabs estilo apartments.com) */}
      {bedOpts.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['all', 'Todas'], ...bedOpts.map((n) => [String(n), bedLabel(n)])].map(([k, l]) => (
            <button key={k} onClick={() => setBed(k)} style={{ padding: '8px 16px', borderRadius: 9999, border: `1px solid ${bed === k ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: bed === k ? 'var(--theme)' : 'transparent', color: bed === k ? '#fff' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
      )}
      {models.map((m) => {
        const plano = planoOf(dev, m.us[0]);
        const show = expanded[m.proto] ? m.us : m.us.slice(0, 4);
        const specs = [rangeNum(m.beds, ' rec'), rangeNum(m.baths, ' baños'), m.m2min ? (m.m2min === m.m2max ? `${m.m2min} m²` : `${m.m2min}–${m.m2max} m²`) : null].filter(Boolean).join(' · ');
        return (
          <Card key={m.proto} style={{ padding: 0, overflow: 'hidden' }}>
            {/* cabecera del modelo: plano-thumbnail + nombre + rango + specs */}
            <div style={{ display: 'flex', gap: 16, padding: '16px 18px', borderBottom: '1px solid var(--card-border, var(--border))', flexWrap: 'wrap' }}>
              <div style={{ width: 116, height: 92, borderRadius: 12, overflow: 'hidden', flex: 'none', background: '#EDEEF1', border: '1px solid var(--card-border, var(--border))' }}>
                {plano ? <img src={plano} alt={`Plano ${protoName(m.proto)}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontWeight: 700, fontSize: 26, color: 'var(--cream-3)' }}>{protoName(m.proto)}</div>}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 20, color: 'var(--cream)', lineHeight: 1.1 }}>{protoName(m.proto)}</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: 'var(--cream)', marginTop: 2 }}>{rangeTxt(m.min, m.max)}</div>
                <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)', marginTop: 3 }}>{specs}</div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => onSelectUnit(m.us.find((u) => u.status === 'disponible') || m.us[0])} style={linkBtn}>Ver este modelo →</button>
                  <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: m.avail <= 3 && m.avail > 0 ? '#DC2626' : '#059669' }}>{m.avail === 0 ? 'Agotado' : `${m.avail} disponible${m.avail === 1 ? '' : 's'}`}</span>
                </div>
              </div>
            </div>
            {/* tabla de unidades disponibles */}
            <div style={{ padding: '4px 6px 6px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, minWidth: 560 }}>
                  <thead>
                    <tr style={{ textAlign: 'left' }}>
                      {['Unidad', 'Precio', 'm²', 'Disponibilidad', 'Precio vs mercado', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '1px solid var(--card-border, var(--border))' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {show.map((u) => {
                      const est = ESTADO[u.status] || ESTADO.disponible;
                      const a = avm[u.id];
                      const sel = selectedUnit && selectedUnit.id === u.id;
                      return (
                        <tr key={u.id || u.unit_number} onClick={() => onSelectUnit(u)} style={{ cursor: 'pointer', background: sel ? 'rgba(99,102,241,0.07)' : 'transparent', borderBottom: '1px solid var(--card-border, var(--border))' }}>
                          <td style={{ padding: '11px 12px', fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>{u.unit_number}</td>
                          <td style={{ padding: '11px 12px', fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>{money(u.price)}</td>
                          <td style={{ padding: '11px 12px', fontSize: 13, color: 'var(--cream-2)' }}>{m2of(u) ? `${m2of(u)} m²` : '—'}</td>
                          <td style={{ padding: '11px 12px', fontSize: 12.5, fontWeight: 700, color: est.c }}>{est.label}</td>
                          <td style={{ padding: '11px 12px' }}>
                            {a ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: AVM_COLOR[a.color] || 'var(--cream-2)' }}><span style={{ width: 7, height: 7, borderRadius: 9999, background: AVM_COLOR[a.color] || 'var(--cream-3)' }} />{AVM_LABEL[a.etiqueta] || a.etiqueta}{a.diff_pct != null ? ` · ${a.diff_pct > 0 ? '+' : ''}${a.diff_pct}%` : ''}</span> : <span style={{ color: 'var(--cream-3)', fontSize: 12.5 }}>—</span>}
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                            <span style={{ display: 'inline-block', padding: '6px 13px', borderRadius: 9, border: '1px solid var(--card-border, var(--border))', background: sel ? 'var(--grad)' : 'transparent', color: sel ? '#fff' : 'var(--theme)', fontFamily: HEAD, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>{sel ? 'Elegida ✓' : 'Ver'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {m.us.length > 4 && (
                <button onClick={() => setExpanded((e) => ({ ...e, [m.proto]: !e[m.proto] }))} style={{ width: '100%', padding: '11px', border: 'none', background: 'transparent', color: 'var(--theme)', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  {expanded[m.proto] ? 'Mostrar menos' : `Mostrar más unidades (${m.us.length - 4})`}
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ════════════════════ AMENIDADES (patrón apartments.com: destacadas + viñetas) ════════════════════
function VentaAmenidades({ dev }) {
  const amen = Array.isArray(dev.amenities) ? dev.amenities : [];
  if (!amen.length) return null;
  const info = amen.map((a) => amenInfo(a));
  const featured = info.slice(0, 4);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
        {featured.map((a, i) => (
          <div key={i} style={{ border: '1px solid var(--card-border, var(--border))', borderRadius: 14, padding: '18px 14px', textAlign: 'center', background: 'var(--surface-card)' }}>
            <div style={{ fontSize: 26, lineHeight: 1 }}>{a.icon}</div>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: 'var(--cream)', marginTop: 9 }}>{titleCase(a.label)}</div>
          </div>
        ))}
      </div>
      <Card style={{ padding: '18px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '11px 20px' }}>
          {info.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: SANS, fontSize: 14, color: 'var(--cream-2)' }}>
              <span style={{ width: 6, height: 6, borderRadius: 9999, background: 'var(--theme)', flex: 'none' }} />{titleCase(a.label)}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ════════════════════ RESEÑAS (patrón apartments.com: rating + barras + comentarios) ════════════════════
function VentaResenas({ devId }) {
  const [data, setData] = useState(undefined);   // undefined=cargando · null=vacío
  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/reviews/development/${encodeURIComponent(devId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setData(d || null); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [devId]);

  const reviews = (data && (data.reviews || data.items)) || [];
  const avg = data && (data.avg_rating ?? data.average ?? data.rating);
  const total = (data && (data.total ?? data.count)) ?? reviews.length;
  const dist = (data && (data.distribution || data.breakdown)) || null;   // {5:n,4:n,...}

  if (data === undefined) return <Card style={{ padding: 22, fontFamily: SANS, color: 'var(--cream-3)' }}>Cargando reseñas…</Card>;
  if (!reviews.length && !avg) {
    return (
      <Card style={{ padding: '26px 22px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
        <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>Aún no hay reseñas de residentes</div>
        <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-3)', marginTop: 5, maxWidth: '48ch', margin: '5px auto 0' }}>Estamos recopilando opiniones verificadas de residentes y vecinos de la zona. Vuelve pronto.</div>
      </Card>
    );
  }
  const maxN = dist ? Math.max(...[5, 4, 3, 2, 1].map((s) => dist[s] || 0), 1) : 1;
  const stars = (n) => '★★★★★☆☆☆☆☆'.slice(5 - Math.round(n || 0), 10 - Math.round(n || 0));
  return (
    <div>
      <Card style={{ padding: '20px 22px', display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ textAlign: 'center', flex: 'none' }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 44, color: '#15803d', lineHeight: 1 }}>{avg ? Number(avg).toFixed(1) : '—'}</div>
          <div style={{ color: '#F5A623', fontSize: 16, letterSpacing: 2, marginTop: 4 }}>{stars(avg)}</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>{total} reseña{total === 1 ? '' : 's'}</div>
        </div>
        {dist && (
          <div style={{ flex: 1, minWidth: 220 }}>
            {[5, 4, 3, 2, 1].map((s) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '3px 0' }}>
                <span style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', width: 62 }}>{s} estrella{s === 1 ? '' : 's'}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 9999, background: 'rgba(16,18,28,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${((dist[s] || 0) / maxN) * 100}%`, height: '100%', background: '#15803d', borderRadius: 9999 }} />
                </div>
                <span style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)', width: 28, textAlign: 'right' }}>{dist[s] || 0}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reviews.slice(0, 6).map((rv, i) => (
          <Card key={i} style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#F5A623', fontSize: 14, letterSpacing: 2 }}>{stars(rv.rating || rv.stars)}</span>
              <span style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>{rv.date || rv.created_at || rv.source || ''}</span>
            </div>
            {rv.title && <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginTop: 8 }}>{rv.title}</div>}
            <div style={{ fontFamily: SANS, fontSize: 14, color: 'var(--cream-2)', marginTop: 6, lineHeight: 1.6 }}>{rv.text || rv.comment || rv.body}</div>
            {(rv.owner_reply || rv.reply) && (
              <div style={{ marginTop: 10, padding: '10px 13px', borderRadius: 10, background: 'rgba(21,128,61,0.06)', border: '1px solid rgba(21,128,61,0.20)' }}>
                <b style={{ fontFamily: SANS, fontSize: 12.5, color: '#15803d' }}>El desarrollador respondió:</b>
                <span style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)' }}> {rv.owner_reply || rv.reply}</span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ════════════════════ PUNTOS DESTACADOS (patrón apartments.com: ícono+label 3-col) ════════════════════
function VentaDestacados({ dev }) {
  const units = dev.units || [];
  const avail = units.filter((u) => u.status === 'disponible').length;
  const m2s = units.map(m2of).filter(Boolean);
  const amenTop = (Array.isArray(dev.amenities) ? dev.amenities : []).slice(0, 5).map((a) => amenInfo(a));
  const items = [
    { icon: '📅', label: STAGE[dev.stage] || dev.stage, sub: dev.delivery_estimate ? `Entrega ${dev.delivery_estimate}` : 'Entrega por confirmar' },
    avail > 0 && { icon: '🔑', label: `${avail} unidad${avail === 1 ? '' : 'es'} disponible${avail === 1 ? '' : 's'}`, sub: 'De la lista actual' },
    dev.bedrooms_range && { icon: '🛏️', label: `${dev.bedrooms_range} recámaras`, sub: 'Según el modelo' },
    m2s.length && { icon: '📐', label: m2s[0] === Math.max(...m2s) ? `${m2s[0]} m²` : `${Math.min(...m2s)}–${Math.max(...m2s)} m²`, sub: 'Superficie' },
    dev.price_from && { icon: '💲', label: `Desde ${money(dev.price_from)}`, sub: 'Precio de lista' },
    ...amenTop.map((a) => ({ icon: a.icon, label: titleCase(a.label), sub: null })),
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <Card style={{ padding: '18px 20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: '14px 22px' }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 21, lineHeight: 1, width: 28, textAlign: 'center', flex: 'none' }}>{it.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: 'var(--cream)', lineHeight: 1.25 }}>{it.label}</div>
              {it.sub && <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)' }}>{it.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ════════════════════ DETALLES / INFORMACIÓN (patrón apartments.com: lista de datos) ════════════════════
function VentaDetalles({ dev }) {
  const units = dev.units || [];
  const protos = [...new Set(units.map((u) => u.prototype).filter(Boolean))].length;
  const rows = [
    ['Tipo de propiedad', dev.property_type ? titleCase(dev.property_type) : 'Departamentos en preventa'],
    ['Etapa', STAGE[dev.stage] || dev.stage],
    ['Entrega estimada', dev.delivery_estimate || dev.fecha_lanzamiento || null],
    ['Niveles', dev.max_level != null ? `${dev.max_level}` : null],
    ['Unidades totales', dev.units_total || dev.total_units || (units.length || null)],
    ['Modelos / prototipos', protos || null],
    ['Créditos aceptados', Array.isArray(dev.creditos_aceptados) && dev.creditos_aceptados.length ? dev.creditos_aceptados.map((c) => titleCase(c)).join(' · ') : null],
    ['Dirección', dev.address_full || dev.street || null],
  ].filter(([, v]) => v != null && v !== '');
  if (!rows.length) return null;
  return (
    <Card style={{ padding: '6px 20px' }}>
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '13px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--card-border, var(--border))' : 'none' }}>
          <span style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-3)' }}>{k}</span>
          <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: 'var(--cream)', textAlign: 'right' }}>{v}</span>
        </div>
      ))}
    </Card>
  );
}

// ── helpers de layout ────────────────────────────────────────────────────────
const linkBtn = { background: 'transparent', border: 'none', padding: 0, color: 'var(--theme)', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
function Section({ id, title, sub, refEl, children, first }) {
  return (
    <section id={id} ref={refEl} style={{ scrollMarginTop: 120, paddingTop: first ? 0 : 34 }}>
      {title && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(22px,3vw,30px)', color: 'var(--cream)', letterSpacing: '-0.01em', margin: 0, lineHeight: 1.1 }}>{title}</h2>
          {sub && <div style={{ fontFamily: SANS, fontSize: 14, color: 'var(--cream-3)', marginTop: 5, maxWidth: '64ch' }}>{sub}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
function StatCell({ k, v }) {
  return (
    <div style={{ padding: '2px 0' }}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--cream)', marginTop: 2 }}>{v}</div>
    </div>
  );
}
function Loading({ msg }) {
  return <LightScope><PublicNav /><div style={{ padding: 120, textAlign: 'center', color: 'var(--cream-3)', fontFamily: SANS }}>{msg}</div></LightScope>;
}

// ════════════════════════════════ FICHA ════════════════════════════════
export default function FichaVenta({ user, onLogin }) {
  const { id } = useParams();
  const [dev, setDev] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [unit, setUnit] = useState(null);
  const [lens, setLens] = useState('invertir');
  const [invMode] = useState('individual');
  const [scans, setScans] = useState([]);
  const [activeScan, setActiveScan] = useState(null);
  const [similars, setSimilars] = useState([]);
  const [savedUnits, setSavedUnits] = useState(() => new Set());
  const [leadModal, setLeadModal] = useState(null);
  const [activeNav, setActiveNav] = useState('proyecto');

  const refs = {
    proyecto: useRef(null), destacados: useRef(null), precios: useRef(null), dinero: useRef(null), tour: useRef(null),
    amenidades: useRef(null), detalles: useRef(null), resenas: useRef(null), zona: useRef(null), confianza: useRef(null),
  };
  const scrollTo = useCallback((key) => { const el = refs[key] && refs[key].current; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [refs]);

  useEffect(() => {
    let alive = true; setLoadErr(false); setDev(null);
    fetchDevelopment(id).then((d) => { if (alive) setDev(d); }).catch(() => { if (alive) setLoadErr(true); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    let alive = true; const slug = dev.slug || dev.id;
    fetch(`${API}/api/tour-3dgs/scans?project_slug=${encodeURIComponent(slug)}&limit=20`).then((r) => r.json())
      .then((d) => { if (alive) { const items = d?.items || []; setScans(items); setActiveScan(items[0]?.scan_id || null); } })
      .catch(() => { if (alive) setScans([]); });
    return () => { alive = false; };
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    let alive = true;
    fetchDevelopments({ colonia: dev.colonia_id || dev.colonia, limit: 6 })
      .then((r) => { if (alive) setSimilars((Array.isArray(r) ? r : (r?.developments || [])).filter((x) => x.id !== dev.id).slice(0, 3)); }).catch(() => {});
    return () => { alive = false; };
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    try { sendBuyerSignal('ficha_view', { entity_id: dev.id, colonia: dev.colonia_id || dev.colonia, value: 'venta' }); } catch (e) { /* noop */ }
    const onScroll = () => { let cur = 'proyecto'; for (const [k] of NAV) { const el = refs[k] && refs[k].current; if (el && el.getBoundingClientRect().top <= 140) cur = k; } setActiveNav(cur); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const agendar = useCallback((reason) => setLeadModal({ reason: reason || 'agendar', unit: unit?.unit_number }), [unit]);
  const toggleSaveUnit = useCallback(() => {
    if (!unit) return;
    setSavedUnits((s) => { const n = new Set(s); n.has(unit.unit_number) ? n.delete(unit.unit_number) : n.add(unit.unit_number); return n; });
    try { sendBuyerSignal('save_unit', { entity_id: dev?.id, unit_number: unit.unit_number }); } catch (e) { /* noop */ }
  }, [unit, dev]);
  const pickUnit = useCallback((u) => { setUnit(u); if (u) setTimeout(() => scrollTo('dinero'), 60); }, [scrollTo]);

  // Atlax agéntico (reusa el ciclo dmx:atlax-action → navRef)
  const navRef = useRef(null);
  useEffect(() => {
    const onAction = (e) => {
      const nav = e && e.detail && e.detail.nav; const h = navRef.current; if (!nav || !h) return;
      if (nav === 'agendar') h.agendar();
      else if (nav === 'guardar') h.toggleSaveUnit();
      else if (nav === 'unidad' || nav === 'comparar') h.scrollTo('precios');
      else if (nav === 'dinero') h.scrollTo('dinero');
      else if (nav === 'confianza') h.scrollTo('confianza');
      else if (nav === 'proyecto') h.scrollTo('proyecto');
      else if (nav === 'tour') h.scrollTo('tour');
    };
    window.addEventListener('dmx:atlax-action', onAction);
    return () => window.removeEventListener('dmx:atlax-action', onAction);
  }, []);
  navRef.current = { scrollTo, agendar, toggleSaveUnit };

  const atlaxContext = useMemo(() => {
    if (!dev) return '';
    const p = [`Ficha de VENTA de "${dev.name}" en ${titleCase(dev.colonia || '')}, ${titleCase(dev.alcaldia || '')}. Sección: ${activeNav}.`];
    if (unit) p.push(`Ve la unidad ${unit.unit_number} (${money(unit.price)}).`);
    p.push(`Lente: ${lens === 'invertir' ? 'inversión' : 'vivir'}.`);
    return p.join(' ');
  }, [dev, unit, lens, activeNav]);
  const atlaxQuickActions = useMemo(() => ([
    { label: 'Ver modelos', nav: 'unidad' }, { label: 'Mis números', nav: 'dinero' },
    { label: 'Agendar visita', nav: 'agendar' }, { label: '¿Es confiable?', nav: 'confianza' },
  ]), []);

  if (loadErr) return <Loading msg="No pudimos cargar este desarrollo. Recarga la página." />;
  if (!dev) return <Loading msg="Cargando el desarrollo…" />;

  const nUnits = (dev.units || []).length || dev.units_total || dev.total_units || 0;
  const amen = Array.isArray(dev.amenities) ? dev.amenities : [];
  const developer = dev.developer || {};
  const seals = [
    developer.verified_constitution && 'Constitución verificada',
    developer.no_judicial_records && 'Sin antecedentes judiciales',
    developer.no_profeco_complaints && 'Sin quejas PROFECO',
    developer.projects_delivered && `${developer.projects_delivered} proyectos entregados`,
    developer.years_experience && `${developer.years_experience} años de experiencia`,
  ].filter(Boolean);
  const sideBtn = (grad) => ({ width: '100%', padding: '12px 14px', borderRadius: 12, border: grad ? 'none' : '1px solid var(--card-border, var(--border))', background: grad ? 'var(--grad)' : 'transparent', color: grad ? '#fff' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer', marginTop: 9, boxShadow: grad ? '0 10px 24px rgba(109,74,255,0.24)' : 'none' });

  return (
    <LightScope>
      <DevStructuredData dev={dev} />
      <PublicNav />
      <main style={{ paddingTop: 64 }}>

        {/* HERO GALERÍA + contadores de media */}
        <div style={{ maxWidth: 1320, width: '94%', margin: '0 auto', paddingTop: 16 }}>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cream-3)', marginBottom: 10 }}>
            <Link to="/marketplace" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>MARKETPLACE</Link>
            {' / '}{[dev.colonia, dev.alcaldia, 'CDMX'].filter(Boolean).map((s) => String(titleCase(s)).toUpperCase()).join(' · ')}
          </div>
          <PhotoGallery dev={dev} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
            {(dev.photos || []).length > 0 && <span style={mediaChip}>📷 {(dev.photos || []).length} fotos</span>}
            {scans.length > 0 && <button onClick={() => scrollTo('tour')} style={{ ...mediaChip, cursor: 'pointer' }}>🎦 {scans.length} recorrido{scans.length === 1 ? '' : 's'} 3D</button>}
            <ComplianceBadgeInline devId={dev.id} />
          </div>
        </div>

        {/* SUB-NAV pegajosa */}
        <div style={{ position: 'sticky', top: 56, zIndex: 30, background: 'var(--surface, #faf9f7)', borderBottom: '1px solid var(--card-border, var(--border))', backdropFilter: 'saturate(1.2) blur(6px)', marginTop: 20 }}>
          <div style={{ maxWidth: 1320, width: '94%', margin: '0 auto', display: 'flex', gap: 3, overflowX: 'auto', padding: '2px 0' }}>
            {NAV.filter(([k]) => (k !== 'tour' || scans.length > 0) && (k !== 'amenidades' || amen.length > 0)).map(([k, label]) => (
              <button key={k} onClick={() => scrollTo(k)} style={{ padding: '12px 14px', border: 'none', borderBottom: activeNav === k ? '2.5px solid var(--theme)' : '2.5px solid transparent', background: 'transparent', color: activeNav === k ? 'var(--theme)' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
            ))}
          </div>
        </div>

        {/* BODY */}
        <div className="dmx-venta-grid" style={{ maxWidth: 1320, width: '94%', margin: '0 auto', padding: '26px 0 90px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 34, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>

            <Section id="proyecto" refEl={refs.proyecto} first>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(30px,5vw,50px)', color: 'var(--cream)', letterSpacing: '-0.01em', margin: 0, lineHeight: 1.04 }}>{dev.name}</h1>
                {dev.verified && <span style={badgeV}>✓ Verificado</span>}
                <span style={badgeS}>{STAGE[dev.stage] || dev.stage}</span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 15, color: 'var(--cream-2)', marginTop: 6 }}>{dev.address_full || dev.street || [dev.colonia, dev.alcaldia].filter(Boolean).join(', ')}</div>
              <Card style={{ marginTop: 16, padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 18 }}>
                <div style={{ padding: '2px 0' }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Precio</div>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, color: 'var(--theme)', marginTop: 2 }}>{unit ? money(unit.price) : (dev.price_from_display || money(dev.price_from))}{!unit && dev.price_to ? ` – ${money(dev.price_to)}` : ''}</div>
                </div>
                {dev.bedrooms_range && <StatCell k="Recámaras" v={dev.bedrooms_range} />}
                {dev.bathrooms_range && <StatCell k="Baños" v={dev.bathrooms_range} />}
                {dev.m2_range && <StatCell k="m²" v={dev.m2_range} />}
                {dev.parking_range && <StatCell k="Estac." v={dev.parking_range} />}
                {nUnits > 0 && <StatCell k="Unidades" v={nUnits} />}
              </Card>
            </Section>

            <Section id="destacados" refEl={refs.destacados} title="Puntos destacados" sub="Lo esencial de este desarrollo de un vistazo.">
              <VentaDestacados dev={dev} />
              <div style={{ marginTop: 20 }}><SeccionLente dev={dev} lens={lens} /></div>
            </Section>

            <Section id="precios" refEl={refs.precios} title="Precios y modelos" sub="Cada modelo con su rango de precio y las unidades disponibles. Su posición vs el mercado (AVM) al lado. Elige una para ver tus números.">
              <VentaPrecios dev={dev} selectedUnit={unit} onSelectUnit={pickUnit} />
            </Section>

            <Section id="dinero" refEl={refs.dinero} title="Tu dinero" sub="Cómo pagas al desarrollador y qué rendimiento esperar. Calculado con datos reales, por unidad.">
              <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--surface-2, rgba(0,0,0,0.04))', borderRadius: 12, marginBottom: 16 }}>
                {[['invertir', 'Como inversión'], ['vivir', 'Para vivir']].map(([k, l]) => (
                  <button key={k} onClick={() => setLens(k)} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: lens === k ? 'var(--grad)' : 'transparent', color: lens === k ? '#fff' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>{l}</button>
                ))}
              </div>
              {!unit && <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)', fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>Elige una unidad arriba en <b>Precios y modelos</b> para ver tus números exactos.</div>}
              <div style={{ marginBottom: 22 }}><SeccionPanorama dev={dev} unit={unit} onSelectUnit={setUnit} /></div>
              <PlanDePago dev={dev} unit={unit} />
              {unit && (lens === 'invertir' ? (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', letterSpacing: '0.07em', marginBottom: 10, textTransform: 'uppercase' }}>Análisis de inversión</div>
                  <SeccionCalcInversion dev={dev} unit={unit} mode={invMode} onGoTo={scrollTo} />
                </div>
              ) : (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', letterSpacing: '0.07em', marginBottom: 10, textTransform: 'uppercase' }}>¿Rentar o comprar?</div>
                  <SeccionDinero dev={dev} unit={unit} intent="vivir" defaultTab="rentobuy" />
                </div>
              ))}
            </Section>

            {scans.length > 0 && activeScan && (
              <Section id="tour" refEl={refs.tour} title="Recorrido 3D" sub="Camina el departamento por dentro, como si estuvieras ahí.">
                {scans.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {scans.map((s) => (<button key={s.scan_id} onClick={() => setActiveScan(s.scan_id)} style={{ padding: '7px 13px', borderRadius: 9999, border: '1px solid var(--card-border, var(--border))', background: activeScan === s.scan_id ? 'var(--theme)' : 'transparent', color: activeScan === s.scan_id ? '#fff' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{s.unit_id || s.title || 'Modelo'}</button>))}
                  </div>
                )}
                <div style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid var(--card-border, var(--border))', height: 'clamp(360px,52vw,560px)' }}>
                  <Tour3DViewer scanId={activeScan} theme="cream" uiMode="full" />
                </div>
              </Section>
            )}

            {amen.length > 0 && (
              <Section id="amenidades" refEl={refs.amenidades} title="Amenidades" sub="Lo que trae el edificio y tu departamento.">
                <VentaAmenidades dev={dev} />
              </Section>
            )}

            <Section id="detalles" refEl={refs.detalles} title="Detalles" sub="Información de la propiedad.">
              <VentaDetalles dev={dev} />
            </Section>

            <Section id="zona" refEl={refs.zona} title="La zona" sub="Cómo se vive alrededor: caminabilidad, transporte, lugares.">
              <SeccionUbicacion dev={dev} />
            </Section>

            <Section id="resenas" refEl={refs.resenas} title="Reseñas" sub="Lo que dicen residentes y vecinos de la zona.">
              <VentaResenas devId={dev.id} />
            </Section>

            <Section id="confianza" refEl={refs.confianza} title="Confianza" sub="Riesgos reales del inmueble y quién lo construye — sin letra chica.">
              {seals.length > 0 && (
                <Card style={{ padding: '16px 20px', marginBottom: 18 }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>El desarrollador{developer.name ? ` · ${developer.name}` : ''}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {seals.map((s, i) => (<span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9999, background: 'rgba(31,160,106,0.08)', border: '1px solid rgba(31,160,106,0.28)', fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: '#1FA06A' }}>✓ {s}</span>))}
                  </div>
                </Card>
              )}
              <SeccionConfianza dev={dev} />
            </Section>

            {similars.length > 0 && (
              <Section id="similares" title="Desarrollos parecidos" sub="Otras opciones en la misma zona.">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
                  {similars.map((s) => (
                    <Link key={s.id} to={`/desarrollo/${s.id}?venta=1`} className="dmx-venta-simcard" style={{ textDecoration: 'none', display: 'block', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)' }}>
                      <div style={{ aspectRatio: '4/3', background: '#EDEEF1', overflow: 'hidden' }}>{(s.photos || [])[0] && <img src={s.photos[0]} alt={s.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{titleCase(s.name)}</div>
                        <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginTop: 2 }}>{titleCase(s.colonia || '')}</div>
                        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: 'var(--theme)', marginTop: 6 }}>Desde {money(s.price_from)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* COLUMNA STICKY DE CONTACTO */}
          <aside className="dmx-venta-side" style={{ position: 'sticky', top: 130 }}>
            <Card style={{ padding: '20px 20px' }}>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>Comunícate con esta propiedad</div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)', margin: '3px 0 12px' }}>Opciones de visita: <b>presencial o por video</b></div>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{unit ? `Unidad ${unit.unit_number}` : 'Desde'}</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 28, color: 'var(--cream)', margin: '2px 0 2px' }}>{money(unit ? unit.price : dev.price_from)}</div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 6 }}>{STAGE[dev.stage] || dev.stage}{dev.delivery_estimate ? ` · entrega ${dev.delivery_estimate}` : ''}</div>
              <button onClick={() => agendar('agendar')} style={sideBtn(true)}>Agendar visita</button>
              <button onClick={() => agendar('mensaje')} style={sideBtn(false)}>Enviar mensaje</button>
              {unit && <button onClick={toggleSaveUnit} style={sideBtn(false)}>{savedUnits.has(unit.unit_number) ? '♥ Guardada' : `Guardar la ${unit.unit_number}`}</button>}
              <div style={{ borderTop: '1px solid var(--card-border, var(--border))', margin: '14px 0 0', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9999, background: 'var(--grad)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 13 }}>{(developer.name || dev.name || 'D')[0]}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: 'var(--cream)' }}>{developer.name || 'Tu asesor DMX'}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>Responde en el día · español</div>
                </div>
              </div>
              <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', textAlign: 'center' }}>✨ ¿Dudas? Pregúntale a <b style={{ color: 'var(--theme)' }}>Atlax</b> — sabe de esta unidad.</div>
            </Card>
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>Datos reales, sin presión. Tu asesor recibe exactamente lo que ves aquí.</div>
          </aside>
        </div>
      </main>

      <div className="dmx-venta-mobilebar" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 55, display: 'none', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--surface, #fff)', borderTop: '1px solid var(--card-border, var(--border))', boxShadow: '0 -6px 20px rgba(16,18,28,0.10)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: 'var(--cream)' }}>{money(unit ? unit.price : dev.price_from)}</div>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>{unit ? `Unidad ${unit.unit_number}` : (STAGE[dev.stage] || dev.stage)}</div>
        </div>
        <button onClick={() => agendar('agendar')} style={{ padding: '11px 20px', borderRadius: 12, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>Agendar visita</button>
      </div>

      <style>{`
        @media (max-width: 940px){ .dmx-venta-grid{ grid-template-columns: minmax(0,1fr) !important; } .dmx-venta-side{ position: static !important; } .dmx-venta-mobilebar{ display: flex !important; } }
        .dmx-venta-simcard{ transition: transform .16s ease, box-shadow .16s ease; }
        .dmx-venta-simcard:hover{ transform: translateY(-2px); box-shadow: 0 12px 26px rgba(16,18,28,0.10); }
      `}</style>

      <AtlaxBubble theme="light" context={atlaxContext} quickActions={atlaxQuickActions} dev={dev} unit={unit} lens={lens} />

      {leadModal && (() => {
        const wu = leadModal.unit;
        const leadUnit = wu ? ((dev.units || []).find((u) => u.unit_number === wu) || { unit_number: wu }) : unit;
        return <LeadCaptureModal dev={dev} unit={leadUnit} reason={leadModal.reason} onClose={() => setLeadModal(null)} />;
      })()}
    </LightScope>
  );
}

const mediaChip = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 9999, background: 'var(--surface-card, rgba(0,0,0,0.03))', border: '1px solid var(--card-border, var(--border))', color: 'var(--cream-2)', fontFamily: SANS, fontSize: 12.5, fontWeight: 600 };
const badgeV = { padding: '4px 11px', borderRadius: 9999, background: 'rgba(31,160,106,0.10)', border: '1px solid rgba(31,160,106,0.32)', color: '#1FA06A', fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' };
const badgeS = { padding: '4px 11px', borderRadius: 9999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)', color: 'var(--theme)', fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' };

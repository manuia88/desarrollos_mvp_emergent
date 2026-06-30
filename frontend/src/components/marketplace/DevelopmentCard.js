// DevelopmentCard — compact marketplace card (EasyBroker-inspired composition)
// Height target ~480px desktop, 4-col grid friendly
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MapPin, Bed, Bath, Car, Ruler, Heart, Share, ChevronLeft, ChevronRight, Sparkle } from '../icons';
import { isFavorite, toggleFavorite } from '../../api/marketplace';
import { sendBuyerSignal } from '../../lib/buyerSignal';
import { ComplianceBadgeOverlay } from './ComplianceBadge';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

// Stage → header band + text color
// Color sólido por etapa (para el tag sutil sobre la foto · texto de color, no pill saturado).
// Color por TIEMPO de entrega — cada plazo su color, visible (fondo sólido + texto blanco)
const deliveryColorOf = (stage, bucket) => {
  if (stage === 'entrega_inmediata') return '#2563EB';   // listo ya
  if (stage === 'exclusiva') return '#7C3AED';
  if (stage === 'en_construccion') return '#D97706';
  return { '<3 meses': '#0E9F6E', '3-6 meses': '#0891B2', '6-12 meses': '#D97706', '+12 meses': '#E11D48' }[bucket] || '#0E9F6E';
};
const AMEN_LABEL = { gym: 'Gimnasio', seguridad: 'Seguridad 24/7', pet: 'Pet friendly', roof: 'Roof garden', cowork: 'Coworking', alberca: 'Alberca', salon_eventos: 'Salón de eventos', bicicletas: 'Biciestac.', spa: 'Spa', concierge: 'Concierge', business_center: 'Business center', jardines: 'Jardines', estacionamiento: 'Estac.', sky_lounge: 'Sky lounge', cava: 'Cava', area_pets: 'Área pets' };

// Temporalidad de la preventa (mismos buckets que el filtro de plazo) desde delivery_estimate "YYYY-MM".
function entregaBucket(est) {
  const m = String(est || '').match(/(\d{4})-(\d{1,2})/);
  if (!m) return null;
  const now = new Date();
  const months = (+m[1] - now.getFullYear()) * 12 + (+m[2] - 1 - now.getMonth());
  if (months <= 0) return null;   // si ya se entrega, es ENTREGA INMEDIATA (no preventa) — no bucket contradictorio
  if (months <= 3) return '<3 meses';
  if (months <= 6) return '3-6 meses';
  if (months <= 12) return '6-12 meses';
  return '+12 meses';
}

function Fallback({ hue = 231, seed = 0 }) {
  return (
    <svg viewBox="0 0 400 240" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`fb-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue}, 70%, 20%)`} />
          <stop offset="100%" stopColor="#0A0D16" />
        </linearGradient>
      </defs>
      <rect width={400} height={240} fill={`url(#fb-${seed})`} />
      <rect x={70} y={50} width={260} height={170} fill={`hsl(${hue}, 45%, 12%)`} />
      {[0,1,2,3,4,5].map(row => [0,1,2,3,4].map(col => (
        <rect key={`${row}${col}`} x={90 + col*50} y={65 + row*28} width={26} height={16}
          fill={((row*5+col+seed) % 3) > 0 ? `hsla(${hue},70%,65%,0.45)` : 'rgba(var(--cream-rgb),0.04)'} rx={2} />
      )))}
    </svg>
  );
}

function IERankPill({ rank }) {
  const [hover, setHover] = useState(false);
  const t = rank.badge_tier;
  const tone = t === 'top'
    ? { bg: 'linear-gradient(92deg, #06080F 0%, var(--theme) 50%, var(--theme-3) 100%)', fg: '#fff', border: 'rgba(var(--theme-rgb),0.55)', label: `1º en ${rank.colonia}` }
    : t === 'high'
    ? { bg: 'rgba(34,197,94,0.18)', fg: '#86efac', border: 'rgba(34,197,94,0.45)', label: `Top 30% en ${rank.colonia}` }
    : null;
  if (!tone) return null;
  return (
    <div
      data-testid={`ie-rank-pill-${rank.badge_tier}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute', left: 12, bottom: 12, zIndex: Z.BASE,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 9999,
        background: tone.bg, color: tone.fg,
        border: `1px solid ${tone.border}`,
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        boxShadow: t === 'top' ? '0 4px 18px rgba(var(--theme-rgb),0.42)' : '0 2px 10px rgba(0,0,0,0.35)',
        transition: 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 380ms',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        pointerEvents: 'auto',
      }}
    >
      <Sparkle size={10} color={tone.fg} />
      <span>{tone.label}</span>
      {hover && (
        <span style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          padding: '6px 10px', borderRadius: 10,
          background: 'rgba(var(--bg-rgb),0.95)',
          border: '1px solid rgba(var(--cream-rgb),0.14)',
          color: 'var(--cream-2)',
          fontFamily: 'DM Sans', fontWeight: 500, fontSize: 10.5,
          letterSpacing: '0.02em', textTransform: 'none',
          whiteSpace: 'nowrap', zIndex: Z.BASE,
        }}>
          Según su análisis de inversión vs la zona · click para ver detalles
        </span>
      )}
    </div>
  );
}

export default function DevelopmentCard({ dev, index = 0 }) {
  const { t } = useTranslation();
  const [slide, setSlide] = useState(0);
  const [saved, setSaved] = useState(() => isFavorite(dev.id));
  const [imgError, setImgError] = useState({});
  const [rank, setRank] = useState(null);
  // Cross-Portal v2 · la foto de portada REAL del dev viene en el listado (batch · sin fetch por
  // tarjeta = ruta caliente). Si la subió, va primero; el resto del carrusel usa las del seed.
  const seedPhotos = dev.photos || [];
  const photos = dev.hero_photo ? [`${API}${dev.hero_photo}`, ...seedPhotos] : seedPhotos;
  const hue = dev.developer?.logo_hue || 231;

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/developments/${dev.id}/rank`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d) setRank(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [dev.id]);

  const onToggleFav = (e) => {
    e.preventDefault(); e.stopPropagation();
    const ns = toggleFavorite(dev.id);
    setSaved(ns);
    // Señal de DOS caras: afina el gusto del comprador + le dice al dev que su desarrollo interesa.
    sendBuyerSignal(ns ? 'like' : 'unlike', { entity_id: dev.id, colonia: dev.colonia });
  };
  const onShare = (e) => {
    e.preventDefault(); e.stopPropagation();
    sendBuyerSignal('share', { entity_id: dev.id, colonia: dev.colonia });
    if (navigator.share) {
      navigator.share({ title: dev.name, url: `${window.location.origin}/desarrollo/${dev.id}` }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(`${window.location.origin}/desarrollo/${dev.id}`).catch(() => {});
    }
  };
  const prev = (e) => { e.preventDefault(); e.stopPropagation(); setSlide(s => (s - 1 + photos.length) % photos.length); };
  const next = (e) => { e.preventDefault(); e.stopPropagation(); setSlide(s => (s + 1) % photos.length); };

  const showFallback = photos.length === 0 || imgError[slide];
  // Specs: el MÍNIMO de cada característica (con prefijo "desde"). m² mantiene unidad.
  const mn = (r) => (r && r[0] != null ? r[0] : null);
  const specs = [
    { Icon: Bed, v: mn(dev.bedrooms_range), unit: 'rec' },
    { Icon: Bath, v: mn(dev.bathrooms_range), unit: 'baños' },
    { Icon: Car, v: mn(dev.parking_range), unit: 'autos' },
    { Icon: Ruler, v: mn(dev.m2_range), unit: 'm²' },
  ].filter(s => s.v != null);
  // Semáforo de precio vs la zona, con FLECHA: ↓ verde (bajo · buena compra) · ≈ amarillo (promedio) · ↑ rojo (caro).
  const vz = typeof dev.precio_vs_zona_pct === 'number' ? dev.precio_vs_zona_pct : null;
  const vzText = vz == null ? null
    : vz <= -5 ? { t: `${Math.abs(vz)}% bajo la zona`, c: '#0E9F6E', arrow: '↓' }
    : vz < 8 ? { t: 'precio promedio de la zona', c: '#B8860B', arrow: '≈' }
    : { t: `${vz}% sobre la zona`, c: '#DC2626', arrow: '↑' };

  return (
    <Link
      to={`/desarrollo/${dev.id}${rank?.badge_tier ? '#ie-scores' : ''}`}
      className="dmx-card"
      data-testid={`dev-card-${dev.id}`}
      style={{
        display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit',
        background: '#fff', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 6px 22px rgba(16,18,28,0.07), 0 1px 3px rgba(16,18,28,0.05)',
        height: '100%',   // llena la celda del grid → tarjetas de la misma fila quedan del mismo alto (simétricas)
      }}
    >
      {/* ── FOTO (xproperty: precio sobre la imagen) ── */}
      <div className="mkt-photo" style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden', background: '#EEF0F4' }}>
        {/* Velo degradado inferior — da profundidad y asienta los badges sin recuadros negros */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'linear-gradient(to top, rgba(16,18,28,0.34) 0%, rgba(16,18,28,0.04) 28%, transparent 50%)' }} />
        {showFallback ? (
          <Fallback hue={hue} seed={index} />
        ) : (
          <img src={photos[slide]} alt={dev.name}
            onError={() => setImgError(e => ({ ...e, [slide]: true }))}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}

        {/* Etapa — fondo de color sólido por tiempo de entrega + texto blanco (alto contraste, no se pierde) */}
        {(() => {
          const bucket = dev.stage === 'preventa' ? entregaBucket(dev.delivery_estimate) : null;
          return (
            <div style={{
              position: 'absolute', top: 12, left: 12, zIndex: Z.BASE,
              background: deliveryColorOf(dev.stage, bucket), borderRadius: 8, padding: '4px 10px',
              color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
              boxShadow: '0 2px 10px rgba(16,18,28,0.28)',
            }}>
              {t(`marketplace_v2.stage.${dev.stage}`)}
              {bucket && <span style={{ opacity: 0.9, fontWeight: 700 }}> · {bucket}</span>}
            </div>
          );
        })()}

        {/* Compliance + rank (overlays sutiles existentes) */}
        <ComplianceBadgeOverlay devId={dev.id} />
        {rank?.badge_tier && <IERankPill rank={rank} />}

        {/* Share / Favorito — esquina superior derecha */}
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 7, zIndex: Z.BASE }}>
          <button onClick={onShare} data-testid={`share-btn-${dev.id}`} className="btn-icon-circle"><Share size={13} /></button>
          <button onClick={onToggleFav} data-testid={`fav-btn-${dev.id}`} className="btn-icon-circle"><Heart size={13} filled={saved} /></button>
        </div>

        {/* Carrusel */}
        {photos.length > 1 && (
          <>
            <button onClick={prev} className="btn-icon-circle carousel-arrow" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><ChevronLeft size={12} /></button>
            <button onClick={next} className="btn-icon-circle carousel-arrow" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}><ChevronRight size={12} /></button>
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
              {photos.slice(0, Math.min(photos.length, 5)).map((_, i) => (
                <div key={i} style={{ width: i === slide ? 16 : 5, height: 5, borderRadius: 9999, background: i === slide ? '#fff' : 'rgba(255,255,255,0.55)', transition: 'width 0.2s' }} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── CUERPO · ritmo UNIFORME (gap), agrupado, con aire — jerarquía: identidad → precio → specs → señales ── */}
      <div style={{ padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>

        {/* Identidad — nombre + ubicación (lidera la tarjeta) */}
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: 'var(--cream)', lineHeight: 1.2, letterSpacing: '-0.025em' }}>
            {dev.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
            <MapPin size={12} color="var(--cream-3)" />
            <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>{dev.street} · {dev.colonia}</span>
          </div>
        </div>

        {/* Precio + $/m² ALINEADO debajo (izquierda) + semáforo con flecha */}
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', letterSpacing: '-0.03em', lineHeight: 1 }}>
            {dev.price_from_display}
            <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 500, color: 'var(--cream-3)', letterSpacing: 0, marginLeft: 6 }}>desde</span>
          </div>
          {dev.price_m2_dev && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--cream-2)' }}>${Math.round(dev.price_m2_dev).toLocaleString('es-MX')}/m²</span>
              {vzText && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans', fontSize: 11.5, color: vzText.c, fontWeight: 700, background: `${vzText.c}14`, borderRadius: 9999, padding: '2px 9px' }} title="Precio por m² vs el promedio de su colonia">
                  <span style={{ fontSize: 13, lineHeight: 1 }}>{vzText.arrow}</span> {vzText.t}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Specs — "desde" ARRIBA, los elementos (icono + mínimo) ABAJO */}
        {specs.length > 0 && (
          <div style={{ padding: '2px 0' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--cream-3)', marginBottom: 4 }}>desde</div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {specs.map((s, i) => (
                <React.Fragment key={s.unit}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} title={s.unit}>
                    <s.Icon size={16} color="var(--theme)" />
                    <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>
                      {s.v}{s.unit === 'm²' ? <span style={{ color: 'var(--cream-3)', fontWeight: 500, fontSize: 11 }}> m²</span> : ''}
                    </span>
                  </div>
                  {i < specs.length - 1 && <div style={{ width: 1, height: 20, background: 'var(--border)' }} />}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Unidades que cumplen lo que pediste (solo al buscar) */}
        {dev.units_match > 0 && (
          <div data-testid={`units-match-${dev.id}`}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
              color: '#1FA06A', background: 'rgba(31,160,106,0.10)',
              border: '1px solid rgba(31,160,106,0.26)', borderRadius: 999, padding: '4px 10px',
            }} title="Unidades disponibles en la lista de precios que cumplen tu búsqueda">
              ✓ {dev.units_match} {dev.units_match === 1 ? 'unidad disponible que cumple' : 'unidades disponibles que cumplen'}
            </span>
            {(dev.units_match_sample || []).length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dev.units_match_sample.slice(0, 3).map((u) => (
                  <div key={u.unit_number} style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span><b style={{ color: 'var(--cream)' }}>#{u.unit_number}</b> · {u.bedrooms} rec · {u.m2_total}m²{u.orientation ? ` · ${u.orientation}` : ''}</span>
                      <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{u.price_display}</span>
                    </div>
                    {u.enganche > 0 && (
                      <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 1 }}>
                        enganche ${Math.round(u.enganche).toLocaleString('es-MX')}{u.mensualidad > 0 ? ` · $${Math.round(u.mensualidad).toLocaleString('es-MX')}/mes` : ''}
                      </div>
                    )}
                  </div>
                ))}
                {dev.units_match > 3 && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>+{dev.units_match - 3} más</div>}
              </div>
            )}
          </div>
        )}

        {/* Señales — incremento del PROYECTO desde el lanzamiento (la plusvalía de zona vive en el menú) + amenidades */}
        {(dev.incremento_preventa_pct || dev.amenidades_count > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {dev.incremento_preventa_pct && (
              <span className="tip" style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
                color: '#B45309', background: 'rgba(217,119,6,0.10)',
                border: '1px solid rgba(217,119,6,0.26)', borderRadius: 999, padding: '4px 10px',
              }}>
                ↑ {dev.incremento_preventa_pct}% desde el lanzamiento
                <span className="tip-q">?</span>
                <span className="tip-box">El desarrollador ha subido su precio {dev.incremento_preventa_pct}% desde que abrió la preventa: de su precio de lista inicial (lanzamiento) al de hoy. Es decisión del dev, no plusvalía del mercado.</span>
              </span>
            )}
            {Array.isArray(dev.amenities) && dev.amenities.length > 0 && (
              <span className="tip" data-testid="card-amenidades" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5, color: 'var(--cream-2)',
                background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 999, padding: '4px 10px',
              }}>
                {dev.amenities.length} amenidades
                <span className="tip-q" style={{ color: '#6366F1' }}>?</span>
                <span className="tip-box">{dev.amenities.map((a) => AMEN_LABEL[a] || a).join(' · ')}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── PIE: desarrollador + probabilidad (separado con borde + aire) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '11px 18px', marginTop: 11, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 7, flexShrink: 0,
            background: `linear-gradient(135deg, hsl(${hue},70%,52%), hsl(${(hue + 40) % 360},70%,42%))`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 11, color: '#fff',
          }}>{dev.developer?.name?.[0] || 'D'}</div>
          <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5, color: 'var(--cream-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {dev.developer?.name}
          </span>
        </div>
        <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: 'var(--theme)', whiteSpace: 'nowrap' }}>Ver detalles →</span>
      </div>
    </Link>
  );
}

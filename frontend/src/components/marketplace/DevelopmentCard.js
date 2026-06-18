// DevelopmentCard — compact marketplace card (EasyBroker-inspired composition)
// Height target ~480px desktop, 4-col grid friendly
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MapPin, Bed, Bath, Car, Ruler, Heart, Share, ChevronLeft, ChevronRight, Sparkle } from '../icons';
import { isFavorite, toggleFavorite } from '../../api/marketplace';
import { sendBuyerSignal } from '../../lib/buyerSignal';
import { ComplianceBadgeOverlay } from './ComplianceBadge';
import ProbabilityBadge from '../shared/ProbabilityBadge';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

// Stage → header band + text color
const STAGE_COLORS = {
  preventa: { bg: 'linear-gradient(90deg, rgba(16,185,129,0.85), rgba(34,197,94,0.85))', glow: 'rgba(16,185,129,0.45)' },
  en_construccion: { bg: 'linear-gradient(90deg, rgba(245,158,11,0.85), rgba(249,115,22,0.85))', glow: 'rgba(245,158,11,0.45)' },
  entrega_inmediata: { bg: 'linear-gradient(90deg, rgba(59,130,246,0.85), rgba(14,165,233,0.85))', glow: 'rgba(59,130,246,0.45)' },
  exclusiva: { bg: 'linear-gradient(90deg, rgba(139,92,246,0.85), rgba(var(--theme-rgb),0.85))', glow: 'rgba(139,92,246,0.45)' },
};

// Color sólido por etapa (para el tag sutil sobre la foto · texto de color, no pill saturado).
const STAGE_SOLID = { preventa: '#0E9F6E', en_construccion: '#D97706', entrega_inmediata: '#2563EB', exclusiva: '#7C3AED' };
const stageColorOf = (s) => STAGE_SOLID[s] || '#7C3AED';

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
          Basado en IE Score · click para ver detalles
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
  const stageCfg = STAGE_COLORS[dev.stage] || STAGE_COLORS.preventa;

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
  // Specs (xproperty: fila horizontal con iconos + divisores) — rango a-b o valor único.
  const rng = (r) => !r ? null : (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);
  const specs = [
    { Icon: Bed, v: rng(dev.bedrooms_range), unit: 'rec' },
    { Icon: Bath, v: rng(dev.bathrooms_range), unit: 'baños' },
    { Icon: Car, v: rng(dev.parking_range), unit: 'autos' },
    { Icon: Ruler, v: rng(dev.m2_range), unit: 'm²' },
  ].filter(s => s.v != null);
  // Precio vs promedio de la zona, en lenguaje humano (antes "+38% vs zona" no se entendía).
  const vz = typeof dev.precio_vs_zona_pct === 'number' ? dev.precio_vs_zona_pct : null;
  const vzText = vz == null ? null
    : vz <= -8 ? { t: `${Math.abs(vz)}% bajo la zona`, c: '#1FA06A' }
    : vz < 12 ? { t: 'En precio de zona', c: 'var(--cream-3)' }
    : { t: `${vz}% sobre la zona`, c: 'var(--cream-3)' };

  return (
    <Link
      to={`/desarrollo/${dev.id}${rank?.badge_tier ? '#ie-scores' : ''}`}
      className="dmx-card"
      data-testid={`dev-card-${dev.id}`}
      style={{
        display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit',
        background: '#fff', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(16,18,28,0.05)',
      }}
    >
      {/* ── FOTO (xproperty: precio sobre la imagen) ── */}
      <div style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden', background: '#EEF0F4' }}>
        {showFallback ? (
          <Fallback hue={hue} seed={index} />
        ) : (
          <img src={photos[slide]} alt={dev.name}
            onError={() => setImgError(e => ({ ...e, [slide]: true }))}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}

        {/* Etapa — tag sutil (sin saturar la imagen: blanco translúcido + texto de color) */}
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: Z.BASE,
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          color: stageColorOf(dev.stage), borderRadius: 8, padding: '4px 10px',
          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase',
        }}>
          {t(`marketplace_v2.stage.${dev.stage}`)}
        </div>

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

      {/* ── PRECIO (limpio, abajo de la foto · no sobre fondo negro) ── */}
      <div style={{ padding: '16px 18px 0', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 23, color: 'var(--cream)', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {dev.price_from_display}
          <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 500, color: 'var(--cream-3)', letterSpacing: 0, marginLeft: 5 }}>desde</span>
        </div>
        {dev.price_m2_dev && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--cream-2)' }}>${Math.round(dev.price_m2_dev / 1000)}k/m²</span>
            {vzText && <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: vzText.c, fontWeight: vzText.c === '#1FA06A' ? 700 : 500 }} title="Precio por m² vs el promedio de su colonia">{vzText.t}</span>}
          </div>
        )}
      </div>

      {/* ── FILA DE SPECS (xproperty: iconos + divisores) ── */}
      {specs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px 0' }}>
          {specs.map((s, i) => (
            <React.Fragment key={s.unit}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <s.Icon size={15} color="var(--theme)" />
                <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream)' }}>
                  {s.v} <span style={{ color: 'var(--cream-3)', fontWeight: 500, fontSize: 11.5 }}>{s.unit}</span>
                </span>
              </div>
              {i < specs.length - 1 && <div style={{ width: 1, height: 22, background: 'var(--border)' }} />}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── TÍTULO + UBICACIÓN ── */}
      <div style={{ padding: '14px 18px 0' }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: 'var(--cream)', lineHeight: 1.18, letterSpacing: '-0.025em' }}>
          {dev.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
          <MapPin size={12} color="var(--cream-3)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>{dev.street} · {dev.colonia}</span>
        </div>
      </div>

      {/* ── UNIDADES que cumplen lo que pediste (match por unidad REAL disponible + nombradas) ── */}
      {dev.units_match > 0 && (
        <div style={{ padding: '12px 18px 0' }} data-testid={`units-match-${dev.id}`}>
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
                <div key={u.unit_number} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>
                  <span><b style={{ color: 'var(--cream)' }}>#{u.unit_number}</b> · {u.bedrooms} rec · {u.m2_total}m²{u.orientation ? ` · ${u.orientation}` : ''}</span>
                  <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{u.price_display}</span>
                </div>
              ))}
              {dev.units_match > 3 && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>+{dev.units_match - 3} más</div>}
            </div>
          )}
        </div>
      )}

      {/* ── PLUSVALÍA de la zona (señal de inversión · separada del precio) ── */}
      {dev.plusvalia_zona && (
        <div style={{ padding: '12px 18px 0' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
            color: 'var(--ok, #1FA06A)', background: 'rgba(31,160,106,0.10)',
            border: '1px solid rgba(31,160,106,0.26)', borderRadius: 999, padding: '4px 10px',
          }} title="Plusvalía reciente de la colonia (cuánto ha subido la zona)">
            ↗ Plusvalía {dev.plusvalia_zona}{typeof dev.forecast_12m_pct === 'number' ? ` · 12m +${dev.forecast_12m_pct}%` : ''}
          </span>
        </div>
      )}

      {dev.amenidades_count > 0 && (
        <div data-testid="card-amenidades" style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', padding: '10px 18px 0' }}>
          <span style={{ fontWeight: 700, color: 'var(--cream-2)' }}>{dev.amenidades_count} amenidades</span>
          {(dev.servicios_top || []).length > 0 && <span>· {(dev.servicios_top || []).slice(0, 2).map(s => String(s).replace(/_/g, ' ')).join(' · ')}</span>}
        </div>
      )}

      {/* ── PIE: desarrollador + ver detalles + probabilidad ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 18px', marginTop: 14, borderTop: '1px solid var(--border)' }}>
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
        <ProbabilityBadge type="sells_complete" entity_id={dev.id} params={{ months: 12 }} format="compact" />
      </div>
    </Link>
  );
}

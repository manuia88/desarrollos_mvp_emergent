// DevelopmentCard — compact marketplace card (EasyBroker-inspired composition)
// Height target ~480px desktop, 4-col grid friendly
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MapPin, Bed, Bath, Car, Ruler, Heart, Share, ChevronLeft, ChevronRight, Sparkle } from '../icons';
import { isFavorite, toggleFavorite } from '../../api/marketplace';
import { ComplianceBadgeOverlay } from './ComplianceBadge';

const API = process.env.REACT_APP_BACKEND_URL;

// Stage → header band + text color
const STAGE_COLORS = {
  preventa: { bg: 'linear-gradient(90deg, rgba(16,185,129,0.85), rgba(34,197,94,0.85))', glow: 'rgba(16,185,129,0.45)' },
  en_construccion: { bg: 'linear-gradient(90deg, rgba(245,158,11,0.85), rgba(249,115,22,0.85))', glow: 'rgba(245,158,11,0.45)' },
  entrega_inmediata: { bg: 'linear-gradient(90deg, rgba(59,130,246,0.85), rgba(14,165,233,0.85))', glow: 'rgba(59,130,246,0.45)' },
  exclusiva: { bg: 'linear-gradient(90deg, rgba(139,92,246,0.85), rgba(236,72,153,0.85))', glow: 'rgba(139,92,246,0.45)' },
};

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
          fill={((row*5+col+seed) % 3) > 0 ? `hsla(${hue},70%,65%,0.45)` : 'rgba(255,255,255,0.04)'} rx={2} />
      )))}
    </svg>
  );
}

function IERankPill({ rank }) {
  const [hover, setHover] = useState(false);
  const t = rank.badge_tier;
  const tone = t === 'top'
    ? { bg: 'linear-gradient(92deg, #06080F 0%, #6366F1 50%, #EC4899 100%)', fg: '#fff', border: 'rgba(236,72,153,0.55)', label: `1º en ${rank.colonia}` }
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
        position: 'absolute', left: 12, bottom: 12, zIndex: 3,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 9999,
        background: tone.bg, color: tone.fg,
        border: `1px solid ${tone.border}`,
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        boxShadow: t === 'top' ? '0 4px 18px rgba(99,102,241,0.42)' : '0 2px 10px rgba(0,0,0,0.35)',
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
          background: 'rgba(6,8,15,0.95)',
          border: '1px solid rgba(240,235,224,0.14)',
          color: 'var(--cream-2)',
          fontFamily: 'DM Sans', fontWeight: 500, fontSize: 10.5,
          letterSpacing: '0.02em', textTransform: 'none',
          whiteSpace: 'nowrap', zIndex: 4,
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
  const photos = dev.photos || [];
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
    setSaved(toggleFavorite(dev.id));
  };
  const onShare = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (navigator.share) {
      navigator.share({ title: dev.name, url: `${window.location.origin}/desarrollo/${dev.id}` }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(`${window.location.origin}/desarrollo/${dev.id}`).catch(() => {});
    }
  };
  const prev = (e) => { e.preventDefault(); e.stopPropagation(); setSlide(s => (s - 1 + photos.length) % photos.length); };
  const next = (e) => { e.preventDefault(); e.stopPropagation(); setSlide(s => (s + 1) % photos.length); };

  const showFallback = photos.length === 0 || imgError[slide];

  return (
    <Link
      to={`/desarrollo/${dev.id}${rank?.badge_tier ? '#ie-scores' : ''}`}
      className="card"
      data-testid={`dev-card-${dev.id}`}
      style={{
        display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit',
        height: 480, overflow: 'hidden',
      }}
    >
      {/* Stage header band */}
      <div style={{
        height: 28,
        background: stageCfg.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: '#fff',
        boxShadow: `0 1px 0 ${stageCfg.glow}`,
      }}>
        {t(`marketplace_v2.stage.${dev.stage}`)}
      </div>

      {/* Photo area */}
      <div style={{ position: 'relative', height: 198, overflow: 'hidden', background: '#0A0D16' }}>
        {/* IE rank badge (Phase B3 chunk 1-bis) — bottom-left overlay */}
        {rank?.badge_tier && <IERankPill rank={rank} />}
        {/* Compliance badge (Phase 7.4) — top-right overlay */}
        <ComplianceBadgeOverlay devId={dev.id} />
        {showFallback ? (
          <Fallback hue={hue} seed={index} />
        ) : (
          <img
            src={photos[slide]}
            alt={dev.name}
            onError={() => setImgError(e => ({ ...e, [slide]: true }))}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}

        {/* Top overlays */}
        <button onClick={onShare} data-testid={`share-btn-${dev.id}`} className="btn-icon-circle"
          style={{ position: 'absolute', top: 10, left: 10 }}>
          <Share size={13} />
        </button>
        <button onClick={onToggleFav} data-testid={`fav-btn-${dev.id}`} className="btn-icon-circle"
          style={{ position: 'absolute', top: 10, right: 10 }}>
          <Heart size={13} filled={saved} />
        </button>

        {/* Carousel nav */}
        {photos.length > 1 && (
          <>
            <button onClick={prev} className="btn-icon-circle carousel-arrow"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <ChevronLeft size={12} />
            </button>
            <button onClick={next} className="btn-icon-circle carousel-arrow"
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <ChevronRight size={12} />
            </button>
          </>
        )}
        {photos.length > 1 && (
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
            {photos.slice(0, Math.min(photos.length, 5)).map((_, i) => (
              <div key={i} style={{
                width: i === slide ? 14 : 5, height: 5, borderRadius: 9999,
                background: i === slide ? '#fff' : 'rgba(255,255,255,0.3)',
                transition: 'width 0.2s',
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--cream-3)' }}>
          <MapPin size={11} color="var(--cream-3)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
            {dev.street} · {dev.colonia}
          </span>
        </div>

        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
          color: 'var(--cream)', lineHeight: 1.15, letterSpacing: '-0.025em',
        }}>
          {dev.name}
        </div>

        <div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>
            {t('marketplace_v2.card_from')}
          </div>
          <div style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
            color: 'var(--cream)', lineHeight: 1.1, letterSpacing: '-0.028em',
          }}>
            {dev.price_from_display} <span style={{ fontSize: 12, color: 'var(--cream-3)', fontWeight: 500, letterSpacing: 0 }}>MXN</span>
          </div>
        </div>

        {/* Meta row — icons large, text cream (not cream-3) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 2 }}>
          {[
            { Icon: Bed, a: dev.bedrooms_range?.[0], b: dev.bedrooms_range?.[1], unit: 'rec' },
            { Icon: Bath, a: dev.bathrooms_range?.[0], b: dev.bathrooms_range?.[1], unit: 'baños' },
            { Icon: Car, a: dev.parking_range?.[0], b: dev.parking_range?.[1], unit: 'cajón' },
            { Icon: Ruler, a: dev.m2_range?.[0], b: dev.m2_range?.[1], unit: 'm²' },
          ].map(({ Icon, a, b, unit }, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '8px 4px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}>
              <Icon size={13} color="var(--indigo-3)" />
              <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: 'var(--cream)' }}>
                {a === b ? a : `${a}-${b}`}
              </span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', letterSpacing: '0.05em' }}>
                {unit}
              </span>
            </div>
          ))}
        </div>

        {/* Footer: developer */}
        <div style={{
          marginTop: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 10, borderTop: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              background: `linear-gradient(135deg, hsl(${hue},70%,52%), hsl(${(hue + 40) % 360},70%,42%))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 10, color: '#fff',
            }}>
              {dev.developer?.name?.[0] || 'D'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, color: 'var(--cream-2)' }}>
                {dev.developer?.name}
              </span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)' }}>
                {t('marketplace_v2.card_developer_since', { year: dev.developer?.founded_year })} · {t('marketplace_v2.card_units_available', { n: dev.units_available })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

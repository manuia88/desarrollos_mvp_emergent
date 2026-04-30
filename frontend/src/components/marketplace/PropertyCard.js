// Shared PropertyCard for Marketplace (compact version of landing card)
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MapPin, Bed, Bath, Car, Ruler, Heart, ArrowRight, Leaf, Route, Shield, Store } from '../icons';
import { isFavorite, toggleFavorite } from '../../api/marketplace';

const SCORE_ICON = { vida: Leaf, movilidad: Route, seguridad: Shield, comercio: Store };

function PhotoPlaceholder({ idx = 0 }) {
  return (
    <svg viewBox="0 0 400 220" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`mkp-${idx}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1040" />
          <stop offset="100%" stopColor="#0A0D16" />
        </linearGradient>
      </defs>
      <rect width={400} height={220} fill={`url(#mkp-${idx})`} />
      <rect x={80} y={40} width={240} height={160} fill="rgba(28,28,58,0.75)" />
      {[0,1,2,3,4].map(row => [0,1,2,3].map(col => (
        <rect key={`${row}${col}`} x={100 + col*55} y={55 + row*26} width={28} height={16}
          fill={((row*4+col+idx) % 3) > 0 ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.04)'} rx={2} />
      )))}
      <rect x={80} y={170} width={240} height={30} fill="rgba(99,102,241,0.15)" />
    </svg>
  );
}

export default function PropertyCard({ property, index = 0, colonia }) {
  const { t, i18n } = useTranslation();
  const [saved, setSaved] = useState(() => isFavorite(property.id));
  const title = i18n.language === 'en' ? property.titulo_en : property.titulo;
  const scoreKeys = ['vida', 'movilidad', 'seguridad'];

  const onToggleFav = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nowSaved = toggleFavorite(property.id);
    setSaved(nowSaved);
  };

  return (
    <Link
      to={`/propiedad/${property.id}`}
      className="card"
      data-testid={`mkp-card-${property.id}`}
      style={{
        display: 'flex', flexDirection: 'column', textDecoration: 'none',
        color: 'inherit', minHeight: 460,
      }}
    >
      <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}><PhotoPlaceholder idx={index} /></div>
        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <span style={{
            background: 'var(--grad)', color: '#fff',
            borderRadius: 9999, padding: '2px 10px',
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {t(`listings.tag.${property.tag}`)}
          </span>
        </div>
        <button onClick={onToggleFav} className="btn-icon-circle"
          data-testid={`fav-btn-${property.id}`}
          style={{ position: 'absolute', top: 12, right: 12 }}>
          <Heart size={14} filled={saved} />
        </button>
        <div style={{ position: 'absolute', bottom: 12, left: 12 }}>
          <span className={colonia?.momentum_positive ? 'mom-pill mom-up' : 'mom-pill mom-dn'}>
            {colonia?.momentum}
          </span>
        </div>
      </div>

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <MapPin size={12} color="var(--cream-3)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
            {property.colonia} · {property.alcaldia}
          </span>
        </div>

        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 17,
          color: 'var(--cream)', lineHeight: 1.2, letterSpacing: '-0.02em',
        }}>
          {title}
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { Icon: Bed, v: property.beds }, { Icon: Bath, v: property.baths },
            { Icon: Car, v: property.parking }, { Icon: Ruler, v: property.sqm, suffix: ' m²' },
          ].map(({ Icon, v, suffix = '' }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon size={12} color="var(--cream-3)" />
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>{v}{suffix}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 0', borderTop: '1px dashed rgba(255,255,255,0.12)', borderBottom: '1px dashed rgba(255,255,255,0.12)' }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.025em' }}>
            {property.price_display}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>{property.ppm2_display}</div>
        </div>

        {colonia && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {scoreKeys.map(k => {
              const Icon = SCORE_ICON[k];
              return (
                <div key={k} style={{ textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <Icon size={10} color="var(--indigo-3)" />
                    <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 9.5, color: 'var(--indigo-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {t(`bento.layers.${k}`)}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
                    background: 'var(--grad)', WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  }}>
                    {colonia.scores[k]}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 9999, background: 'var(--grad)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Outfit', fontWeight: 700, fontSize: 9, color: '#fff',
            }}>
              {property.advisor.initials}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)' }}>
              {property.advisor.name}
            </div>
          </div>
          <span className="btn btn-primary btn-sm" data-testid={`open-${property.id}`}>
            {t('listings.cta_detail')} <ArrowRight size={11} />
          </span>
        </div>
      </div>
    </Link>
  );
}

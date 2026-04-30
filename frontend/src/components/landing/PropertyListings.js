// PropertyListings — 6 diverse properties across CDMX colonias
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FadeUp from '../animations/FadeUp';
import BlurText from '../animations/BlurText';
import useInView from '../../hooks/useInView';
import { Bed, Bath, Car, Ruler, Heart, ChevronLeft, ChevronRight, ArrowRight, MapPin, Leaf, Route, Shield, Store } from '../icons';
import { COLONIAS_BY_KEY } from '../../data/colonias';

// 6 diverse properties — mix of colonias, typologies, price ranges
const PROPERTIES = [
  {
    id: 'p001', coloniaKey: 'polanco',
    titleKey: 'ph-polanco',
    price: '$18,500,000', ppm2: '$95k/m²', appreciation: '+3.2%',
    beds: 3, baths: 3, parking: 2, sqm: 195,
    advisor: { name: 'Elena Ríos', initials: 'ER' },
    tagKey: 'exclusiva', scenes: ['building', 'interior', 'view'],
  },
  {
    id: 'p002', coloniaKey: 'roma-norte',
    titleKey: 'loft-roma',
    price: '$5,200,000', ppm2: '$68k/m²', appreciation: '+8.3%',
    beds: 1, baths: 1, parking: 1, sqm: 76,
    advisor: { name: 'Miguel Torres', initials: 'MT' },
    tagKey: 'nuevo', scenes: ['view', 'garden', 'interior'],
  },
  {
    id: 'p003', coloniaKey: 'condesa',
    titleKey: 'dept-condesa',
    price: '$8,900,000', ppm2: '$72k/m²', appreciation: '+4.1%',
    beds: 3, baths: 2, parking: 2, sqm: 124,
    advisor: { name: 'Ana Gutiérrez', initials: 'AG' },
    tagKey: 'inmediata', scenes: ['interior', 'view', 'building'],
  },
  {
    id: 'p004', coloniaKey: 'juarez',
    titleKey: 'dept-juarez',
    price: '$4,100,000', ppm2: '$64k/m²', appreciation: '+11.4%',
    beds: 2, baths: 2, parking: 1, sqm: 64,
    advisor: { name: 'Diego Navarro', initials: 'DN' },
    tagKey: 'preventa', scenes: ['building', 'view', 'interior'],
  },
  {
    id: 'p005', coloniaKey: 'del-valle-centro',
    titleKey: 'casa-delvalle',
    price: '$12,800,000', ppm2: '$58k/m²', appreciation: '+6.0%',
    beds: 4, baths: 4, parking: 2, sqm: 220,
    advisor: { name: 'Carlos Mendoza', initials: 'CM' },
    tagKey: 'inmediata', scenes: ['garden', 'interior', 'building'],
  },
  {
    id: 'p006', coloniaKey: 'narvarte',
    titleKey: 'dept-narvarte',
    price: '$3,450,000', ppm2: '$55k/m²', appreciation: '+7.2%',
    beds: 2, baths: 1, parking: 1, sqm: 63,
    advisor: { name: 'Paulina Ortega', initials: 'PO' },
    tagKey: 'remate', scenes: ['building', 'interior', 'garden'],
  },
];

const TITLES = {
  'ph-polanco': 'Penthouse con terraza en Polanco',
  'loft-roma': 'Loft de autor en Roma Norte',
  'dept-condesa': 'Departamento frente al parque · Condesa',
  'dept-juarez': 'Preventa boutique en Juárez',
  'casa-delvalle': 'Casa familiar en Del Valle Centro',
  'dept-narvarte': 'Departamento con patio · Narvarte',
};

const TITLES_EN = {
  'ph-polanco': 'Penthouse with terrace · Polanco',
  'loft-roma': 'Signature loft · Roma Norte',
  'dept-condesa': 'Park-front apartment · Condesa',
  'dept-juarez': 'Boutique preconstruction · Juárez',
  'casa-delvalle': 'Family house · Del Valle Centro',
  'dept-narvarte': 'Apartment with patio · Narvarte',
};

function PhotoScene({ scene, idx }) {
  const scenes = {
    building: (
      <g>
        <rect x={0} y={0} width={400} height={220} fill="#0A0D16" />
        <defs>
          <linearGradient id={`sky-${idx}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1040" />
            <stop offset="100%" stopColor="#0A0D16" />
          </linearGradient>
          <linearGradient id={`bldg-${idx}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1c1c3a" />
            <stop offset="100%" stopColor="#0e0e1e" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={400} height={220} fill={`url(#sky-${idx})`} />
        <rect x={80} y={40} width={240} height={160} fill={`url(#bldg-${idx})`} />
        {[0,1,2,3,4].map(row => [0,1,2,3].map(col => (
          <rect key={`${row}${col}`} x={100 + col*55} y={55 + row*26} width={28} height={16}
            fill={((row*4+col+idx) % 3) > 0 ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.04)'} rx={2} />
        )))}
        <rect x={80} y={170} width={240} height={30} fill="rgba(99,102,241,0.15)" />
        <ellipse cx={200} cy={220} rx={150} ry={20} fill="rgba(99,102,241,0.12)" />
      </g>
    ),
    interior: (
      <g>
        <defs>
          <linearGradient id={`int-${idx}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a1028" />
            <stop offset="100%" stopColor="#0e0e1e" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={400} height={220} fill={`url(#int-${idx})`} />
        <rect x={0} y={160} width={400} height={60} fill="rgba(240,235,224,0.04)" />
        <rect x={140} y={20} width={120} height={130} fill="rgba(99,102,241,0.12)" rx={4} />
        <line x1={200} y1={20} x2={200} y2={150} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        <path d="M 140 20 L 260 20 L 400 160 L 0 160 Z" fill="rgba(99,102,241,0.04)" />
        <rect x={60} y={140} width={200} height={30} fill="rgba(255,255,255,0.06)" rx={4} />
        <rect x={55} y={128} width={30} height={42} fill="rgba(255,255,255,0.06)" rx={4} />
        <rect x={225} y={128} width={30} height={42} fill="rgba(255,255,255,0.06)" rx={4} />
      </g>
    ),
    view: (
      <g>
        <defs>
          <linearGradient id={`view-${idx}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1628" />
            <stop offset="50%" stopColor="#1a1040" />
            <stop offset="100%" stopColor="#0A0D16" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={400} height={220} fill={`url(#view-${idx})`} />
        {[
          [20,80,50,140],[80,40,40,180],[130,60,30,160],[170,30,50,190],
          [230,50,40,170],[280,20,60,200],[350,45,40,175],[0,90,25,130],
        ].map(([x,y,w,h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill="rgba(255,255,255,0.06)" />
        ))}
        <ellipse cx={200} cy={100} rx={180} ry={80} fill="rgba(99,102,241,0.08)" />
        <ellipse cx={200} cy={100} rx={90} ry={40} fill="rgba(236,72,153,0.06)" />
        {[...Array(20)].map((_, i) => (
          <circle key={i} cx={Math.sin(i*37+idx)*200+200} cy={Math.sin(i*13+idx)*80+50} r={1} fill="rgba(255,255,255,0.4)" />
        ))}
      </g>
    ),
    garden: (
      <g>
        <defs>
          <linearGradient id={`grd-${idx}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d1f0d" />
            <stop offset="100%" stopColor="#06080F" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={400} height={220} fill={`url(#grd-${idx})`} />
        {[60,150,250,340].map(x => (
          <g key={x}>
            <ellipse cx={x} cy={120} rx={35} ry={50} fill="rgba(34,197,94,0.12)" />
            <rect x={x-4} y={150} width={8} height={70} fill="rgba(34,197,94,0.08)" />
          </g>
        ))}
        <rect x={0} y={165} width={400} height={55} fill="rgba(34,197,94,0.06)" />
        <ellipse cx={200} cy={170} rx={200} ry={20} fill="rgba(34,197,94,0.05)" />
      </g>
    ),
  };
  return (
    <svg viewBox="0 0 400 220" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
      {scenes[scene] || scenes.building}
    </svg>
  );
}

const SCORE_ICON = { vida: Leaf, movilidad: Route, seguridad: Shield, comercio: Store };

function PropertyCard({ property, index, t, i18n }) {
  const [slide, setSlide] = useState(0);
  const [saved, setSaved] = useState(false);
  const [ref, inView] = useInView({ once: true, amount: 0.15 });
  const [hovered, setHovered] = useState(false);
  const scenes = property.scenes || ['building'];
  const colonia = COLONIAS_BY_KEY[property.coloniaKey];
  const title = i18n.language === 'en' ? TITLES_EN[property.titleKey] : TITLES[property.titleKey];

  const featuredScores = ['vida', 'movilidad', 'seguridad'];

  return (
    <div
      ref={ref}
      className="card"
      data-testid={`property-card-${property.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minHeight: 540,
        display: 'flex', flexDirection: 'column',
        opacity: inView ? 1 : 0,
        transform: inView ? (hovered ? 'translateY(-6px)' : 'translateY(0)') : 'translateY(30px)',
        filter: inView ? 'blur(0)' : 'blur(6px)',
        transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.4s cubic-bezier(0.22,1,0.36,1), filter 0.7s, border-color 0.3s, box-shadow 0.3s',
        transitionDelay: `${index * 0.08}s`,
        borderColor: hovered ? 'rgba(99,102,241,0.40)' : undefined,
        boxShadow: hovered ? 'var(--sh-card)' : undefined,
      }}
    >
      <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <PhotoScene scene={scenes[slide]} idx={index} />
        </div>

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(to bottom, rgba(6,8,15,0.6), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(to top, rgba(6,8,15,0.8), transparent)', pointerEvents: 'none' }} />

        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <span style={{
            background: 'var(--grad)', color: '#fff',
            borderRadius: 9999, padding: '2px 10px',
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {t(`listings.tag.${property.tagKey}`)}
          </span>
        </div>

        <div style={{ position: 'absolute', bottom: 12, left: 12 }}>
          <span className={colonia.momentumPositive ? 'mom-pill mom-up' : 'mom-pill mom-dn'}>
            {colonia.momentum}
          </span>
        </div>

        <button data-testid={`save-btn-${property.id}`} onClick={() => setSaved(!saved)} className="btn-icon-circle" style={{ position: 'absolute', top: 12, right: 12 }}>
          <Heart size={14} filled={saved} />
        </button>

        {scenes.length > 1 && (
          <>
            <button onClick={() => setSlide(s => (s - 1 + scenes.length) % scenes.length)} className="btn-icon-circle"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}>
              <ChevronLeft size={12} />
            </button>
            <button onClick={() => setSlide(s => (s + 1) % scenes.length)} className="btn-icon-circle"
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}>
              <ChevronRight size={12} />
            </button>
          </>
        )}

        <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 4 }}>
          {scenes.map((_, i) => (
            <div key={i} style={{
              width: i === slide ? 14 : 5, height: 5, borderRadius: 9999,
              background: i === slide ? '#fff' : 'rgba(255,255,255,0.3)',
              transition: 'width 0.2s',
            }} />
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <MapPin size={12} color="var(--cream-3)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
            {colonia.name}
          </span>
          <div style={{ width: 3, height: 3, borderRadius: 9999, background: 'var(--cream-3)' }} />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
            {colonia.alcaldia}
          </span>
        </div>

        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
          color: 'var(--cream)', lineHeight: 1.15, letterSpacing: '-0.025em',
          textWrap: 'balance',
        }}>
          {title}
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { Icon: Bed, val: property.beds, unit: 'rec' },
            { Icon: Bath, val: property.baths, unit: 'baños' },
            { Icon: Car, val: property.parking, unit: 'car' },
            { Icon: Ruler, val: property.sqm, unit: 'm²' },
          ].map(({ Icon, val, unit }) => (
            <div key={unit} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon size={12} color="var(--cream-3)" />
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                {val} {unit}
              </span>
            </div>
          ))}
        </div>

        <div className="dashed-border" style={{ padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', letterSpacing: '-0.03em' }}>
              {property.price}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              {property.ppm2}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 2 }}>{t('listings.plusvalia')}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--green)' }}>
              {property.appreciation}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {featuredScores.map(key => {
            const Icon = SCORE_ICON[key];
            return (
              <div key={key} style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <Icon size={10} color="var(--indigo-3)" />
                  <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 9.5, color: 'var(--indigo-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {t(`bento.layers.${key}`)}
                  </span>
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
                  background: 'var(--grad)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>
                  {colonia.scores[key]}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 'auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: 12, borderTop: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 9999,
              background: 'var(--grad)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Outfit', fontWeight: 700, fontSize: 10, color: '#fff',
            }}>
              {property.advisor.initials}
            </div>
            <div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500, color: 'var(--cream)' }}>
                {property.advisor.name}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)' }}>{t('listings.advisor_role')}</div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" data-testid={`property-cta-${property.id}`}>
            {t('listings.cta_detail')} <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PropertyListings() {
  const { t, i18n } = useTranslation();

  return (
    <section data-testid="property-listings" id="propiedades" style={{ padding: '80px 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <FadeUp>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="tag-pill" style={{ marginBottom: 16 }}>{t('listings.eyebrow')}</div>
            <BlurText
              as="h2"
              gradientWords={['nosotros.']}
              style={{
                fontFamily: 'Outfit', fontWeight: 800,
                fontSize: 'clamp(32px, 4.5vw, 54px)',
                lineHeight: 1.0, letterSpacing: '-0.028em',
                marginBottom: 16,
                justifyContent: 'center',
              }}
            >
              {`${t('listings.h2_1')} ${t('listings.h2_2')}`}
            </BlurText>
            <p style={{
              maxWidth: 640, margin: '0 auto',
              fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
              lineHeight: 1.65,
            }}>
              {t('listings.sub')}
            </p>
          </div>
        </FadeUp>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }} className="listings-grid">
          {PROPERTIES.map((p, i) => (
            <PropertyCard key={p.id} property={p} index={i} t={t} i18n={i18n} />
          ))}
        </div>

        <FadeUp delay={0.3} style={{ textAlign: 'center', marginTop: 36 }}>
          <a href="#" data-testid="listings-see-more" style={{
            fontFamily: 'DM Sans', fontWeight: 500, fontSize: 14,
            color: 'var(--indigo-3)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {t('listings.see_more')} <ArrowRight size={14} color="var(--indigo-3)" />
          </a>
        </FadeUp>
      </div>

      <style>{`
        @media (max-width: 960px) { .listings-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 640px) { .listings-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}

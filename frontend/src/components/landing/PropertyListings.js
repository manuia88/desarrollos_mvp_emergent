// PropertyListings — 3-col grid, cards with photo scene, carousel, scores
import React, { useState } from 'react';
import FadeUp from '../animations/FadeUp';
import BlurText from '../animations/BlurText';
import useInView from '../../hooks/useInView';
import { Bed, Bath, Car, Ruler, Heart, ChevronLeft, ChevronRight, ArrowRight, MapPin } from '../icons';

const PROPERTIES = [
  {
    id: 'p001',
    title: 'Departamento en Del Valle Centro',
    price: '$4,850,000',
    ppm2: '$58k/m²',
    appreciation: '+6.2%',
    beds: 2, baths: 2, parking: 1, sqm: 84,
    colonia: 'Del Valle Centro', alcaldia: 'Benito Juárez',
    scores: { LIV: 87, MOV: 91, SEC: 74 },
    advisor: { name: 'Carlos Mendoza', initials: 'CM' },
    tag: 'Preventa',
    mom: { pct: '+6%', positive: true },
    scenes: ['building', 'interior', 'view'],
  },
  {
    id: 'p002',
    title: 'Penthouse en Condesa',
    price: '$8,900,000',
    ppm2: '$72k/m²',
    appreciation: '+4.1%',
    beds: 3, baths: 3, parking: 2, sqm: 124,
    colonia: 'Condesa', alcaldia: 'Cuauhtémoc',
    scores: { LIV: 92, MOV: 88, SEC: 76 },
    advisor: { name: 'Ana Gutiérrez', initials: 'AG' },
    tag: 'Entrega inmediata',
    mom: { pct: '+4%', positive: true },
    scenes: ['interior', 'view', 'building'],
  },
  {
    id: 'p003',
    title: 'Loft moderno en Roma Norte',
    price: '$5,200,000',
    ppm2: '$68k/m²',
    appreciation: '+8.3%',
    beds: 1, baths: 1, parking: 1, sqm: 76,
    colonia: 'Roma Norte', alcaldia: 'Cuauhtémoc',
    scores: { LIV: 90, MOV: 85, SEC: 72 },
    advisor: { name: 'Miguel Torres', initials: 'MT' },
    tag: 'Hot',
    mom: { pct: '+8%', positive: true },
    scenes: ['view', 'garden', 'interior'],
  },
];

// Photo scene SVG illustration
function PhotoScene({ scene, idx }) {
  const scenes = {
    building: (
      <g>
        <rect x={0} y={0} width={400} height={220} fill="#0A0D16" />
        {/* Sky gradient */}
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
        {/* Building */}
        <rect x={80} y={40} width={240} height={160} fill={`url(#bldg-${idx})`} />
        {/* Windows */}
        {[0,1,2,3,4].map(row => [0,1,2,3].map(col => (
          <rect key={`${row}${col}`} x={100 + col*55} y={55 + row*26} width={28} height={16}
            fill={Math.random() > 0.4 ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.04)'} rx={2} />
        )))}
        {/* Ground floor indigo glow */}
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
        {/* Floor */}
        <rect x={0} y={160} width={400} height={60} fill="rgba(240,235,224,0.04)" />
        {/* Window */}
        <rect x={140} y={20} width={120} height={130} fill="rgba(99,102,241,0.12)" rx={4} />
        <line x1={200} y1={20} x2={200} y2={150} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        {/* Light beam */}
        <path d="M 140 20 L 260 20 L 400 160 L 0 160 Z" fill="rgba(99,102,241,0.04)" />
        {/* Sofa silhouette */}
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
        {/* City skyline */}
        {[
          [20,80,50,140],[80,40,40,180],[130,60,30,160],[170,30,50,190],
          [230,50,40,170],[280,20,60,200],[350,45,40,175],[0,90,25,130],
        ].map(([x,y,w,h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill="rgba(255,255,255,0.06)" />
        ))}
        {/* Gradient overlay */}
        <ellipse cx={200} cy={100} rx={180} ry={80} fill="rgba(99,102,241,0.08)" />
        <ellipse cx={200} cy={100} rx={90} ry={40} fill="rgba(236,72,153,0.06)" />
        {/* Stars */}
        {[...Array(20)].map((_, i) => (
          <circle key={i} cx={Math.sin(i*37)*200+200} cy={Math.sin(i*13)*80+50}
            r={1} fill="rgba(255,255,255,0.4)" />
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
        {/* Trees */}
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

function PropertyCard({ property, index }) {
  const [slide, setSlide] = useState(0);
  const [saved, setSaved] = useState(false);
  const [ref, inView] = useInView({ once: true, amount: 0.15 });
  const [hovered, setHovered] = useState(false);
  const scenes = property.scenes || ['building'];

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
        transform: inView ? 'translateY(0)' : 'translateY(30px)',
        filter: inView ? 'blur(0)' : 'blur(6px)',
        transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1), filter 0.7s, border-color 0.3s, box-shadow 0.3s',
        transitionDelay: `${index * 0.1}s`,
        ...(hovered ? { transform: 'translateY(-6px)', borderColor: 'rgba(99,102,241,0.40)', boxShadow: 'var(--sh-card)' } : {}),
      }}
    >
      {/* Photo carousel */}
      <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <PhotoScene scene={scenes[slide]} idx={index} />
        </div>

        {/* Vignettes */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60,
          background: 'linear-gradient(to bottom, rgba(6,8,15,0.6), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
          background: 'linear-gradient(to top, rgba(6,8,15,0.8), transparent)', pointerEvents: 'none' }} />

        {/* Tag pill top-left */}
        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <span style={{
            background: 'var(--grad)', color: '#fff',
            borderRadius: 9999, padding: '2px 10px',
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {property.tag}
          </span>
        </div>

        {/* Momentum pill bottom-left */}
        <div style={{ position: 'absolute', bottom: 12, left: 12 }}>
          <span className={property.mom.positive ? 'mom-pill mom-up' : 'mom-pill mom-dn'}>
            {property.mom.pct}
          </span>
        </div>

        {/* Save heart top-right */}
        <button
          data-testid={`save-btn-${property.id}`}
          onClick={() => setSaved(!saved)}
          className="btn-icon-circle"
          style={{ position: 'absolute', top: 12, right: 12 }}
        >
          <Heart size={14} filled={saved} />
        </button>

        {/* Carousel arrows */}
        {scenes.length > 1 && (
          <>
            <button
              onClick={() => setSlide(s => (s - 1 + scenes.length) % scenes.length)}
              className="btn-icon-circle"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={() => setSlide(s => (s + 1) % scenes.length)}
              className="btn-icon-circle"
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}
            >
              <ChevronRight size={12} />
            </button>
          </>
        )}

        {/* Dots */}
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

      {/* Body */}
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {/* Location */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <MapPin size={12} color="var(--cream-3)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
            {property.colonia}
          </span>
          <div style={{ width: 3, height: 3, borderRadius: 9999, background: 'var(--cream-3)' }} />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
            {property.alcaldia}
          </span>
        </div>

        {/* Title */}
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
          color: 'var(--cream)', lineHeight: 1.15, letterSpacing: '-0.025em',
          textWrap: 'balance',
        }}>
          {property.title}
        </div>

        {/* Meta */}
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

        {/* Price row */}
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
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 2 }}>Plusvalía</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--green)' }}>
              {property.appreciation}
            </div>
          </div>
        </div>

        {/* Scores grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {Object.entries(property.scores).map(([k, v]) => (
            <div key={k} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 9.5, color: 'var(--indigo-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>
                {k}
              </div>
              <div style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
                background: 'var(--grad)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                {v}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
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
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)' }}>Asesor DMX</div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" data-testid={`property-cta-${property.id}`}>
            Ver ficha <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PropertyListings() {
  return (
    <section data-testid="property-listings" id="propiedades" style={{ padding: '80px 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <FadeUp>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="tag-pill" style={{ marginBottom: 16 }}>Marketplace</div>
            <BlurText
              as="h2"
              gradientWords={['contexto.']}
              style={{
                fontFamily: 'Outfit', fontWeight: 800,
                fontSize: 'clamp(32px, 4.5vw, 54px)',
                lineHeight: 1.0, letterSpacing: '-0.028em',
                marginBottom: 16,
                justifyContent: 'center',
              }}
            >
              Propiedades con contexto.
            </BlurText>
            <p style={{
              maxWidth: 540, margin: '0 auto',
              fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
              lineHeight: 1.65,
            }}>
              Fotos, metros y precio — más los scores de su colonia y plusvalía proyectada. Todo en una sola tarjeta, sin saltar de pestaña.
            </p>
          </div>
        </FadeUp>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }} className="listings-grid">
          {PROPERTIES.map((p, i) => (
            <PropertyCard key={p.id} property={p} index={i} />
          ))}
        </div>

        <FadeUp delay={0.3} style={{ textAlign: 'center', marginTop: 36 }}>
          <a href="#" data-testid="listings-see-more" style={{
            fontFamily: 'DM Sans', fontWeight: 500, fontSize: 14,
            color: 'var(--indigo-3)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            Ver más propiedades <ArrowRight size={14} color="var(--indigo-3)" />
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

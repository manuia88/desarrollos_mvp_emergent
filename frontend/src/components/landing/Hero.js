// Hero — 250vh scroll track with sticky 100vh inner
// Layers: grid bg / vignette / bottom fade / MapOverlay / content
import React, { useEffect, useRef, useState } from 'react';
import BlurText from '../animations/BlurText';
import FadeUp from '../animations/FadeUp';
import { MapPin, Play } from '../icons';

const SCORE_PILLS = [
  { label: 'DMX-LIV', value: '87' },
  { label: 'Seguridad', value: '74' },
  { label: 'Movilidad', value: '91' },
  { label: 'Momentum', value: '+6%', green: true },
  { label: 'Precio m²', value: '$58k' },
];

const PARTNERS = ['Christie\'s', 'Sotheby\'s', 'Lamudi', 'Propiedades.com', 'Pulppo', 'Habimetro'];

// MapOverlay — floating glass card
function MapOverlay() {
  return (
    <div style={{
      position: 'absolute',
      right: '6%', top: '50%',
      transform: 'translateY(-50%)',
      width: 300, 
      zIndex: 5,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.16)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRadius: 16,
      overflow: 'hidden',
      animation: 'breath 5s ease-in-out infinite',
    }}>
      {/* SVG grid lines + ellipses */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.3 }} viewBox="0 0 300 240" preserveAspectRatio="none">
        {/* grid */}
        {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
          <line key={`h${i}`} x1={0} y1={i*24} x2={300} y2={i*24} stroke="rgba(99,102,241,0.3)" strokeWidth={0.5} />
        ))}
        {[0,1,2,3,4,5,6,7,8,9,10,11,12,13].map(i => (
          <line key={`v${i}`} x1={i*24} y1={0} x2={i*24} y2={240} stroke="rgba(99,102,241,0.3)" strokeWidth={0.5} />
        ))}
        {/* ellipses */}
        <ellipse cx={150} cy={120} rx={120} ry={80} fill="rgba(99,102,241,0.08)" />
        <ellipse cx={150} cy={120} rx={80} ry={50} fill="rgba(236,72,153,0.06)" />
        <ellipse cx={150} cy={120} rx={40} ry={25} fill="rgba(34,197,94,0.08)" />
        {/* ping dots */}
        <circle cx={150} cy={120} r={4} fill="#6366F1" />
        <circle cx={200} cy={90} r={3} fill="#EC4899" />
        <circle cx={100} cy={150} r={3} fill="#22C55E" />
      </svg>
      <div style={{ position: 'relative', zIndex: 1, padding: '16px 20px' }}>
        <div style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 11, color: 'var(--cream-3)', marginBottom: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Del Valle Centro
        </div>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', marginBottom: 12 }}>
          Benito Juárez
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { k: 'LIV', v: '87' }, { k: 'MOV', v: '91' }, { k: 'SEC', v: '74' },
            { k: 'ECO', v: '82' }, { k: 'MOM', v: '+6%' }, { k: 'RSK', v: '71' },
          ].map(({ k, v }) => (
            <div key={k} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 9.5, color: 'var(--indigo-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{v}</div>
            </div>
          ))}
        </div>
        <button style={{
          marginTop: 12,
          width: '100%',
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.24)',
          borderRadius: 9999,
          padding: '7px 12px',
          fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12,
          color: 'var(--indigo-3)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          Ver análisis completo
        </button>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section
      data-testid="hero-section"
      style={{ height: '250vh', position: 'relative' }}
    >
      <div style={{
        position: 'sticky', top: 0,
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
      }}>
        {/* Layer z=0: animated grid background */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          {/* Large indigo radial */}
          <div style={{
            position: 'absolute',
            top: '-30%', left: '-10%',
            width: '80%', height: '80%',
            background: 'radial-gradient(ellipse, rgba(99,102,241,0.18) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />
          {/* Rose radial right */}
          <div style={{
            position: 'absolute',
            bottom: '-20%', right: '-5%',
            width: '60%', height: '60%',
            background: 'radial-gradient(ellipse, rgba(236,72,153,0.10) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />
          {/* Grid overlay */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }} xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hero-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(99,102,241,1)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-grid)" />
          </svg>
        </div>

        {/* Layer z=1: vignette */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 40%, rgba(6,8,15,0.7) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Layer z=2: bottom fade */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 180, zIndex: 2,
          background: 'linear-gradient(to bottom, transparent, var(--bg))',
          pointerEvents: 'none',
        }} />

        {/* Layer z=5: MapOverlay — desktop only */}
        <div className="map-overlay-wrap" style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
          <MapOverlay />
        </div>

        {/* Layer z=10: Content */}
        <div style={{
          position: 'relative', zIndex: 10,
          maxWidth: 760,
          padding: '0 32px 0',
          marginTop: -60,
        }} className="hero-content">

          {/* Eyebrow badge */}
          <FadeUp delay={0.1}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 9999,
                padding: '5px 14px 5px 6px',
                backdropFilter: 'blur(8px)',
              }}>
                <div style={{
                  background: 'var(--grad)',
                  borderRadius: 9999,
                  padding: '2px 10px',
                  fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5,
                  color: '#fff',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  IE v1 · CDMX
                </div>
                <span className="eyebrow" style={{ color: 'var(--cream-2)' }}>
                  Inteligencia espacial para vivir mejor
                </span>
              </div>
            </div>
          </FadeUp>

          {/* H1 BlurText */}
          <BlurText
            as="h1"
            gradientWords={['antes']}
            style={{
              fontFamily: 'Outfit',
              fontWeight: 800,
              fontSize: 'clamp(44px, 6vw, 80px)',
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              marginBottom: 24,
              textWrap: 'balance',
            }}
          >
            Conoce tu colonia antes de decidir.
          </BlurText>

          {/* Sub */}
          <FadeUp delay={0.9}>
            <p style={{
              fontFamily: 'DM Sans', fontWeight: 400, fontSize: 17,
              color: 'var(--cream-2)',
              maxWidth: 580,
              lineHeight: 1.65,
              marginBottom: 32,
              textWrap: 'pretty',
            }}>
              DMX analiza más de 97 variables por zona — desde movilidad y seguridad hasta momentum de precio — para que compres, vendas o inviertas con certeza real.
            </p>
          </FadeUp>

          {/* CTA row */}
          <FadeUp delay={1.1}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
              <button className="btn btn-primary" data-testid="hero-explore-btn" style={{ padding: '12px 24px', fontSize: 14 }}>
                <MapPin size={14} />
                Explorar mapa
              </button>
              <button className="btn btn-glass" data-testid="hero-demo-btn" style={{ padding: '12px 24px', fontSize: 14 }}>
                <Play size={14} />
                Ver el demo
              </button>
            </div>
          </FadeUp>

          {/* Score pills row */}
          <FadeUp delay={1.4}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {SCORE_PILLS.map((p, i) => (
                <React.Fragment key={p.label}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: p.green ? 'rgba(34,197,94,0.10)' : 'rgba(99,102,241,0.10)',
                    border: `1px solid ${p.green ? 'rgba(34,197,94,0.24)' : 'rgba(99,102,241,0.24)'}`,
                    borderRadius: 9999,
                    padding: '3px 12px',
                  }}>
                    <span style={{
                      fontFamily: 'DM Sans', fontWeight: 500, fontSize: 11,
                      color: 'var(--cream-3)',
                    }}>{p.label}</span>
                    <span style={{
                      fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
                      color: p.green ? '#86efac' : 'var(--indigo-3)',
                    }}>{p.value}</span>
                  </div>
                  {i < SCORE_PILLS.length - 1 && (
                    <div style={{ width: 1, height: 14, background: 'var(--border-2)' }} />
                  )}
                </React.Fragment>
              ))}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
              Del Valle Centro · Benito Juárez · actualizado hace 6h
            </div>
          </FadeUp>
        </div>

        {/* Partners row */}
        <div style={{
          position: 'absolute',
          bottom: 40, left: 0, right: 0,
          zIndex: 10,
          padding: '0 32px',
          display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
        }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', whiteSpace: 'nowrap' }}>
            Integrado con las principales plataformas
          </span>
          {PARTNERS.map(p => (
            <span key={p} style={{
              fontFamily: 'DM Sans', fontStyle: 'italic', fontWeight: 400,
              fontSize: 18, color: 'var(--cream-3)',
            }}>
              {p}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .map-overlay-wrap { display: none !important; }
          .hero-content { padding: 0 16px 0 !important; }
        }
      `}</style>
    </section>
  );
}

// Hero — 250vh scroll track with sticky 100vh inner
import React from 'react';
import { useTranslation } from 'react-i18next';
import BlurText from '../animations/BlurText';
import FadeUp from '../animations/FadeUp';
import { MapPin, Play, Leaf, Route, Shield, Store, TrendUp, Radio } from '../icons';

const PARTNERS = ["Christie's", "Sotheby's", 'Lamudi', 'Propiedades.com', 'Pulppo', 'Habimetro'];

function ScoreIcon({ k, color }) {
  const size = 11;
  if (k === 'vida') return <Leaf size={size} color={color} />;
  if (k === 'movilidad') return <Route size={size} color={color} />;
  if (k === 'seguridad') return <Shield size={size} color={color} />;
  if (k === 'comercio') return <Store size={size} color={color} />;
  return null;
}

function MapOverlay({ t }) {
  const OVERLAY_SCORES = [
    { k: 'vida', label: t('bento.layers.vida'), v: 90 },
    { k: 'movilidad', label: t('bento.layers.movilidad'), v: 85 },
    { k: 'seguridad', label: t('bento.layers.seguridad'), v: 72 },
    { k: 'comercio', label: t('bento.layers.comercio'), v: 94 },
  ];

  return (
    <div style={{
      position: 'absolute',
      right: '6%', top: '50%',
      transform: 'translateY(-50%)',
      width: 320,
      zIndex: 5,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.16)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRadius: 18,
      overflow: 'hidden',
      animation: 'breath 5s ease-in-out infinite',
    }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.3 }} viewBox="0 0 320 260" preserveAspectRatio="none">
        {[0,1,2,3,4,5,6,7,8,9,10].map(i => (
          <line key={`h${i}`} x1={0} y1={i*26} x2={320} y2={i*26} stroke="rgba(99,102,241,0.3)" strokeWidth={0.5} />
        ))}
        {[0,1,2,3,4,5,6,7,8,9,10,11,12,13].map(i => (
          <line key={`v${i}`} x1={i*24} y1={0} x2={i*24} y2={260} stroke="rgba(99,102,241,0.3)" strokeWidth={0.5} />
        ))}
        <ellipse cx={160} cy={130} rx={130} ry={85} fill="rgba(99,102,241,0.08)" />
        <ellipse cx={160} cy={130} rx={85} ry={52} fill="rgba(236,72,153,0.06)" />
        <ellipse cx={160} cy={130} rx={42} ry={26} fill="rgba(34,197,94,0.08)" />
        <circle cx={160} cy={130} r={4} fill="#6366F1" />
        <circle cx={220} cy={95} r={3} fill="#EC4899" />
        <circle cx={105} cy={165} r={3} fill="#22C55E" />
      </svg>
      <div style={{ position: 'relative', zIndex: 1, padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 11, color: 'var(--cream-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {t('hero.overlay_label')}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--indigo-3)' }}>
            <Radio size={10} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--indigo-3)', fontWeight: 600 }}>LIVE</span>
          </div>
        </div>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
          {t('hero.overlay_colonia')}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginBottom: 14 }}>
          {t('hero.overlay_alcaldia')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {OVERLAY_SCORES.map(({ k, label, v }) => (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px',
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.18)',
              borderRadius: 10,
            }}>
              <ScoreIcon k={k} color="var(--indigo-3)" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', lineHeight: 1.2 }}>{label}</span>
                <span style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
                  background: 'var(--grad)', WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  lineHeight: 1.1,
                }}>{v}</span>
              </div>
            </div>
          ))}
        </div>
        <button style={{
          marginTop: 12, width: '100%',
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.24)',
          borderRadius: 9999,
          padding: '7px 12px',
          fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12,
          color: 'var(--indigo-3)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          {t('hero.overlay_cta')}
        </button>
      </div>
    </div>
  );
}

export default function Hero() {
  const { t } = useTranslation();

  const SCORE_PILLS = [
    { k: 'vida', label: t('bento.layers.vida'), value: '90' },
    { k: 'movilidad', label: t('bento.layers.movilidad'), value: '85' },
    { k: 'seguridad', label: t('bento.layers.seguridad'), value: '72' },
    { k: 'comercio', label: t('bento.layers.comercio'), value: '94' },
    { k: 'momentum', label: 'Absorción 24m', value: '+8%', green: true },
  ];

  return (
    <section data-testid="hero-section" style={{ height: '250vh', position: 'relative' }}>
      <div style={{
        position: 'sticky', top: 0,
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <div style={{
            position: 'absolute', top: '-30%', left: '-10%',
            width: '80%', height: '80%',
            background: 'radial-gradient(ellipse, rgba(99,102,241,0.18) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: '-20%', right: '-5%',
            width: '60%', height: '60%',
            background: 'radial-gradient(ellipse, rgba(236,72,153,0.10) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }} xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hero-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(99,102,241,1)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-grid)" />
          </svg>
        </div>

        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 40%, rgba(6,8,15,0.7) 100%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 180, zIndex: 2,
          background: 'linear-gradient(to bottom, transparent, var(--bg))',
          pointerEvents: 'none',
        }} />

        <div className="map-overlay-wrap" style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
          <MapOverlay t={t} />
        </div>

        <div style={{
          position: 'relative', zIndex: 10,
          maxWidth: 760,
          padding: '0 32px 0',
          marginTop: -60,
        }} className="hero-content">

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
                  {t('hero.badge')}
                </div>
                <span className="eyebrow" style={{ color: 'var(--cream-2)' }}>
                  {t('hero.badge_sub')}
                </span>
              </div>
            </div>
          </FadeUp>

          <BlurText
            as="h1"
            gradientWords={['mapa.']}
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
            {`${t('hero.h1_1')} ${t('hero.h1_2')}`}
          </BlurText>

          <FadeUp delay={0.9}>
            <p style={{
              fontFamily: 'DM Sans', fontWeight: 400, fontSize: 17,
              color: 'var(--cream-2)',
              maxWidth: 580,
              lineHeight: 1.65,
              marginBottom: 32,
              textWrap: 'pretty',
            }}>
              {t('hero.sub')}
            </p>
          </FadeUp>

          <FadeUp delay={1.1}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
              <button className="btn btn-primary" data-testid="hero-explore-btn" style={{ padding: '12px 24px', fontSize: 14 }}>
                <MapPin size={14} />
                {t('hero.cta_primary')}
              </button>
              <button className="btn btn-glass" data-testid="hero-demo-btn" style={{ padding: '12px 24px', fontSize: 14 }}>
                <Play size={14} />
                {t('hero.cta_secondary')}
              </button>
            </div>
          </FadeUp>

          <FadeUp delay={1.4}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {SCORE_PILLS.map((p, i) => (
                <React.Fragment key={p.label}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: p.green ? 'rgba(34,197,94,0.10)' : 'rgba(99,102,241,0.10)',
                    border: `1px solid ${p.green ? 'rgba(34,197,94,0.24)' : 'rgba(99,102,241,0.24)'}`,
                    borderRadius: 9999,
                    padding: '3px 12px',
                  }}>
                    {p.k !== 'momentum' && (
                      <ScoreIcon k={p.k} color={p.green ? '#86efac' : 'var(--indigo-3)'} />
                    )}
                    {p.k === 'momentum' && <TrendUp size={11} color="#86efac" />}
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
              {t('hero.overlay_colonia')} · {t('hero.overlay_alcaldia')} · {t('hero.pill_updated')}
            </div>
          </FadeUp>
        </div>

        <div style={{
          position: 'absolute',
          bottom: 40, left: 0, right: 0,
          zIndex: 10,
          padding: '0 32px',
          display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
        }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', whiteSpace: 'nowrap' }}>
            {t('hero.partners')}
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

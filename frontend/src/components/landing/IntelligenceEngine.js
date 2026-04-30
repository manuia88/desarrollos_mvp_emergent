// IntelligenceEngine — 2-col layout, 6 animated bars, features
import React, { useRef, useEffect, useState } from 'react';
import FadeUp from '../animations/FadeUp';
import BlurText from '../animations/BlurText';
import useInView from '../../hooks/useInView';
import { Database, Clock, Lock, ArrowRight } from '../icons';

const FEATURES = [
  {
    Icon: Database,
    title: '50+ fuentes de datos reales',
    desc: 'DENUE, FGJ, GTFS, SEDUVI, Atlas de Riesgos. Actualizados semanalmente.',
  },
  {
    Icon: Clock,
    title: 'Análisis en 3.2 segundos',
    desc: '97 variables procesadas por colonia. Sin esperar a ningún asesor.',
  },
  {
    Icon: Lock,
    title: 'Cero conflicto de interés',
    desc: 'DMX no cobra comisión por venta. La inteligencia es el producto.',
  },
];

const SCORE_BARS = [
  { label: 'Movilidad', value: 91 },
  { label: 'Seguridad', value: 74 },
  { label: 'Comercio', value: 82 },
  { label: 'Plusvalía', value: 87 },
  { label: 'Educación', value: 77 },
  { label: 'Riesgo', value: 71 },
];

function ScoreBar({ label, value, delay, active }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>{label}</span>
        <span style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
          background: active ? 'var(--grad)' : 'none',
          WebkitBackgroundClip: active ? 'text' : 'unset',
          WebkitTextFillColor: active ? 'transparent' : 'var(--cream)',
          backgroundClip: active ? 'text' : 'unset',
          color: active ? 'transparent' : 'var(--cream)',
        }}>
          {active ? value : 0}
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: active ? `${value}%` : '0%',
          background: 'var(--grad)',
          borderRadius: 9999,
          transition: `width 1.2s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
        }} />
      </div>
    </div>
  );
}

export default function IntelligenceEngine() {
  const [ref, inView] = useInView({ once: true, amount: 0.3 });

  return (
    <section
      data-testid="intelligence-engine"
      id="inteligencia"
      style={{
        padding: '80px 32px',
        background: '#0D1017',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}
          className="ie-grid"
        >
          {/* Col left */}
          <div>
            <FadeUp>
              <div className="tag-pill" style={{ marginBottom: 16 }}>Intelligence Engine</div>
            </FadeUp>
            <BlurText
              as="h2"
              gradientWords={['decisión.']}
              style={{
                fontFamily: 'Outfit', fontWeight: 800,
                fontSize: 'clamp(32px, 4.5vw, 54px)',
                lineHeight: 1.0, letterSpacing: '-0.028em',
                marginBottom: 16,
              }}
            >
              No es un portal. Es una plataforma de decisión.
            </BlurText>
            <FadeUp delay={0.2}>
              <p style={{
                fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
                lineHeight: 1.65, marginBottom: 40, textWrap: 'pretty',
              }}>
                Mientras otros muestran fotos, DMX procesa datos reales de 50+ fuentes públicas para darte certeza antes de firmar.
              </p>
            </FadeUp>

            {/* Feature rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {FEATURES.map(({ Icon, title, desc }, i) => (
                <FadeUp key={title} delay={0.1 * (i + 1)}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 40, height: 40, flexShrink: 0,
                      background: 'rgba(99,102,241,0.10)',
                      border: '1px solid rgba(99,102,241,0.24)',
                      borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={18} color="var(--indigo-3)" />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>
                        {title}
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)', lineHeight: 1.5 }}>
                        {desc}
                      </div>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>

          {/* Col right — Score panel */}
          <FadeUp delay={0.3}>
            <div
              ref={ref}
              style={{
                background: 'linear-gradient(180deg, #0E1220 0%, #0A0D16 100%)',
                border: '1px solid var(--border)',
                borderRadius: 22,
                padding: '28px 28px 24px',
              }}
            >
              {/* Header */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12, color: 'var(--cream-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Del Valle Centro
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 56,
                  lineHeight: 1.0, letterSpacing: '-0.04em',
                  background: 'var(--grad)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  marginBottom: 4,
                }}>
                  87
                </div>
                <span className="score-pill">IE Score · DMX</span>
              </div>

              {/* Bars */}
              <div style={{ marginTop: 24 }}>
                {SCORE_BARS.map((bar, i) => (
                  <ScoreBar key={bar.label} {...bar} delay={i * 100} active={inView} />
                ))}
              </div>

              {/* CTA */}
              <button
                data-testid="ie-full-report-btn"
                style={{
                  marginTop: 20,
                  width: '100%',
                  background: 'rgba(99,102,241,0.10)',
                  border: '1px solid rgba(99,102,241,0.24)',
                  borderRadius: 9999,
                  padding: '11px 16px',
                  fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
                  color: 'var(--indigo-3)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.10)'}
              >
                Ver reporte completo — 97 indicadores <ArrowRight size={13} color="var(--indigo-3)" />
              </button>
            </div>
          </FadeUp>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) { .ie-grid { grid-template-columns: 1fr !important; gap: 40px !important; } }
      `}</style>
    </section>
  );
}

// end

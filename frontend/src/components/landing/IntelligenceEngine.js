// IntelligenceEngine — 2-col layout, 6 animated bars, features
import React from 'react';
import { useTranslation } from 'react-i18next';
import FadeUp from '../animations/FadeUp';
import BlurText from '../animations/BlurText';
import useInView from '../../hooks/useInView';
import { Database, Clock, Lock, ArrowRight } from '../icons';
import { COLONIAS_BY_KEY } from '../../data/colonias';

const PANEL_KEY = 'roma-norte';
const FEATURE_KEYS = [
  { k: 'data', Icon: Database },
  { k: 'speed', Icon: Clock },
  { k: 'neutral', Icon: Lock },
];
const BAR_KEYS = ['movilidad', 'seguridad', 'comercio', 'plusvalia', 'educacion', 'riesgo'];

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
  const { t } = useTranslation();
  const [ref, inView] = useInView({ once: true, amount: 0.3 });
  const panelColonia = COLONIAS_BY_KEY[PANEL_KEY];
  // Composite IE Score — arithmetic mean of 6 scores rounded
  const composite = Math.round(BAR_KEYS.reduce((s, k) => s + panelColonia.scores[k], 0) / BAR_KEYS.length);

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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }} className="ie-grid">
          <div>
            <FadeUp>
              <div className="tag-pill" style={{ marginBottom: 16 }}>{t('ie.eyebrow')}</div>
            </FadeUp>
            <BlurText
              as="h2"
              gradientWords={['decisión.', 'layer.']}
              style={{
                fontFamily: 'Outfit', fontWeight: 800,
                fontSize: 'clamp(32px, 4.5vw, 54px)',
                lineHeight: 1.0, letterSpacing: '-0.028em',
                marginBottom: 16,
              }}
            >
              {`${t('ie.h2_1')} ${t('ie.h2_2')}`}
            </BlurText>
            <FadeUp delay={0.2}>
              <p style={{
                fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
                lineHeight: 1.65, marginBottom: 40, textWrap: 'pretty',
              }}>
                {t('ie.sub')}
              </p>
            </FadeUp>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {FEATURE_KEYS.map(({ k, Icon }, i) => (
                <FadeUp key={k} delay={0.1 * (i + 1)}>
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
                        {t(`ie.features.${k}.title`)}
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)', lineHeight: 1.5 }}>
                        {t(`ie.features.${k}.desc`)}
                      </div>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>

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
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12, color: 'var(--cream-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                  {panelColonia.name}
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 56,
                  lineHeight: 1.0, letterSpacing: '-0.04em',
                  background: 'var(--grad)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  marginBottom: 4,
                }}>
                  {composite}
                </div>
                <span className="score-pill">{t('ie.panel_subtitle')}</span>
              </div>

              <div style={{ marginTop: 24 }}>
                {BAR_KEYS.map((k, i) => (
                  <ScoreBar
                    key={k}
                    label={t(`ie.bars.${k}`)}
                    value={panelColonia.scores[k]}
                    delay={i * 100}
                    active={inView}
                  />
                ))}
              </div>

              <button
                data-testid="ie-full-report-btn"
                style={{
                  marginTop: 20, width: '100%',
                  background: 'rgba(99,102,241,0.10)',
                  border: '1px solid rgba(99,102,241,0.24)',
                  borderRadius: 9999,
                  padding: '11px 16px',
                  fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
                  color: 'var(--indigo-3)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.10)'}
              >
                {t('ie.full_report')} <ArrowRight size={13} color="var(--indigo-3)" />
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

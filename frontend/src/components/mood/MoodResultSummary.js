// W5.x F10 · MoodResultSummary · vibe label + 5 barras + acciones (repeat + share WhatsApp)
import React from 'react';
import { useTranslation } from 'react-i18next';
import WhatsAppCTAButton from '../whatsapp/WhatsAppCTAButton';

const CREAM = '#F0EBE0';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const gradientText = {
  background: GRAD,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

const DIMENSIONS = [
  { key: 'calm', low_i18n: 'mood.dim_calm_low', high_i18n: 'mood.dim_calm_high' },
  { key: 'social', low_i18n: 'mood.dim_social_low', high_i18n: 'mood.dim_social_high' },
  { key: 'eclectic', low_i18n: 'mood.dim_eclectic_low', high_i18n: 'mood.dim_eclectic_high' },
  { key: 'modern', low_i18n: 'mood.dim_modern_low', high_i18n: 'mood.dim_modern_high' },
  { key: 'connected', low_i18n: 'mood.dim_connected_low', high_i18n: 'mood.dim_connected_high' },
];

export default function MoodResultSummary({ mood_vector = {}, mood_label = '', onReset, onShare }) {
  const { t } = useTranslation('common');

  return (
    <section
      data-testid="mood-result-summary"
      style={{
        background: CARD_BG, border: BORDER, borderRadius: 32, padding: 36,
        maxWidth: 720, margin: '0 auto',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        fontFamily: 'DM Sans, sans-serif', color: CREAM,
      }}
    >
      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: 28 }}>
        <span style={{
          ...gradientText,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>{t('mood.result_eyebrow', 'Tu vibe')}</span>
        <h1
          data-testid="mood-result-label"
          style={{
            margin: '12px 0 0',
            fontFamily: 'Outfit, sans-serif', fontWeight: 800,
            fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.02em',
            color: CREAM,
          }}
        >{mood_label || '—'}</h1>
      </header>

      {/* 5 barras con dot indicator */}
      <div data-testid="mood-result-vector" style={{ display: 'grid', gap: 18, marginBottom: 28 }}>
        {DIMENSIONS.map((d) => {
          const raw = Number(mood_vector?.[d.key]);
          const safe = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.5;
          const pct = Math.round(safe * 100);
          return (
            <div key={d.key} data-testid={`mood-result-dim-${d.key}`}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 11, color: MUTED_2,
                letterSpacing: '0.04em', marginBottom: 8,
              }}>
                <span>{t(d.low_i18n)}</span>
                <span>{t(d.high_i18n)}</span>
              </div>
              <div style={{
                position: 'relative', height: 6, borderRadius: 9999,
                background: 'rgba(240,235,224,0.06)',
                border: '1px solid rgba(240,235,224,0.06)',
              }}>
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: `${pct}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 18, height: 18, borderRadius: 9999,
                    background: GRAD,
                    border: '2px solid #06080F',
                    boxShadow: '0 4px 12px -2px rgba(99,102,241,0.45)',
                    transition: `left 480ms ${EASE}`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
        <button
          type="button"
          data-testid="mood-result-repeat-btn"
          onClick={onReset}
          style={{
            padding: '10px 22px', borderRadius: 9999,
            background: 'transparent', color: CREAM,
            border: `1px solid rgba(240,235,224,0.30)`,
            fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 13,
            letterSpacing: '0.04em', cursor: 'pointer',
            transition: `transform 280ms ${EASE}, background 280ms ${EASE}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.background = 'rgba(240,235,224,0.04)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.background = 'transparent';
          }}
        >{t('mood.btn_repeat', 'Repetir quiz')}</button>

        <WhatsAppCTAButton
          phone="share"
          templateKey="mood_share"
          context={{ vibe_label: mood_label, top_matches_count: 5 }}
          variant="solid"
          size="md"
          label={t('mood.share_results', 'Compartir resultados')}
        />
      </footer>

      {/* onShare prop pass-through (opcional · analytics) */}
      {typeof onShare === 'function' && (
        <span style={{ display: 'none' }} aria-hidden="true">{/* hook reservado */}</span>
      )}
    </section>
  );
}

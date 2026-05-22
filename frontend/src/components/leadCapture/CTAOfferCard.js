// W5.x F7 · CTAOfferCard · oferta personalizada por audiencia
import React from 'react';
import { useTranslation } from 'react-i18next';

const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

const VALID_AUDIENCES = ['investor', 'family', 'first_home', 'luxury', 'boutique', 'neutral'];

export default function CTAOfferCard({ audience = 'neutral', propertyTitle = '' }) {
  const { t } = useTranslation('common');
  const safe = VALID_AUDIENCES.includes(audience) ? audience : 'neutral';
  const offerText = t(`leadCapture.offer_${safe}`);
  const benefits = [
    t('leadCapture.benefit_personalized'),
    t('leadCapture.benefit_advisor'),
    t('leadCapture.benefit_no_spam'),
  ];

  return (
    <section data-testid="cta-offer-card" style={{
      background: CARD_BG, border: BORDER, borderRadius: 24, padding: 24,
      backdropFilter: 'blur(24px)', color: CREAM, fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{
        fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
        backgroundImage: GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
      }}>
        {t('leadCapture.offer_eyebrow')}
      </div>
      <h3 style={{
        margin: '10px 0 8px', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22,
        lineHeight: 1.18, color: CREAM,
      }}>{offerText}</h3>
      {propertyTitle && (
        <div data-testid="cta-property-title" style={{ color: MUTED, fontSize: 13, marginBottom: 14 }}>{propertyTitle}</div>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {benefits.map((b, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: MUTED, fontSize: 13, lineHeight: 1.45 }}>
            <span style={{
              flexShrink: 0, marginTop: 5,
              width: 6, height: 6, borderRadius: 9999,
              background: i === 0 ? INDIGO : (i === 1 ? ROSE : CREAM),
            }} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

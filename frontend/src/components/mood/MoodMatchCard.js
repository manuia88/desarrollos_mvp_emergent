// W5.x F10 · MoodMatchCard · property match con affinity badge y vibe phrase
import React from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#1E2230';
const MUTED = '#5A5F6E';
const CARD_BG = '#FFFFFF';
const BORDER = '1px solid #ECECEC';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const gradientText = {
  background: GRAD,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

export default function MoodMatchCard({ match }) {
  const { t } = useTranslation('common');
  if (!match) return null;

  const affinity = Math.max(0, Math.min(100, Math.round(Number(match.affinity_pct) || 0)));
  const propertyId = match.property_id || '';
  const title = match.property_title || propertyId;
  const photo = match.photo_url;
  const phrase = match.vibe_phrase;

  return (
    <article
      data-testid={`mood-match-card-${propertyId}`}
      style={{
        background: CARD_BG,
        border: BORDER,
        borderRadius: 24,
        padding: 0,
        overflow: 'hidden',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        transition: `transform 320ms ${EASE}, border-color 320ms ${EASE}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Photo · 16/9 */}
      <div style={{ position: 'relative', aspectRatio: '16 / 9', width: '100%', overflow: 'hidden' }}>
        {photo ? (
          <img
            src={photo}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            data-testid="mood-match-card-photo-placeholder"
            style={{
              width: '100%', height: '100%',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.18))',
            }}
          />
        )}

        {/* Affinity badge top-right */}
        <span
          data-testid="mood-match-card-affinity"
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 48, height: 48, borderRadius: 9999,
            background: GRAD, color: '#FFF',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Outfit, sans-serif', fontWeight: 800,
            fontSize: 13, letterSpacing: '-0.02em',
            border: '2px solid #06080F',
            boxShadow: '0 8px 24px -8px rgba(0,0,0,0.5)',
          }}
        >{affinity}%</span>
      </div>

      {/* Body */}
      <div style={{ padding: 20 }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'Outfit, sans-serif', fontWeight: 700,
          fontSize: 17, lineHeight: 1.25,
          color: CREAM, letterSpacing: '-0.01em',
        }}>{title}</h3>

        {phrase && (
          <p style={{
            margin: '8px 0 14px',
            color: MUTED,
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13, lineHeight: 1.5, fontStyle: 'italic',
          }}>{phrase}</p>
        )}

        <a
          data-testid={`mood-match-card-link-${propertyId}`}
          href={`/desarrollo/${encodeURIComponent(propertyId)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...gradientText,
            display: 'inline-block',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13, fontWeight: 700,
            letterSpacing: '0.04em',
            textDecoration: 'none',
            marginTop: phrase ? 0 : 12,
          }}
        >{t('mood.result_match_label', 'Ver propiedad')} →</a>
      </div>
    </article>
  );
}

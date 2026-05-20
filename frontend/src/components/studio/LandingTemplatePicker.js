// W5.22 Z.8 — LandingTemplatePicker: grid 10 cards con preview SVG
import React from 'react';
import { useTranslation } from 'react-i18next';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

export const TEMPLATE_KEYS = [
  'luxury', 'modern', 'family', 'investor', 'boutique',
  'urgent', 'scrollytelling', 'video_first', 'social_proof', 'compare',
];

function MiniPreview({ k }) {
  // SVG mock por template
  const previews = {
    luxury: (
      <svg viewBox="0 0 200 130" width="100%" height="100%">
        <rect width="200" height="130" fill="#0A0A0A" />
        <rect x="40" y="30" width="120" height="6" fill="#C8A24A" />
        <rect x="20" y="50" width="160" height="10" fill="#fff" opacity="0.7" />
        <rect x="60" y="80" width="80" height="14" rx="7" fill="#C8A24A" />
      </svg>
    ),
    modern: (
      <svg viewBox="0 0 200 130" width="100%" height="100%">
        <rect width="200" height="130" fill="#fff" />
        <rect x="20" y="20" width="80" height="4" fill="url(#g1)" />
        <rect x="20" y="34" width="60" height="14" fill="#111" />
        <rect x="20" y="54" width="50" height="6" fill="#999" />
        <rect x="110" y="30" width="70" height="80" fill="#FAFAFA" stroke="#EEE" />
        <defs><linearGradient id="g1"><stop offset="0" stopColor="#6366F1" /><stop offset="1" stopColor="#EC4899" /></linearGradient></defs>
      </svg>
    ),
    family: (
      <svg viewBox="0 0 200 130" width="100%" height="100%">
        <rect width="200" height="130" fill="#FFF8F0" />
        <circle cx="100" cy="40" r="20" fill="#FF8C42" />
        <rect x="40" y="70" width="120" height="6" fill="#FF8C42" />
        <rect x="20" y="88" width="48" height="24" rx="8" fill="#fff" stroke="#FF8C4244" />
        <rect x="76" y="88" width="48" height="24" rx="8" fill="#fff" stroke="#FF8C4244" />
        <rect x="132" y="88" width="48" height="24" rx="8" fill="#fff" stroke="#FF8C4244" />
      </svg>
    ),
    investor: (
      <svg viewBox="0 0 200 130" width="100%" height="100%">
        <rect width="200" height="130" fill="#06080F" />
        <rect x="20" y="20" width="60" height="6" fill="#6366F1" />
        <rect x="20" y="50" width="160" height="2" fill="#6366F133" />
        {[40, 70, 100, 130, 160].map((x, i) => (
          <rect key={i} x={x - 6} y={56 - i * 4} width="12" height={i * 4 + 8} fill="#EC4899" />
        ))}
      </svg>
    ),
    boutique: (
      <svg viewBox="0 0 200 130" width="100%" height="100%">
        <rect width="200" height="130" fill="#F7F1E8" />
        <rect x="20" y="40" width="60" height="60" fill="#8B6F47" />
        <rect x="90" y="50" width="90" height="6" fill="#8B6F47" />
        <rect x="90" y="62" width="70" height="4" fill="#D9C7A7" />
        <rect x="90" y="70" width="80" height="4" fill="#D9C7A7" />
      </svg>
    ),
    urgent: (
      <svg viewBox="0 0 200 130" width="100%" height="100%">
        <rect width="200" height="130" fill="#0E0808" />
        <rect x="0" y="0" width="200" height="14" fill="#EF4444" />
        <rect x="50" y="40" width="100" height="6" fill="#fff" />
        {[40, 70, 100, 130].map((x, i) => (
          <rect key={i} x={x - 12} y="60" width="24" height="32" rx="6" fill="#EF444433" stroke="#EF4444" />
        ))}
      </svg>
    ),
    scrollytelling: (
      <svg viewBox="0 0 200 130" width="100%" height="100%">
        <rect width="200" height="40" fill="#06080F" />
        <rect y="40" width="200" height="40" fill="#0A0A1F" />
        <rect y="80" width="200" height="50" fill="#1A0E2E" />
        <circle cx="100" cy="20" r="5" fill="#6366F1" />
        <circle cx="100" cy="60" r="5" fill="#EC4899" />
        <circle cx="100" cy="105" r="5" fill="#fff" />
      </svg>
    ),
    video_first: (
      <svg viewBox="0 0 200 130" width="100%" height="100%">
        <rect width="200" height="130" fill="#000" />
        <polygon points="90,55 90,85 115,70" fill="#fff" />
        <rect x="20" y="100" width="160" height="4" fill="#6366F1" />
      </svg>
    ),
    social_proof: (
      <svg viewBox="0 0 200 130" width="100%" height="100%">
        <rect width="200" height="130" fill="#fff" />
        <g transform="translate(60 20)">
          {[0, 1, 2, 3, 4].map((i) => (
            <polygon key={i} points={`${i * 16},6 ${i * 16 + 5},12 ${i * 16 + 12},12 ${i * 16 + 6},16 ${i * 16 + 9},23 ${i * 16},19 ${i * 16 - 9},23 ${i * 16 - 6},16 ${i * 16 - 12},12 ${i * 16 - 5},12`} fill="#F59E0B" />
          ))}
        </g>
        <rect x="40" y="60" width="120" height="6" fill="#111" />
        <rect x="50" y="80" width="100" height="4" fill="#999" />
      </svg>
    ),
    compare: (
      <svg viewBox="0 0 200 130" width="100%" height="100%">
        <rect width="200" height="130" fill="#06080F" />
        <rect x="14" y="20" width="172" height="14" fill="#6366F122" />
        {[40, 60, 80, 100].map((y, i) => (
          <g key={i}>
            <rect x="14" y={y} width="172" height="14" fill={i % 2 ? '#0A0A1F' : 'transparent'} />
            <circle cx="80" cy={y + 7} r="4" fill="#10B981" />
            <circle cx="130" cy={y + 7} r="4" fill="#6b7280" />
            <circle cx="180" cy={y + 7} r="4" fill="#EF4444" />
          </g>
        ))}
      </svg>
    ),
  };
  return previews[k] || previews.modern;
}

export default function LandingTemplatePicker({ value, onChange, compact = false }) {
  const { t } = useTranslation('common');

  return (
    <div data-testid="template-picker" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
      {TEMPLATE_KEYS.map((k) => {
        const isActive = value === k;
        return (
          <button
            key={k}
            type="button"
            data-testid={`template-card-${k}`}
            onClick={() => onChange(k)}
            style={{
              padding: 0,
              background: 'rgba(13,16,23,0.6)',
              border: isActive ? '2px solid transparent' : '1px solid rgba(99,102,241,0.18)',
              borderRadius: 14,
              cursor: 'pointer',
              overflow: 'hidden',
              textAlign: 'left',
              backgroundImage: isActive ? `linear-gradient(rgba(13,16,23,0.6), rgba(13,16,23,0.6)), ${GRADIENT}` : undefined,
              backgroundOrigin: 'border-box',
              backgroundClip: isActive ? 'padding-box, border-box' : 'padding-box',
              transition: 'transform 200ms ease',
            }}
          >
            <div style={{ aspectRatio: '16/10', overflow: 'hidden' }}>
              <MiniPreview k={k} />
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 600, fontFamily: 'Outfit, sans-serif', color: '#F0EBE0' }}>{t(`studio.landings.tpl_${k}`)}</div>
              {!compact && (
                <div style={{ fontSize: 12, color: '#a0a4b0', marginTop: 4 }}>{t(`studio.landings.tpl_${k}_desc`)}</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

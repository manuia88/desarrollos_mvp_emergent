// W5.17 · StyleSelector · grid 6 styles · multi-select max 3
import React from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const STYLES = [
  { value: 'moderno', symbol: '◇', desc_key: 'virtualStaging.style_moderno_desc' },
  { value: 'minimalista', symbol: '○', desc_key: 'virtualStaging.style_minimalista_desc' },
  { value: 'luxury', symbol: '◆', desc_key: 'virtualStaging.style_luxury_desc' },
  { value: 'family', symbol: '♡', desc_key: 'virtualStaging.style_family_desc' },
  { value: 'boutique', symbol: '✦', desc_key: 'virtualStaging.style_boutique_desc' },
  { value: 'scandi', symbol: '☼', desc_key: 'virtualStaging.style_scandi_desc' },
];

export default function StyleSelector({ selected = [], onChange, maxSelections = 3 }) {
  const { t } = useTranslation('common');
  const safeSelected = Array.isArray(selected) ? selected : [];
  const limitReached = safeSelected.length >= maxSelections;

  const toggle = (value) => {
    const next = safeSelected.includes(value)
      ? safeSelected.filter((s) => s !== value)
      : (limitReached ? safeSelected : [...safeSelected, value]);
    if (typeof onChange === 'function') onChange(next);
  };

  return (
    <div data-testid="style-selector">
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
      }}>
        {STYLES.map((s) => {
          const isSelected = safeSelected.includes(s.value);
          const isDisabled = !isSelected && limitReached;
          return (
            <button
              key={s.value}
              type="button"
              data-testid={`style-tile-${s.value}`}
              data-selected={isSelected ? 'true' : 'false'}
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => toggle(s.value)}
              style={{
                position: 'relative',
                padding: 18,
                borderRadius: 16,
                background: CARD_BG,
                border: '1.5px solid transparent',
                color: CREAM,
                fontFamily: 'DM Sans, sans-serif',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.4 : 1,
                textAlign: 'center',
                transition: `transform 280ms ${EASE}, border-color 280ms ${EASE}, opacity 280ms ${EASE}`,
                transform: isSelected ? 'scale(1.02) translateY(-1px)' : 'scale(1)',
                backgroundImage: isSelected ? `linear-gradient(${CARD_BG}, ${CARD_BG}), ${GRAD}` : undefined,
                backgroundOrigin: 'border-box',
                backgroundClip: isSelected ? 'padding-box, border-box' : undefined,
                ...(isSelected ? { border: '1.5px solid transparent' } : { border: BORDER }),
              }}
              onMouseEnter={(e) => { if (!isDisabled && !isSelected) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <div style={{
                fontFamily: 'Outfit, sans-serif', fontSize: 28, color: isSelected ? CREAM : MUTED,
                marginBottom: 8, lineHeight: 1,
              }} aria-hidden="true">{s.symbol}</div>
              <div style={{
                fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14,
                color: CREAM, letterSpacing: '0.02em', textTransform: 'capitalize',
              }}>{t(`virtualStaging.style_${s.value}`, s.value)}</div>
              <div style={{
                marginTop: 4, fontSize: 11, color: MUTED_2, lineHeight: 1.3,
              }}>{t(s.desc_key, '')}</div>
            </button>
          );
        })}
      </div>

      <div data-testid="style-selector-counter" style={{
        marginTop: 12, fontSize: 12, color: MUTED, fontFamily: 'DM Sans, sans-serif',
        textAlign: 'center', letterSpacing: '0.04em',
      }}>
        {t('virtualStaging.style_counter', '{{count}}/{{max}} estilos seleccionados', { count: safeSelected.length, max: maxSelections })}
      </div>
    </div>
  );
}

export { STYLES };

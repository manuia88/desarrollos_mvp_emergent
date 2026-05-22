// W5.x F5 · SearchBar · Brunson hero · autosize textarea + gradient submit
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const MUTED = 'rgba(240,235,224,0.62)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const MAX_CHARS = 500;

export default function SearchBar({ value, onChange, onSubmit, loading, placeholder }) {
  const { t } = useTranslation('common');
  const ref = useRef(null);

  // Autosize textarea (1-4 lines)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 24 * 4 + 28; // 4 lines aprox
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  const tooLong = (value || '').length > MAX_CHARS;
  const canSubmit = (value || '').trim().length > 0 && !loading && !tooLong;

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  };

  return (
    <div data-testid="reverse-searchbar" style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 12,
        padding: '14px 16px 14px 22px',
        background: CARD_BG,
        border: `1px solid ${tooLong ? ROSE : 'rgba(240,235,224,0.14)'}`,
        borderRadius: 28,
        backdropFilter: 'blur(24px)',
        transition: `border-color 320ms ${EASE}`,
      }}>
        <textarea
          ref={ref}
          data-testid="reverse-search-input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder || t('reverseSearch.placeholder')}
          rows={1}
          style={{
            flex: 1, resize: 'none', border: 'none', outline: 'none',
            background: 'transparent', color: CREAM,
            fontFamily: 'DM Sans, sans-serif', fontSize: 16, lineHeight: 1.5,
            paddingTop: 6, paddingBottom: 6,
            minHeight: 28, maxHeight: 124,
            overflow: 'auto',
          }}
        />
        <button
          type="button"
          data-testid="reverse-search-btn"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            padding: '10px 22px', borderRadius: 9999, border: 'none',
            background: GRADIENT, color: '#FFF',
            fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.45,
            transition: `transform 320ms ${EASE}, opacity 320ms ${EASE}`,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? t('reverseSearch.loading') : t('reverseSearch.btn_search')}
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, gap: 8, alignItems: 'center' }}>
        {tooLong && (
          <span data-testid="char-warning" style={{
            padding: '4px 12px', borderRadius: 9999,
            background: 'rgba(236,72,153,0.15)', color: ROSE,
            fontSize: 11, fontFamily: 'DM Sans, sans-serif',
          }}>{t('reverseSearch.error_too_long')}</span>
        )}
        <span data-testid="char-counter" style={{ color: tooLong ? ROSE : MUTED, fontSize: 11, fontFamily: 'DM Sans, sans-serif' }}>
          {(value || '').length}/{MAX_CHARS}
        </span>
      </div>
    </div>
  );
}

// W5.x F9 · WhatsAppCTAButton · CTA reutilizable con 3 variantes + 3 tamaños
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildWhatsAppLink } from '../../api/whatsapp_stub';

const CREAM = '#F0EBE0';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const WA_GREEN = '#25D366';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const SIZE_MAP = {
  sm: { padY: 6, padX: 12, font: 11, icon: 14, gap: 6 },
  md: { padY: 8, padX: 16, font: 12, icon: 16, gap: 8 },
  lg: { padY: 12, padX: 22, font: 14, icon: 20, gap: 10 },
};

function WAIcon({ size = 16, color = '#FFF' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.74.46 3.43 1.33 4.92L2.05 22l5.34-1.4a9.93 9.93 0 0 0 4.64 1.17h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01ZM12.04 20.13a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.17.83.85-3.09-.2-.32a8.22 8.22 0 1 1 6.99 3.9Zm4.5-6.15c-.25-.12-1.46-.72-1.69-.8-.22-.08-.39-.12-.55.13-.16.24-.62.8-.76.96-.14.16-.28.18-.52.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.22-1.46-1.36-1.7-.14-.25-.02-.39.11-.5.11-.11.25-.28.37-.42.13-.14.16-.24.25-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.7 2.6 4.12 3.65.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.46-.6 1.67-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

function pickVariantStyle(variant) {
  switch (variant) {
    case 'solid':
      return { background: WA_GREEN, color: '#FFF', border: '1px solid transparent', iconColor: '#FFF' };
    case 'outline':
      return { background: 'transparent', color: CREAM, border: '1px solid rgba(240,235,224,0.30)', iconColor: CREAM };
    case 'gradient':
    default:
      return { background: GRAD, color: '#FFF', border: '1px solid transparent', iconColor: '#FFF' };
  }
}

export default function WhatsAppCTAButton({
  phone,
  templateKey = 'property_inquiry',
  context = {},
  size = 'md',
  label = null,
  variant = 'gradient',
}) {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(false);

  const cfg = SIZE_MAP[size] || SIZE_MAP.md;
  const v = pickVariantStyle(variant);
  const enabled = !!phone;

  const baseLabel = label || t('whatsapp.cta_default', 'Chatear por WhatsApp');

  const handleClick = async () => {
    if (!enabled || loading) return;
    setLoading(true);
    try {
      const res = await buildWhatsAppLink(templateKey, { ...(context || {}), phone });
      const url = res?.whatsapp_url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <span
      data-testid="whatsapp-cta-wrap"
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        data-testid="whatsapp-cta-btn"
        data-variant={variant}
        data-disabled={enabled ? 'false' : 'true'}
        onClick={handleClick}
        disabled={!enabled || loading}
        aria-label={baseLabel}
        style={{
          padding: `${cfg.padY}px ${cfg.padX}px`,
          borderRadius: 9999,
          background: v.background,
          color: v.color,
          border: v.border,
          fontFamily: 'DM Sans, sans-serif',
          fontWeight: 700,
          fontSize: cfg.font,
          letterSpacing: '0.04em',
          cursor: enabled ? (loading ? 'wait' : 'pointer') : 'not-allowed',
          opacity: enabled ? (loading ? 0.7 : 1) : 0.5,
          display: 'inline-flex',
          alignItems: 'center',
          gap: cfg.gap,
          transition: `transform 280ms ${EASE}, opacity 280ms ${EASE}`,
          transform: hover && enabled && !loading ? 'translateY(-1px)' : 'translateY(0)',
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? (
          <span
            data-testid="whatsapp-cta-spinner"
            aria-hidden="true"
            style={{
              width: cfg.icon, height: cfg.icon, borderRadius: 9999,
              border: '2px solid rgba(255,255,255,0.35)',
              borderTopColor: '#FFF',
              animation: 'waSpin 0.8s linear infinite',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
        ) : (
          <WAIcon size={cfg.icon} color={v.iconColor} />
        )}
        <span>{loading ? t('whatsapp.loading', 'Abriendo...') : baseLabel}</span>
      </button>

      {!enabled && hover && (
        <span
          data-testid="whatsapp-cta-tooltip"
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: `calc(100% + 8px)`,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 10px',
            borderRadius: 8,
            background: 'rgba(13,16,23,0.98)',
            border: '1px solid rgba(240,235,224,0.12)',
            color: CREAM,
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 11.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >{t('whatsapp.no_contact', 'Sin contacto WhatsApp')}</span>
      )}

      <style>{`@keyframes waSpin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

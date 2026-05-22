// W5.x F9 · VoiceSearchButton · boton mic con Web Speech API · graceful degradation
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSpeechRecognition from '../../hooks/useSpeechRecognition';

const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const CREAM = '#F0EBE0';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const SIZE_MAP = {
  sm: { box: 36, icon: 16 },
  md: { box: 44, icon: 20 },
  lg: { box: 60, icon: 26 },
};

function MicIcon({ size = 20, filled = false }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export default function VoiceSearchButton({ onTranscript, size = 'md', placement = 'inline' }) {
  const { t } = useTranslation('common');
  const [hover, setHover] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);

  const handleResult = useCallback((text) => {
    if (typeof onTranscript === 'function' && text) {
      onTranscript(text);
    }
  }, [onTranscript]);

  const handleError = useCallback(() => {
    setErrorVisible(true);
  }, []);

  const { isListening, supported, error, start, stop } = useSpeechRecognition({
    lang: 'es-MX',
    onResult: handleResult,
    onError: handleError,
  });

  // Auto-reset error visual a 3s
  useEffect(() => {
    if (!errorVisible) return undefined;
    const tid = setTimeout(() => setErrorVisible(false), 3000);
    return () => clearTimeout(tid);
  }, [errorVisible]);

  // Si Web Speech API no soportada · NO renderizar nada (evita expectativas falsas)
  if (!supported) return null;

  const cfg = SIZE_MAP[size] || SIZE_MAP.md;

  let bg = 'rgba(99,102,241,0.12)';
  let border = `1px solid ${INDIGO}`;
  let iconColor = CREAM;

  if (errorVisible) {
    bg = 'rgba(236,72,153,0.15)';
    border = `1px solid ${ROSE}`;
    iconColor = ROSE;
  } else if (isListening) {
    bg = GRAD;
    border = '1px solid transparent';
    iconColor = '#FFF';
  }

  const tooltipText = errorVisible
    ? t(`voice.error_${error || 'unknown'}`, t('voice.error_unknown', 'Error de microfono'))
    : isListening
      ? t('voice.tooltip_listening', 'Escuchando · clic para detener')
      : t('voice.tooltip_idle', 'Habla tu busqueda');

  const ariaLabel = isListening
    ? t('voice.stop_listening', 'Detener escucha')
    : t('voice.start_listening', 'Buscar por voz');

  const onClick = () => {
    if (isListening) stop();
    else start();
  };

  return (
    <span
      data-testid="voice-search-wrap"
      data-placement={placement}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        data-testid="voice-search-btn"
        data-listening={isListening ? 'true' : 'false'}
        data-error={errorVisible ? 'true' : 'false'}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={isListening}
        style={{
          width: cfg.box, height: cfg.box, padding: 0,
          borderRadius: 9999,
          background: bg, border, color: iconColor,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transition: `transform 280ms ${EASE}, background 280ms ${EASE}, border-color 280ms ${EASE}`,
          transform: hover && !isListening ? 'translateY(-1px) scale(1.05)' : 'translateY(0) scale(1)',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <MicIcon size={cfg.icon} filled={isListening} />

        {isListening && (
          <span
            aria-hidden="true"
            data-testid="voice-pulse-ring"
            style={{
              position: 'absolute',
              inset: -4,
              borderRadius: 9999,
              border: `2px solid ${ROSE}`,
              animation: 'voicePulse 850ms ease-out infinite',
              pointerEvents: 'none',
            }}
          />
        )}
      </button>

      {hover && (
        <span
          data-testid="voice-tooltip"
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
        >{tooltipText}</span>
      )}

      <style>{`
        @keyframes voicePulse {
          0%   { opacity: 0.65; transform: scale(1); }
          100% { opacity: 0;    transform: scale(1.45); }
        }
      `}</style>
    </span>
  );
}

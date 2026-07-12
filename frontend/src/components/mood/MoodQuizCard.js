// W5.x F10 · MoodQuizCard · una pregunta a la vez con 2 opciones + progress bar
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#1E2230';
const INDIGO = '#6366F1';
const CARD_BG = '#FFFFFF';
const BORDER = '1px solid #ECECEC';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export default function MoodQuizCard({ question, progress = 0, onSelect, stepIndex = 0, total = 6 }) {
  const { t } = useTranslation('common');
  const [fade, setFade] = useState(0); // 0 = entering · 1 = visible

  // Fade in al cambiar de pregunta
  useEffect(() => {
    setFade(0);
    const id = requestAnimationFrame(() => setFade(1));
    return () => cancelAnimationFrame(id);
  }, [question?.id]);

  if (!question) return null;

  return (
    <article
      data-testid="mood-quiz-card"
      data-question-id={question.id}
      style={{
        width: '100%',
        maxWidth: 560,
        margin: '0 auto',
        padding: 32,
        background: CARD_BG,
        border: BORDER,
        borderRadius: 32,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 24px 64px -24px rgba(0,0,0,0.7)',
        opacity: fade,
        transform: fade ? 'translateY(0)' : 'translateY(8px)',
        transition: `opacity 320ms ${EASE}, transform 320ms ${EASE}`,
      }}
    >
      {/* Progress bar */}
      <div data-testid="mood-quiz-progress-wrap" style={{ marginBottom: 28 }}>
        <div style={{
          height: 4, borderRadius: 9999,
          background: '#F6F7FA', overflow: 'hidden',
        }}>
          <div
            data-testid="mood-quiz-progress-bar"
            style={{
              height: '100%', width: `${Math.max(0, Math.min(100, progress))}%`,
              background: GRAD,
              borderRadius: 9999,
              transition: `width 420ms ${EASE}`,
            }}
          />
        </div>
        <div style={{
          marginTop: 10, fontSize: 11, color: '#9AA0AE',
          fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.18em', textTransform: 'uppercase',
          textAlign: 'center',
        }}>{`${stepIndex + 1} / ${total}`}</div>
      </div>

      {/* Pregunta */}
      <h2
        data-testid="mood-quiz-question"
        style={{
          margin: '0 0 24px',
          fontFamily: 'Outfit, sans-serif', fontWeight: 700,
          fontSize: 28, lineHeight: 1.2, letterSpacing: '-0.02em',
          color: CREAM, textAlign: 'center',
        }}
      >{t(question.text_key)}</h2>

      {/* Opciones */}
      <div style={{ display: 'grid', gap: 12 }}>
        {question.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            data-testid={`mood-quiz-option-${question.id}-${opt.value}`}
            onClick={() => onSelect && onSelect(opt.value)}
            style={{
              width: '100%',
              padding: 22,
              borderRadius: 18,
              background: 'rgba(99,102,241,0.08)',
              border: `1.5px solid transparent`,
              color: CREAM,
              fontFamily: 'Outfit, sans-serif', fontWeight: 500,
              fontSize: 17, lineHeight: 1.35,
              textAlign: 'center',
              cursor: 'pointer',
              transition: `transform 280ms ${EASE}, border-color 280ms ${EASE}, background 280ms ${EASE}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.borderColor = INDIGO;
              e.currentTarget.style.background = 'rgba(99,102,241,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.background = 'rgba(99,102,241,0.08)';
            }}
          >{t(opt.label_key)}</button>
        ))}
      </div>
    </article>
  );
}

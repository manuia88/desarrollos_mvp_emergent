// W5.16-C Sub-A · ScriptComposer · textarea + generador IA
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateScript } from '../../api/studioVideo';

const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export default function ScriptComposer({ value, onChange, propertyId }) {
  const { t } = useTranslation('common');
  const [generating, setGenerating] = useState(false);
  const [isStub, setIsStub] = useState(false);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const r = await generateScript({ property_id: propertyId, hint: value });
      if (r?.script && typeof onChange === 'function') onChange(r.script);
      setIsStub(!!r?.is_stub);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section
      data-testid="script-composer"
      style={{
        background: CARD_BG, border: BORDER, borderRadius: 20, padding: 18,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        fontFamily: 'DM Sans, sans-serif', color: CREAM,
        display: 'grid', gap: 12,
      }}
    >
      <div style={{ fontSize: 11, color: MUTED_2, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
        {t('studioVideo.scriptLabel', 'Script del video')}
      </div>
      <textarea
        data-testid="script-composer-textarea"
        rows={8}
        value={value || ''}
        onChange={(e) => typeof onChange === 'function' && onChange(e.target.value)}
        placeholder={t('studioVideo.scriptPlaceholder', 'Describe la propiedad en 2-3 oraciones. La IA puede ayudarte a redactarlo.')}
        style={{
          width: '100%',
          padding: 14,
          borderRadius: 14,
          background: 'rgba(240,235,224,0.04)',
          border: '1px solid rgba(240,235,224,0.12)',
          color: CREAM,
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 14,
          lineHeight: 1.55,
          outline: 'none',
          resize: 'vertical',
          minHeight: 160,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: MUTED }}>
          {(value || '').length} chars · ~{Math.max(1, Math.round((value || '').split(/\s+/).filter(Boolean).length / 2.5))}s de duracion
        </span>
        <button
          type="button"
          data-testid="script-composer-generate-ai"
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: '9px 18px', borderRadius: 9999, border: 'none',
            background: GRAD, color: '#FFF',
            fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 12.5,
            letterSpacing: '0.04em', cursor: generating ? 'wait' : 'pointer',
            opacity: generating ? 0.75 : 1,
            transition: `transform 280ms ${EASE}`,
          }}
          onMouseEnter={(e) => { if (!generating) e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          {generating
            ? t('studioVideo.generateAILoading', 'Generando...')
            : t('studioVideo.generateAI', 'Generar con IA')}
        </button>
      </div>
      {isStub && (
        <div data-testid="script-composer-stub-chip" style={{
          padding: '6px 10px', borderRadius: 10,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.30)',
          color: '#FBBF24', fontSize: 11,
        }}>{t('studioVideo.scriptStubNotice', 'Script generado en modo demo')}</div>
      )}
    </section>
  );
}

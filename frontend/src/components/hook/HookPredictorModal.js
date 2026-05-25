// W5.22 Z.5 — Hook Predictor Modal · standalone score (4 dim · 0-100).
// Reusa HookScoreBadge existente W5.22 Z.2 · Aurora design · ESC + body-scroll-lock.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sparkles, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

import HookScoreBadge from '../studio/HookScoreBadge';
import { scoreHook } from '../../api/hookPredictor';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const TEXT_MAX = 500;
const AUDIENCE_MAX = 200;

const DIM_KEYS = ['clarity', 'cta', 'novelty', 'urgency'];

function bandColor(value) {
  if (value >= 70) return 'var(--success, #22C55E)';
  if (value >= 40) return '#F59E0B';
  return 'var(--danger, #EF4444)';
}

export default function HookPredictorModal({ open, onClose, initialText = '' }) {
  const { t } = useTranslation('common');
  const [text, setText] = useState(initialText || '');
  const [audience, setAudience] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose && onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, submitting, onClose]);

  useEffect(() => {
    if (open) {
      setText(initialText || '');
      setAudience('');
      setResult(null);
      setError('');
    }
  }, [open, initialText]);

  if (!open) return null;

  const submit = async () => {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      setError(t('hookPredictor.empty_text'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await scoreHook({
        text: trimmed.slice(0, TEXT_MAX),
        target_audience: (audience || '').trim().slice(0, AUDIENCE_MAX) || null,
      });
      setResult(res);
    } catch (e) {
      setError(e?.message || t('hookPredictor.error_score'));
    } finally {
      setSubmitting(false);
    }
  };

  const sourceLabel = (() => {
    if (!result) return '';
    if (result.source === 'cache') return t('hookPredictor.source_cache');
    if (result.source === 'llm') return t('hookPredictor.source_llm');
    return t('hookPredictor.source_heuristic');
  })();

  return (
    <div role="dialog" aria-modal="true" style={overlayStyle()}>
      <div style={modalStyle()} data-testid="hook-predictor-modal">
        <header style={headerStyle()}>
          <div>
            <h2 style={titleStyle()}>{t('hookPredictor.title')}</h2>
            <p style={subtitleStyle()}>{t('hookPredictor.subtitle')}</p>
          </div>
          <button
            onClick={() => !submitting && onClose && onClose()}
            disabled={submitting}
            style={iconCloseBtn()}
            aria-label={t('hookPredictor.close')}>
            <X size={16} />
          </button>
        </header>

        <div style={{ display: 'grid', gap: 14 }}>
          <label style={labelStyle()}>
            {t('hookPredictor.input_label')}
            <textarea
              data-testid="hook-predictor-text"
              maxLength={TEXT_MAX}
              rows={4}
              placeholder={t('hookPredictor.input_placeholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={textareaStyle()}
              disabled={submitting}
            />
            <div style={counterStyle()}>
              {t('hookPredictor.char_counter', { count: text.length })}
            </div>
          </label>

          <label style={labelStyle()}>
            {t('hookPredictor.audience_label')}
            <input
              data-testid="hook-predictor-audience"
              maxLength={AUDIENCE_MAX}
              placeholder={t('hookPredictor.audience_placeholder')}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              style={inputStyle()}
              disabled={submitting}
            />
          </label>

          {error && (
            <div role="alert" style={errorBoxStyle()}>
              <AlertCircle size={14} /> <span>{error}</span>
            </div>
          )}

          {result && (
            <section data-testid="hook-predictor-result" style={resultBoxStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <HookScoreBadge score={result.score} breakdown={result.breakdown} size="lg" />
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 9999,
                    background: result.passes ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                    color: result.passes ? 'var(--success, #22C55E)' : 'var(--danger, #EF4444)',
                    border: `1px solid ${result.passes ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`,
                    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
                  }}>
                    {result.passes ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                    {result.passes ? t('hookPredictor.passes_label') : t('hookPredictor.no_pass_label')}
                    {' · '}{t('hookPredictor.threshold_label')} {result.threshold}
                  </span>
                </div>
                <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>
                  {sourceLabel}
                  {result.confidence ? ` · ${t('hookPredictor.confidence_label')} ${result.confidence}` : ''}
                </span>
              </div>

              <div style={dimsTitleStyle()}>{t('hookPredictor.dimensions_title')}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {DIM_KEYS.map((k) => {
                  const v = result.breakdown?.[k] ?? 0;
                  return (
                    <div key={k} data-testid={`hook-dim-${k}`} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 40px', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                        {t(`studio.hook_score.${k}`)}
                      </span>
                      <div style={{ height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(0, Math.min(100, v))}%`, height: '100%', background: bandColor(v), borderRadius: 9999 }} />
                      </div>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: 'var(--cream)', textAlign: 'right' }}>
                        {Math.round(v)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {result.suggestion && (
                <div data-testid="hook-suggestion" style={suggestionBoxStyle()}>
                  <div style={suggestionTitleStyle()}>{t('hookPredictor.suggestion_title')}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', lineHeight: 1.5 }}>
                    {result.suggestion}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <footer style={footerStyle()}>
          <button
            data-testid="hook-predictor-close"
            onClick={() => !submitting && onClose && onClose()}
            disabled={submitting}
            style={ghostBtn(submitting)}>
            {t('hookPredictor.close')}
          </button>
          <button
            data-testid="hook-predictor-submit"
            onClick={submit}
            disabled={submitting || !text.trim()}
            style={primaryBtn(submitting || !text.trim())}>
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {submitting ? t('hookPredictor.predicting') : t('hookPredictor.predict_btn')}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const overlayStyle = () => ({
  position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 22, zIndex: 1100, backdropFilter: 'blur(6px)',
});
const modalStyle = () => ({
  width: '100%', maxWidth: 600, maxHeight: '88vh', overflow: 'auto',
  padding: 22, borderRadius: 18,
  background: 'rgba(13,16,23,0.96)',
  border: '1px solid rgba(255,255,255,0.10)',
});
const headerStyle = () => ({
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  marginBottom: 16, gap: 10,
});
const titleStyle = () => ({
  margin: 0, fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)',
});
const subtitleStyle = () => ({
  margin: '6px 0 0', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)',
});
const labelStyle = () => ({
  display: 'block', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
  color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
});
const inputStyle = () => ({
  width: '100%', padding: '8px 12px', fontFamily: 'DM Sans', fontSize: 13,
  background: 'rgba(6,8,15,0.5)', border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 9999, color: 'var(--cream)', marginTop: 4,
});
const textareaStyle = () => ({
  width: '100%', padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 13,
  background: 'rgba(6,8,15,0.5)', border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 14, color: 'var(--cream)', marginTop: 4, resize: 'vertical',
  minHeight: 80, lineHeight: 1.5,
});
const counterStyle = () => ({
  fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)',
  marginTop: 4, textAlign: 'right',
});
const errorBoxStyle = () => ({
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
  background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)',
  color: 'var(--danger, #EF4444)', borderRadius: 12,
  fontFamily: 'DM Sans', fontSize: 12.5,
});
const resultBoxStyle = () => ({
  padding: 14, borderRadius: 14,
  background: 'rgba(6,8,15,0.45)', border: '1px solid rgba(255,255,255,0.08)',
});
const dimsTitleStyle = () => ({
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
  color: 'var(--cream-3)', letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: 8,
});
const suggestionBoxStyle = () => ({
  marginTop: 12, padding: 12, borderRadius: 12,
  background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)',
});
const suggestionTitleStyle = () => ({
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
  color: '#F59E0B', letterSpacing: '0.08em', textTransform: 'uppercase',
  marginBottom: 6,
});
const footerStyle = () => ({
  display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18,
});
const primaryBtn = (disabled = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
  background: GRADIENT, border: 'none', color: 'var(--cream, #F0EBE0)',
  borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const ghostBtn = (disabled = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
  color: 'var(--cream-2)', borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const iconCloseBtn = () => ({
  padding: '6px 8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
  color: 'var(--cream-2)', borderRadius: 9999, cursor: 'pointer',
});

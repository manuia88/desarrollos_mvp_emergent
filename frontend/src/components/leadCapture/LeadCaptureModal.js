// W5.x F7 · LeadCaptureModal · listener evento + form + success state
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from 'lucide-react';
import CTAOfferCard from './CTAOfferCard';
import SuccessConfirmation from './SuccessConfirmation';
import { postLeadCapture } from '../../api/lead_capture';

const CREAM = '#F0EBE0';
const ROSE = '#EC4899';
const INDIGO = '#6366F1';
const MUTED = 'rgba(240,235,224,0.62)';
const CARD_BG = 'rgba(13,16,23,0.96)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const CAPTURED_FLAG = 'lead_captured_session';
const SKIP_FLAG_KEY = 'lead_captured_session_skip_until';
const SKIP_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

const inputStyle = {
  width: '100%', padding: '12px 16px', borderRadius: 9999,
  background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.14)',
  color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none',
  transition: `border-color 320ms ${EASE}`,
};

function isSkipped() {
  try {
    if (localStorage.getItem(CAPTURED_FLAG) === '1') return true;
    const until = parseInt(localStorage.getItem(SKIP_FLAG_KEY) || '0', 10) || 0;
    return until > Date.now();
  } catch {
    return false;
  }
}

export default function LeadCaptureModal({
  entityId,
  propertyScope = 'project',
  propertyTitle = '',
  defaultAudience = 'neutral',
  sourcePage = '',
}) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('form'); // 'form' | 'confirmation'
  const [audience, setAudience] = useState(defaultAudience);
  const [behavioralScore, setBehavioralScore] = useState(null);
  const [name, setName] = useState('');
  const [waDigits, setWaDigits] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState(null);

  // Listener evento global
  useEffect(() => {
    const onTrigger = (e) => {
      if (isSkipped()) return;
      const detail = (e && e.detail) || {};
      if (detail.audience) setAudience(detail.audience);
      if (detail.score) setBehavioralScore(detail.score);
      setOpen(true);
    };
    window.addEventListener('lead_capture_trigger', onTrigger);
    return () => window.removeEventListener('lead_capture_trigger', onTrigger);
  }, []);

  // ESC cierra
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    setErr('');
    try {
      // Skip 24h cuando user cierra manualmente sin enviar
      if (step !== 'confirmation') {
        localStorage.setItem(SKIP_FLAG_KEY, String(Date.now() + SKIP_DURATION_MS));
      }
    } catch { /* ignore */ }
  };

  const waValid = useMemo(() => /^\d{10}$/.test(waDigits), [waDigits]);
  const canSubmit = name.trim().length >= 2 && waValid && !submitting;

  const onSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErr('');
    try {
      let sessionId = null;
      try { sessionId = sessionStorage.getItem('visitor_session_id'); } catch { /* ignore */ }
      const r = await postLeadCapture({
        name: name.trim(),
        whatsapp: `+52${waDigits}`,
        property_id: entityId || '',
        property_scope: propertyScope,
        audience,
        source_page: sourcePage || (typeof window !== 'undefined' ? window.location.pathname : ''),
        visitor_session_id: sessionId,
        behavioral_score: behavioralScore,
      });
      setSuccess(r || {});
      setStep('confirmation');
      try { localStorage.setItem(CAPTURED_FLAG, '1'); } catch { /* ignore */ }
    } catch (e2) {
      if (e2?.status === 422) setErr(t('leadCapture.err_invalid_whatsapp'));
      else if (e2?.status === 429) setErr(t('leadCapture.err_rate_limit'));
      else if (e2?.status === 503) setErr(t('leadCapture.err_advisor_unavailable'));
      else setErr(t('leadCapture.err_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div data-testid="lead-capture-modal" role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(8px)',
      display: 'grid', placeItems: 'center', padding: 16,
    }} onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={{
        width: 'min(520px, 100%)', maxHeight: '95vh', overflowY: 'auto',
        background: CARD_BG, border: BORDER, borderRadius: 28, padding: 26,
        backdropFilter: 'blur(24px)', color: CREAM, position: 'relative',
      }}>
        <button
          type="button"
          data-testid="modal-close"
          onClick={handleClose}
          aria-label={t('leadCapture.close_aria')}
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 32, height: 32, borderRadius: 9999,
            background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.14)',
            color: CREAM, cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}
        ><Icons.X size={14} /></button>

        {step === 'form' && (
          <div style={{ display: 'grid', gap: 18 }}>
            <CTAOfferCard audience={audience} propertyTitle={propertyTitle} />
            <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, color: MUTED, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>{t('leadCapture.form_name_label')}</span>
                <input
                  data-testid="lc-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('leadCapture.form_name_placeholder')}
                  maxLength={80}
                  required
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, color: MUTED, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>{t('leadCapture.form_whatsapp_label')}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  <span style={{
                    padding: '12px 14px', borderRadius: 9999,
                    background: 'rgba(99,102,241,0.18)', border: `1px solid ${INDIGO}55`,
                    color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>{t('leadCapture.form_whatsapp_prefix')}</span>
                  <input
                    data-testid="lc-whatsapp"
                    type="tel"
                    inputMode="numeric"
                    value={waDigits}
                    onChange={(e) => setWaDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder={t('leadCapture.form_whatsapp_placeholder')}
                    style={{ ...inputStyle, flex: 1, borderColor: waDigits && !waValid ? ROSE : 'rgba(240,235,224,0.14)' }}
                  />
                </div>
              </label>
              {err && (
                <div data-testid="lc-error" style={{
                  padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(236,72,153,0.12)', border: `1px solid ${ROSE}55`,
                  color: CREAM, fontSize: 12,
                }}>{err}</div>
              )}
              <button
                type="submit"
                data-testid="lc-submit"
                disabled={!canSubmit}
                style={{
                  padding: '14px 22px', borderRadius: 9999, border: 'none',
                  background: GRADIENT, color: '#FFF',
                  fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  opacity: canSubmit ? 1 : 0.45,
                  transition: `transform 320ms ${EASE}, opacity 320ms ${EASE}`,
                }}
              >
                {submitting ? t('leadCapture.loading') : t('leadCapture.btn_submit')}
              </button>
            </form>
          </div>
        )}

        {step === 'confirmation' && success && (
          <SuccessConfirmation
            advisorName={success.advisor_name}
            advisorPhone={success.advisor_phone}
            whatsappLink={success.whatsapp_link}
            pdfUrl={success.pdf_url}
            onClose={handleClose}
          />
        )}
      </div>
    </div>
  );
}

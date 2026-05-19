// W5.22 Z.2.1 — Copy Generator Modal · genera buyer-angle copy con IA antes
// del flujo carrusel. Async job · polling hasta status=ready (8 reintentos · 1.5s).
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sparkles } from 'lucide-react';
import * as z2 from '../../api/studio_z2';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const POLL_MAX_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 1500;
const CONTEXT_MAX = 500;

export default function CopyGeneratorModal({ open, onClose, onCopyGenerated, onError }) {
  const { t } = useTranslation('common');
  const [personas, setPersonas] = useState([]);
  const [discProfiles, setDiscProfiles] = useState([]);
  const [buyerAngle, setBuyerAngle] = useState('inversor');
  const [disc, setDisc] = useState('');
  const [language, setLanguage] = useState('es-MX');
  const [projectId, setProjectId] = useState('');
  const [contextExtra, setContextExtra] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState('idle');

  useEffect(() => {
    if (!open) return;
    z2.getPersonas()
      .then((r) => {
        setPersonas(r.personas || []);
        setDiscProfiles(r.disc_profiles || []);
      })
      .catch(() => {
        // Fallback a constantes locales si endpoint falla
        setPersonas(z2.BUYER_ANGLES.map((k) => ({ key: k, nombre: k })));
        setDiscProfiles(z2.DISC_PROFILES.map((k) => ({ key: k, estilo: k })));
      });
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setBuyerAngle('inversor');
    setDisc('');
    setLanguage('es-MX');
    setProjectId('');
    setContextExtra('');
    setStage('idle');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setStage('generating');
    try {
      const payload = {
        buyer_angle: buyerAngle,
        language,
      };
      if (disc) payload.disc = disc;
      if (projectId.trim()) payload.project_id = projectId.trim();
      if (contextExtra.trim()) payload.context_extra = contextExtra.trim();

      const res = await z2.generateCopy(payload);
      const jobId = res.job_id;
      if (!jobId) throw new Error('No job_id in response');

      // Poll hasta status=ready · max 8 intentos · 1.5s cada uno (~12s total)
      let attempts = 0;
      let final = null;
      while (attempts < POLL_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        attempts += 1;
        let job;
        try {
          job = await z2.getCopyJob(jobId);
        } catch (e) {
          continue;
        }
        if (job?.status === 'ready' || job?.status === 'completed') {
          final = job;
          break;
        }
        if (job?.status === 'failed' || job?.status === 'error') {
          throw new Error(job?.error || t('studio.copy.error_generating'));
        }
      }

      if (final) {
        setStage('done');
        if (onCopyGenerated) onCopyGenerated(jobId, final);
        reset();
        onClose();
      } else {
        // Job aún pendiente · cierra modal y notifica · aparecerá en dropdown cuando termine
        setStage('pending');
        if (onCopyGenerated) onCopyGenerated(jobId, { status: 'pending' });
        reset();
        onClose();
      }
    } catch (e) {
      setSubmitting(false);
      setStage('idle');
      if (onError) onError(e.message || t('studio.copy.error_generating'));
    }
  };

  return (
    <div role="dialog" aria-modal="true" style={overlayStyle()}>
      <div style={modalStyle()} data-testid="copy-generator-modal">
        <header style={headerStyle()}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>
              {t('studio.copy.modal_title')}
            </h2>
            <p style={{ margin: '6px 0 0', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>
              {t('studio.copy.modal_subtitle')}
            </p>
          </div>
          <button onClick={handleClose} disabled={submitting} style={iconCloseBtn()} aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>

        <div style={{ display: 'grid', gap: 14 }}>
          <label style={labelStyle()}>{t('studio.copy.field_buyer_angle')}
            <select
              data-testid="copy-buyer-angle"
              value={buyerAngle}
              onChange={(e) => setBuyerAngle(e.target.value)}
              style={selectStyle()}
              disabled={submitting}>
              {personas.map((p) => (
                <option key={p.key} value={p.key}>{p.nombre}</option>
              ))}
            </select>
          </label>

          <label style={labelStyle()}>{t('studio.copy.field_disc')}
            <select
              data-testid="copy-disc"
              value={disc}
              onChange={(e) => setDisc(e.target.value)}
              style={selectStyle()}
              disabled={submitting}>
              <option value="">— —</option>
              {discProfiles.map((d) => (
                <option key={d.key} value={d.key}>{d.key} · {d.estilo}</option>
              ))}
            </select>
          </label>

          <div>
            <div style={labelStyle()}>{t('studio.copy.field_language')}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['es-MX', 'en-US'].map((lng) => {
                const active = language === lng;
                return (
                  <button
                    key={lng}
                    data-testid={`copy-lang-${lng}`}
                    onClick={() => setLanguage(lng)}
                    disabled={submitting}
                    style={{
                      padding: '6px 14px', borderRadius: 9999,
                      background: active ? GRADIENT : 'transparent',
                      border: active ? 'none' : '1px solid rgba(255,255,255,0.14)',
                      color: active ? 'var(--cream, #F0EBE0)' : 'var(--cream-2)',
                      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}>
                    {lng}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={labelStyle()}>{t('studio.copy.field_project_id')}
            <input
              data-testid="copy-project-id"
              placeholder="proj_xxx"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={inputStyle()}
              disabled={submitting}
            />
          </label>

          <label style={labelStyle()}>
            {t('studio.copy.field_context')}
            <textarea
              data-testid="copy-context"
              maxLength={CONTEXT_MAX}
              rows={4}
              placeholder={t('studio.copy.context_placeholder')}
              value={contextExtra}
              onChange={(e) => setContextExtra(e.target.value)}
              style={textareaStyle()}
              disabled={submitting}
            />
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginTop: 4, textAlign: 'right' }}>
              {contextExtra.length}/{CONTEXT_MAX}
            </div>
          </label>
        </div>

        {stage === 'generating' && (
          <div data-testid="copy-generating-state" style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 12,
            background: 'rgba(99,102,241,0.10)',
            border: '1px solid rgba(99,102,241,0.30)',
            fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)',
          }}>
            {t('studio.copy.generating')}
          </div>
        )}

        <footer style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
          <button onClick={handleClose} disabled={submitting} style={ghostBtn(submitting)}>
            {t('studio.copy.cancel')}
          </button>
          <button
            data-testid="copy-submit"
            onClick={submit}
            disabled={submitting}
            style={primaryBtn(submitting)}>
            <Sparkles size={13} /> {submitting ? t('studio.copy.generating') : t('studio.copy.generate_button')}
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
  width: '100%', maxWidth: 560, maxHeight: '88vh', overflow: 'auto',
  padding: 22, borderRadius: 18,
  background: 'rgba(13,16,23,0.96)',
  border: '1px solid rgba(255,255,255,0.10)',
});
const headerStyle = () => ({
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 10,
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
const selectStyle = () => ({
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

/**
 * W6.5 · DuplicateProjectModal
 * Forks an existing project (wizard JSON) into a new draft.
 * Lets the user set the new name and optionally override key fields.
 */
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { duplicateProject } from '../../api/projectWizard';
import { X, Copy, Check } from '../icons';
import { Z } from '../../styles/zIndex';

const OVERRIDE_FIELDS = ['colonia', 'price_from', 'price_to', 'delivery_date'];

export default function DuplicateProjectModal({ source, onClose, onDuplicated }) {
  const { t } = useTranslation();
  const [newName, setNewName] = useState(source?.name ? `${source.name} (copia)` : '');
  const [overrides, setOverrides] = useState({});
  const [step, setStep] = useState('idle');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const onChangeOverride = useCallback((field, value) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === '' || value === null || value === undefined) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  }, []);

  const onConfirm = useCallback(async () => {
    if (!newName || newName.trim().length < 3) {
      setError(t('projectWizard.errors.nameTooShort', 'Nombre requerido (mínimo 3 caracteres)'));
      return;
    }
    setError(null);
    setStep('submitting');
    try {
      const res = await duplicateProject(source.id, newName.trim(), overrides);
      setResult(res);
      setStep('done');
      if (onDuplicated) onDuplicated(res);
    } catch (e) {
      setError(e.message || t('projectWizard.errors.generic', 'No se pudo duplicar el proyecto'));
      setStep('idle');
    }
  }, [newName, overrides, source, onDuplicated, t]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: Z.MODAL,
      background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="duplicate-project-modal" style={{
        width: '100%', maxWidth: 560,
        background: '#0D1118', border: '1px solid var(--border)',
        borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Copy size={18} color="var(--cream-2)" />
            <div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                {t('projectWizard.modalTitle', 'Duplicar proyecto')}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>
                {source?.name || ''}
              </div>
            </div>
          </div>
          <button onClick={onClose} data-testid="duplicate-close-btn" aria-label="cerrar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
          {step !== 'done' && (
            <>
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--cream-2)' }}>
                  {t('projectWizard.newNameLabel', 'Nombre del nuevo proyecto')}
                </span>
                <input
                  data-testid="duplicate-new-name-input"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('projectWizard.newNamePlaceholder', 'Ej. Polanco Heights Fase 2')}
                  style={{
                    marginTop: 6, width: '100%',
                    background: 'rgba(240,235,224,0.04)', color: 'var(--cream)',
                    border: '1px solid var(--border)', borderRadius: 10,
                    padding: '10px 12px', fontFamily: 'DM Sans', fontSize: 14,
                  }}
                />
              </label>

              <div style={{ marginTop: 8 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--cream-2)', marginBottom: 8 }}>
                  {t('projectWizard.overridesLabel', 'Sobreescribir campos (opcional)')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {OVERRIDE_FIELDS.map((f) => (
                    <label key={f} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{t(`projectWizard.fields.${f}`, f)}</span>
                      <input
                        type="text"
                        value={overrides[f] || ''}
                        onChange={(e) => onChangeOverride(f, e.target.value)}
                        placeholder={String(source?.[f] || '')}
                        style={{
                          background: 'rgba(240,235,224,0.03)', color: 'var(--cream)',
                          border: '1px solid var(--border)', borderRadius: 8,
                          padding: '8px 10px', fontFamily: 'DM Sans', fontSize: 13,
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <div role="alert" style={{
                  marginTop: 14, padding: '10px 12px',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)',
                  borderRadius: 10, color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 13,
                }}>
                  {error}
                </div>
              )}
            </>
          )}

          {step === 'done' && result && (
            <div data-testid="duplicate-success" style={{
              padding: 16, borderRadius: 12,
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.32)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Check size={18} color="#86efac" />
              <div>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14, color: '#86efac' }}>
                  {t('projectWizard.successTitle', 'Proyecto duplicado')}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                  {result.project?.name} · {result.project?.id}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button
            onClick={onClose}
            data-testid="duplicate-cancel-btn"
            style={{
              background: 'transparent', color: 'var(--cream-2)', border: '1px solid var(--border)',
              borderRadius: 999, padding: '8px 16px', fontFamily: 'DM Sans', fontSize: 13,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            {step === 'done' ? t('projectWizard.close', 'Cerrar') : t('projectWizard.cancel', 'Cancelar')}
          </button>
          {step !== 'done' && (
            <button
              onClick={onConfirm}
              disabled={step === 'submitting'}
              data-testid="duplicate-confirm-btn"
              style={{
                background: 'linear-gradient(90deg, var(--cream), var(--cream-2))',
                color: 'var(--navy)', border: 'none',
                borderRadius: 999, padding: '8px 18px', fontFamily: 'DM Sans', fontSize: 13,
                fontWeight: 700, cursor: step === 'submitting' ? 'wait' : 'pointer',
                opacity: step === 'submitting' ? 0.7 : 1,
              }}
            >
              {step === 'submitting'
                ? t('projectWizard.submitting', 'Duplicando…')
                : t('projectWizard.confirm', 'Duplicar')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// RegistrationModal — persuasive lead magnet gate
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ArrowRight, Sparkle } from '../icons';

export default function RegistrationModal({ open, onClose, onLogin, context }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const bullets = t('gate.bullets', { returnObjects: true });
  const safeBullets = Array.isArray(bullets) ? bullets : [];

  return (
    <div
      data-testid="registration-modal"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(6,8,15,0.82)',
        backdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, maxWidth: '100%',
          background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
          border: '1px solid rgba(99,102,241,0.28)',
          borderRadius: 24,
          padding: 32,
          position: 'relative',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        <button onClick={onClose} data-testid="gate-close" className="btn-icon-circle"
          style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={12} />
        </button>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '4px 12px',
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.26)',
          borderRadius: 9999,
          marginBottom: 16,
        }}>
          <Sparkle size={12} color="var(--indigo-3)" />
          <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5, color: 'var(--indigo-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {t('gate.eyebrow')}
          </span>
        </div>

        <h2 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
          color: 'var(--cream)', letterSpacing: '-0.028em',
          lineHeight: 1.1, marginBottom: 10, textWrap: 'balance',
        }}>
          {t('gate.headline')}
        </h2>

        <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 20 }}>
          {t('gate.sub')}
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: 26, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {safeBullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 18, height: 18, flexShrink: 0,
                background: 'var(--grad)', borderRadius: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 2,
              }}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <span style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.55 }}>{b}</span>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onLogin} data-testid="gate-google"
            className="btn btn-primary"
            style={{ justifyContent: 'center', padding: '12px 20px' }}>
            <svg width={14} height={14} viewBox="0 0 24 24">
              <path fill="#fff" d="M22.54 12.28c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/>
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z" opacity=".85"/>
              <path fill="#fff" d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.67-2.84Z" opacity=".7"/>
              <path fill="#fff" d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.46 2.1 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.67 2.84C6.7 7.3 9.13 5.38 12 5.38Z" opacity=".55"/>
            </svg>
            {t('gate.google')}
            <ArrowRight size={12} />
          </button>
          <button onClick={onClose} data-testid="gate-later" className="btn btn-ghost" style={{ justifyContent: 'center' }}>
            {t('gate.later')}
          </button>
        </div>

        {context && (
          <div style={{
            marginTop: 18, padding: '10px 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)',
          }}>
            {context}
          </div>
        )}
      </div>
    </div>
  );
}

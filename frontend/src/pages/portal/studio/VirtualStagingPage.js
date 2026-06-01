// W5.17 · VirtualStagingPage · /portal/studio/staging · flow upload → configure → generating → result
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import StagingUploader from '../../../components/staging/StagingUploader';
import StyleSelector from '../../../components/staging/StyleSelector';
import StagingResultGallery from '../../../components/staging/StagingResultGallery';
import { postVirtualStaging } from '../../../api/virtual_staging';
import PortalLayout from '../../../components/shared/PortalLayout';

const BG = 'var(--bg)';
const CREAM = 'var(--cream)';
const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const MUTED = 'var(--cream-2)';
const MUTED_2 = 'var(--cream-3)';
const CARD_BG = 'var(--surface)';
const BORDER = '1px solid var(--border)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const STEPS = {
  UPLOAD: 'upload',
  CONFIGURE: 'configure',
  GENERATING: 'generating',
  RESULT: 'result',
  ERROR: 'error',
};

const ROOMS = ['sala', 'recamara', 'comedor', 'cocina', 'oficina', 'bano'];

function VirtualStagingPageBody() {
  const { t } = useTranslation('common');
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [image, setImage] = useState(null); // { file, dataUrl, hash }
  const [roomType, setRoomType] = useState('');
  const [styles, setStyles] = useState([]);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const canGenerate = !!roomType && styles.length > 0 && !!image;

  const resetAll = () => {
    setStep(STEPS.UPLOAD);
    setImage(null);
    setRoomType('');
    setStyles([]);
    setResult(null);
    setErrorMsg(null);
  };

  const onImageSelected = (data) => {
    setImage(data);
    setStep(STEPS.CONFIGURE);
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setStep(STEPS.GENERATING);
    setErrorMsg(null);
    try {
      const body = {
        input_image_url: image.dataUrl,
        room_type: roomType,
        styles,
      };
      const r = await postVirtualStaging(body);
      if (!r) {
        setErrorMsg(t('virtualStaging.error_generic', 'No fue posible generar el staging. Intenta de nuevo.'));
        setStep(STEPS.ERROR);
        return;
      }
      setResult(r);
      setStep(STEPS.RESULT);
    } catch (e) {
      const detail = e?.body?.detail || e?.message;
      setErrorMsg(detail || t('virtualStaging.error_generic', 'No fue posible generar el staging. Intenta de nuevo.'));
      setStep(STEPS.ERROR);
    }
  };

  return (
    <div data-testid="virtual-staging-page" data-step={step} style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ padding: '64px 24px 8px', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ letterSpacing: '0.3em', fontSize: 11, color: INDIGO, textTransform: 'uppercase' }}>
          DesarrollosMX · Studio
        </div>
        <h1 style={{
          margin: '12px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800,
          fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.05, color: CREAM, letterSpacing: '-0.02em',
        }}>{t('virtualStaging.page_title', 'Virtual Staging IA')}</h1>
        <p style={{ margin: '10px auto 0', color: MUTED, fontSize: 15, maxWidth: 640, lineHeight: 1.55 }}>
          {t('virtualStaging.page_subtitle', 'Sube foto del cuarto vacio · IA lo amuebla en 30 segundos · 6 estilos disponibles.')}
        </p>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 96px', display: 'grid', gap: 24 }}>
        {step === STEPS.UPLOAD && (
          <section data-testid="vs-step-upload">
            <StagingUploader onImageSelected={onImageSelected} maxSizeMB={10} />
          </section>
        )}

        {step === STEPS.CONFIGURE && image && (
          <section data-testid="vs-step-configure" style={{ display: 'grid', gap: 22 }}>
            {/* Mini preview */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, alignItems: 'center',
              padding: 14, background: CARD_BG, border: BORDER, borderRadius: 18,
            }}>
              <img src={image.dataUrl} alt="" style={{ width: 96, height: 64, borderRadius: 10, objectFit: 'cover' }} />
              <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14, color: CREAM }}>
                  {image.file?.name || 'imagen.jpg'}
                </div>
                <div style={{ fontSize: 11, color: MUTED_2 }}>
                  {image.file?.size ? `${Math.round(image.file.size / 1024)} KB` : ''}
                  {image.hash ? ` · hash ${image.hash}` : ''}
                </div>
              </div>
              <button
                type="button"
                data-testid="vs-change-photo-btn"
                onClick={resetAll}
                style={{
                  padding: '7px 14px', borderRadius: 9999,
                  background: 'transparent', color: CREAM,
                  border: '1px solid var(--border)',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.04em', cursor: 'pointer',
                  transition: `transform 280ms ${EASE}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >{t('virtualStaging.upload_change_btn', 'Cambiar foto')}</button>
            </div>

            {/* Room dropdown */}
            <div>
              <div style={{ fontSize: 11, color: MUTED_2, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>
                {t('virtualStaging.room_label', 'Tipo de habitacion')}
              </div>
              <select
                data-testid="vs-room-select"
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 14,
                  background: CARD_BG, border: BORDER, color: CREAM,
                  fontFamily: 'DM Sans, sans-serif', fontSize: 14,
                  cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="">—</option>
                {ROOMS.map((r) => (
                  <option key={r} value={r}>{t(`virtualStaging.room_${r}`, r)}</option>
                ))}
              </select>
            </div>

            {/* Style selector */}
            <div>
              <div style={{ fontSize: 11, color: MUTED_2, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 10 }}>
                {t('virtualStaging.style_label', 'Estilos (max 3)')}
              </div>
              <StyleSelector selected={styles} onChange={setStyles} maxSelections={3} />
            </div>

            {/* Generate CTA */}
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button
                type="button"
                data-testid="vs-generate-btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{
                  padding: '16px 36px', borderRadius: 9999, border: 'none',
                  background: canGenerate ? GRAD : 'var(--surface-2)',
                  color: canGenerate ? '#FFF' : MUTED_2,
                  fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                  fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: canGenerate ? 'pointer' : 'not-allowed',
                  transition: `transform 320ms ${EASE}, opacity 320ms ${EASE}`,
                  opacity: canGenerate ? 1 : 0.7,
                  boxShadow: canGenerate ? '0 18px 48px -16px rgba(99,102,241,0.6)' : 'none',
                }}
                onMouseEnter={(e) => { if (canGenerate) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >{t('virtualStaging.btn_generate', 'Generar staging')}</button>
            </div>
          </section>
        )}

        {step === STEPS.GENERATING && (
          <section data-testid="vs-step-generating" style={{ display: 'grid', gap: 18 }}>
            <div data-testid="vs-generating-text" style={{
              padding: '14px 18px', borderRadius: 14,
              borderLeft: `3px solid ${INDIGO}`, background: 'rgba(99,102,241,0.06)',
              color: MUTED, fontSize: 13, lineHeight: 1.5,
            }}>
              {t('virtualStaging.generating_text', 'Generando staging con {{count}} estilo(s)... esto tarda 30 segundos aprox.', { count: styles.length })}
            </div>
            <div style={{
              display: 'grid', gap: 16,
              gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, styles.length))}, 1fr)`,
            }}>
              {styles.map((s) => (
                <div key={s} style={{
                  background: CARD_BG, border: BORDER, borderRadius: 24, overflow: 'hidden',
                  height: 320,
                  backgroundImage: 'linear-gradient(90deg, var(--surface-2), var(--surface-2), var(--surface-2))',
                  backgroundSize: '200% 100%', animation: 'vsShimmer 1.4s linear infinite',
                }} />
              ))}
              <style>{`@keyframes vsShimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }`}</style>
            </div>
          </section>
        )}

        {step === STEPS.RESULT && result && (
          <section data-testid="vs-step-result">
            <StagingResultGallery
              result={result}
              originalImageUrl={image?.dataUrl}
              onReset={resetAll}
            />
          </section>
        )}

        {step === STEPS.ERROR && (
          <section data-testid="vs-step-error" style={{
            maxWidth: 560, margin: '0 auto',
            padding: 28, borderRadius: 24,
            background: 'rgba(236,72,153,0.08)',
            border: `1px solid ${ROSE}55`,
            textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 18px', color: CREAM, fontSize: 14 }}>{errorMsg}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                data-testid="vs-error-retry-btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{
                  padding: '10px 22px', borderRadius: 9999, border: 'none',
                  background: GRAD, color: '#FFF',
                  fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 13,
                  letterSpacing: '0.04em', cursor: canGenerate ? 'pointer' : 'not-allowed',
                  opacity: canGenerate ? 1 : 0.6,
                  transition: `transform 280ms ${EASE}`,
                }}
                onMouseEnter={(e) => { if (canGenerate) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >{t('virtualStaging.btn_retry', 'Reintentar')}</button>
              <button
                type="button"
                data-testid="vs-error-reset-btn"
                onClick={resetAll}
                style={{
                  padding: '10px 22px', borderRadius: 9999,
                  background: 'transparent', color: CREAM,
                  border: '1px solid var(--border)',
                  fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 13,
                  letterSpacing: '0.04em', cursor: 'pointer',
                  transition: `transform 280ms ${EASE}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >{t('virtualStaging.btn_start_over', 'Empezar de nuevo')}</button>
            </div>
          </section>
        )}

        <aside
          data-testid="vs-disclaimer"
          style={{
            marginTop: 12, padding: '14px 18px',
            borderLeft: `3px solid ${INDIGO}`, background: 'rgba(99,102,241,0.06)', borderRadius: 12,
            color: MUTED_2, fontSize: 12, fontFamily: 'DM Sans, sans-serif',
          }}
        >{t('virtualStaging.disclaimer', 'El staging es generado por IA · puede mostrar imperfecciones · usa solo como inspiracion o referencia visual.')}</aside>
      </main>
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function VirtualStagingPage(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <VirtualStagingPageBody {...props} />
    </PortalLayout>
  );
}

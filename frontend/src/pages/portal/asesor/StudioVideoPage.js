// W5.16-C · StudioVideoPage · /portal/asesor/studio-video
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ScriptComposer from '../../../components/studio/ScriptComposer';
import VideoRatioPreview from '../../../components/studio/VideoRatioPreview';
import VideoQueueList from '../../../components/studio/VideoQueueList';
import { generateVideo } from '../../../api/studioVideo';
import HookPredictorModal from '../../../components/hook/HookPredictorModal';
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

const PROVIDERS = [
  { value: 'auto', label_key: 'studioVideo.provider_auto' },
  { value: 'luma', label_key: 'studioVideo.provider_luma' },
  { value: 'pika', label_key: 'studioVideo.provider_pika' },
  { value: 'runway', label_key: 'studioVideo.provider_runway' },
];

const URL_RX = /^https?:\/\/.+/i;

function StudioVideoPageBody() {
  const { t } = useTranslation('common');
  const [script, setScript] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [provider, setProvider] = useState('auto');
  const [duration, setDuration] = useState(8);
  const [loading, setLoading] = useState(false);
  const [latestTask, setLatestTask] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [hookModalOpen, setHookModalOpen] = useState(false);

  const imageValid = !!imageUrl && URL_RX.test(imageUrl);
  const scriptValid = !!script && script.trim().length >= 8;
  const canGenerate = scriptValid && imageValid && !loading;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const r = await generateVideo({
        script: script.trim(),
        image_url: imageUrl,
        provider,
        duration_sec: duration,
      });
      setLatestTask(r);
      setQueueRefreshKey((k) => k + 1);
    } catch (e) {
      setErrorMsg(e?.body?.detail || e?.message || t('studioVideo.errorGeneric', 'No fue posible generar el video. Intenta de nuevo.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = (task) => {
    if (task?.script) setScript(task.script);
    if (task?.image_url) setImageUrl(task.image_url);
    if (task?.provider) setProvider(task.provider);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div data-testid="studio-video-page" style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ padding: '64px 24px 16px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ letterSpacing: '0.3em', fontSize: 11, color: INDIGO, textTransform: 'uppercase' }}>
          DesarrollosMX · Studio
        </div>
        <h1 style={{
          margin: '12px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800,
          fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.05, color: CREAM, letterSpacing: '-0.02em',
        }}>{t('studioVideo.title', 'Studio Video')}</h1>
        <p style={{ margin: '10px 0 0', color: MUTED, fontSize: 15, maxWidth: 640, lineHeight: 1.55 }}>
          {t('studioVideo.subtitle', 'Genera reels y stories desde tu propiedad.')}
        </p>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '8px 24px 96px', display: 'grid', gap: 24 }}>
        {/* 3 columnas desktop · stacked mobile */}
        <section
          data-testid="svp-builder"
          style={{
            display: 'grid', gap: 18,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {/* Col 1: ScriptComposer + Hook Predictor trigger (W5.22 Z.5) */}
          <div style={{ gridColumn: 'span 1', minWidth: 0 }}>
            <ScriptComposer value={script} onChange={setScript} />
            <button
              type="button"
              data-testid="svp-hook-predictor-open"
              onClick={() => setHookModalOpen(true)}
              style={{
                marginTop: 10, padding: '7px 14px', borderRadius: 9999,
                background: 'transparent', color: CREAM,
                border: '1px solid var(--border)',
                fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}>
              {t('hookPredictor.title', 'Predecir hook')}
            </button>
          </div>

          {/* Col 2: Image URL + preview */}
          <div data-testid="svp-image-col" style={{
            background: CARD_BG, border: BORDER, borderRadius: 20, padding: 18,
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            display: 'grid', gap: 12, minWidth: 0,
          }}>
            <div style={{ fontSize: 11, color: MUTED_2, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
              {t('studioVideo.imageUrlLabel', 'Imagen de la propiedad')}
            </div>
            <input
              data-testid="svp-image-url-input"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 12,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 13,
                outline: 'none',
              }}
            />
            <div style={{
              width: '100%', aspectRatio: '1 / 1', maxWidth: 220,
              borderRadius: 14, overflow: 'hidden',
              background: 'var(--surface-2)', border: BORDER,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto',
            }}>
              {imageValid ? (
                <img
                  data-testid="svp-image-preview"
                  src={imageUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <span style={{ color: MUTED_2, fontSize: 12 }}>{t('studioVideo.imagePreviewEmpty', 'Preview aparece aqui')}</span>
              )}
            </div>
          </div>

          {/* Col 3: Provider + duration + CTA */}
          <div data-testid="svp-config-col" style={{
            background: CARD_BG, border: BORDER, borderRadius: 20, padding: 18,
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            display: 'grid', gap: 14, minWidth: 0,
          }}>
            <div>
              <div style={{ fontSize: 11, color: MUTED_2, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
                {t('studioVideo.providerLabel', 'Proveedor de IA')}
              </div>
              <select
                data-testid="svp-provider-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={{
                  width: '100%', padding: '11px 12px', borderRadius: 12,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 13,
                  outline: 'none', cursor: 'pointer',
                }}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{t(p.label_key, p.value)}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, color: MUTED_2, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
                <span>{t('studioVideo.durationLabel', 'Duracion')}</span>
                <span style={{ color: CREAM, fontVariantNumeric: 'tabular-nums', letterSpacing: 'normal', textTransform: 'none', fontWeight: 700 }}>{duration}s</span>
              </div>
              <input
                data-testid="svp-duration-slider"
                type="range"
                min={3}
                max={15}
                step={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                style={{ width: '100%', accentColor: INDIGO, cursor: 'pointer' }}
              />
            </div>

            <button
              type="button"
              data-testid="svp-generate-btn"
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{
                marginTop: 6,
                padding: '14px 22px', borderRadius: 9999, border: 'none',
                background: canGenerate ? GRAD : 'var(--surface-2)',
                color: canGenerate ? '#FFF' : MUTED_2,
                fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: canGenerate ? 'pointer' : 'not-allowed',
                opacity: canGenerate ? 1 : 0.7,
                transition: `transform 280ms ${EASE}`,
                boxShadow: canGenerate ? '0 18px 48px -16px rgba(99,102,241,0.55)' : 'none',
              }}
              onMouseEnter={(e) => { if (canGenerate) e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >{loading ? t('studioVideo.loading', 'Procesando...') : t('studioVideo.generateCTA', 'Generar Video')}</button>

            {loading && (
              <p data-testid="svp-loading-text" style={{ margin: 0, fontSize: 12, color: MUTED, textAlign: 'center' }}>
                {t('studioVideo.loadingHint', 'Este proceso toma ~30s')}
              </p>
            )}

            {errorMsg && (
              <p data-testid="svp-error-text" style={{
                margin: 0, padding: '8px 12px',
                background: 'rgba(236,72,153,0.10)',
                border: `1px solid ${ROSE}55`, borderRadius: 10,
                color: '#F9A8D4', fontSize: 12, lineHeight: 1.5,
              }}>{errorMsg}</p>
            )}
          </div>
        </section>

        {/* Latest preview */}
        {latestTask?.ratios && (
          <section data-testid="svp-latest-result">
            <VideoRatioPreview
              task_id={latestTask.task_id}
              ratios={latestTask.ratios}
              is_stub={!!latestTask.is_stub}
              scriptHint={script}
            />
          </section>
        )}

        {/* Queue */}
        <section data-testid="svp-queue-section">
          <VideoQueueList refreshKey={queueRefreshKey} onRegenerate={handleRegenerate} />
        </section>

        <aside data-testid="svp-disclaimer" style={{
          padding: '14px 18px',
          borderLeft: `3px solid ${INDIGO}`, background: 'rgba(99,102,241,0.06)', borderRadius: 12,
          color: MUTED_2, fontSize: 12,
        }}>{t('studioVideo.disclaimer', 'Los videos son generados por IA · usalos como inspiracion · revisa siempre el resultado antes de publicar.')}</aside>
      </main>
      <HookPredictorModal
        open={hookModalOpen}
        onClose={() => setHookModalOpen(false)}
        initialText={script}
      />
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function StudioVideoPage(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <StudioVideoPageBody {...props} />
    </PortalLayout>
  );
}

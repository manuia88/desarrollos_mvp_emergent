// W5.22 Z.4 · VideoStandalonePage · /portal/asesor/video-standalone
// Standalone creator · reusa W5.16 bundle · queue robust + export pipeline + Hook Predictor gate.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, AlertTriangle } from 'lucide-react';

import ScriptComposer from '../../../components/studio/ScriptComposer';
import VideoRatioPreview from '../../../components/studio/VideoRatioPreview';
import HookPredictorModal from '../../../components/hook/HookPredictorModal';
import VideoQueueRobust from '../../../components/video/VideoQueueRobust';
import VideoExportModal from '../../../components/video/VideoExportModal';
import { generateStandaloneVideo } from '../../../api/videoStandalone';
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
  { value: 'auto', i18n: 'videoStandalone.provider_auto' },
  { value: 'luma', i18n: 'videoStandalone.provider_luma' },
  { value: 'pika', i18n: 'videoStandalone.provider_pika' },
  { value: 'runway', i18n: 'videoStandalone.provider_runway' },
  { value: 'replicate_kling', i18n: 'videoStandalone.provider_kling' },
];
const DURATIONS = [30, 60, 90];
const AUDIENCES = ['neutral', 'investor', 'family', 'first_home', 'luxury', 'boutique', 'urgent'];
const URL_RX = /^https?:\/\/.+/i;

const labelStyle = { fontSize: 11, color: MUTED_2, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 };
const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 12, background: 'var(--surface-2)',
  border: '1px solid var(--border)', color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 13, outline: 'none',
};

function VideoStandalonePageBody() {
  const { t } = useTranslation('common');
  const [script, setScript] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [provider, setProvider] = useState('auto');
  const [audience, setAudience] = useState('neutral');
  const [duration, setDuration] = useState(60);
  const [hookCheck, setHookCheck] = useState(true);
  const [loading, setLoading] = useState(false);
  const [latest, setLatest] = useState(null);
  const [hookWarning, setHookWarning] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [hookModalOpen, setHookModalOpen] = useState(false);
  const [exportVideo, setExportVideo] = useState(null);

  const imageValid = !imageUrl || URL_RX.test(imageUrl);
  const scriptValid = !!script && script.trim().length >= 8;
  const canGenerate = scriptValid && imageValid && !loading;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setErrorMsg(null);
    setHookWarning(null);
    try {
      const r = await generateStandaloneVideo({
        script: script.trim(),
        image_url: imageUrl || null,
        provider: provider === 'auto' ? null : provider,
        audience,
        duration_sec: duration,
        hook_check: hookCheck,
      });
      setLatest({ ...r, script: script.trim() });
      if (r?.hook_check?.warning) setHookWarning(r.hook_check);
      setQueueRefreshKey((k) => k + 1);
    } catch (e) {
      const detail = e?.body?.detail;
      const suggestion = detail?.retry_suggestion;
      setErrorMsg(suggestion || detail?.reason || detail || e?.message ||
        t('videoStandalone.errorGeneric', 'No fue posible generar el video. Intenta de nuevo.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = (job) => {
    if (job?.script) setScript(job.script);
    if (job?.image_url) setImageUrl(job.image_url);
    if (job?.provider_preferred) setProvider(job.provider_preferred);
    if (job?.duration_sec) setDuration(job.duration_sec);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openExport = (jobOrLatest) => {
    setExportVideo({
      video_id: jobOrLatest.video_id,
      ratios: jobOrLatest.ratios || {},
      master_url: jobOrLatest.master_url,
      script: jobOrLatest.script || script,
      is_stub: !!jobOrLatest.is_stub,
    });
  };

  return (
    <div data-testid="video-standalone-page" style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ padding: '64px 24px 16px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ letterSpacing: '0.3em', fontSize: 11, color: INDIGO, textTransform: 'uppercase' }}>
          DesarrollosMX · Studio
        </div>
        <h1 style={{
          margin: '12px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800,
          fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.05, color: CREAM, letterSpacing: '-0.02em',
        }}>{t('videoStandalone.title', 'Studio Video · Standalone')}</h1>
        <p style={{ margin: '10px 0 0', color: MUTED, fontSize: 15, maxWidth: 640, lineHeight: 1.55 }}>
          {t('videoStandalone.subtitle', 'Crea videos profesionales · cualquier momento · cualquier proyecto.')}
        </p>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '8px 24px 96px', display: 'grid', gap: 24 }}>
        <section
          data-testid="vsp-builder"
          style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
        >
          {/* Col 1 (40%) · ScriptComposer + Hook Predictor */}
          <div style={{ gridColumn: 'span 1', minWidth: 0 }}>
            <ScriptComposer value={script} onChange={setScript} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                data-testid="vsp-hook-predictor-open"
                onClick={() => setHookModalOpen(true)}
                style={{
                  padding: '7px 14px', borderRadius: 9999, background: 'transparent', color: CREAM,
                  border: '1px solid var(--border)', fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                <Sparkles size={13} /> {t('videoStandalone.predictHook', 'Predecir hook')}
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED, cursor: 'pointer' }}>
                <input type="checkbox" data-testid="vsp-hook-check" checked={hookCheck} onChange={(e) => setHookCheck(e.target.checked)} style={{ accentColor: INDIGO }} />
                {t('videoStandalone.hookGate', 'Verificar hook al generar')}
              </label>
            </div>
          </div>

          {/* Col 2 (30%) · Image URL + preview */}
          <div data-testid="vsp-image-col" style={{
            background: CARD_BG, border: BORDER, borderRadius: 20, padding: 18,
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', display: 'grid', gap: 12, minWidth: 0,
          }}>
            <div style={labelStyle}>{t('videoStandalone.imageUrlLabel', 'Imagen de la propiedad')}</div>
            <input
              data-testid="vsp-image-url-input" type="url" value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." style={inputStyle}
            />
            {!imageValid && (
              <span style={{ fontSize: 11, color: '#F9A8D4' }}>{t('videoStandalone.imageInvalid', 'URL inválida (debe iniciar con http).')}</span>
            )}
            <div style={{
              width: '100%', aspectRatio: '1 / 1', maxWidth: 220, borderRadius: 14, overflow: 'hidden',
              background: 'var(--surface-2)', border: BORDER,
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
            }}>
              {imageUrl && URL_RX.test(imageUrl) ? (
                <img data-testid="vsp-image-preview" src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <span style={{ color: MUTED_2, fontSize: 12 }}>{t('videoStandalone.imagePreviewEmpty', 'Preview aparece aquí')}</span>
              )}
            </div>
          </div>

          {/* Col 3 (30%) · Provider + duration + audience + CTA */}
          <div data-testid="vsp-config-col" style={{
            background: CARD_BG, border: BORDER, borderRadius: 20, padding: 18,
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', display: 'grid', gap: 14, minWidth: 0,
          }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 8 }}>{t('videoStandalone.providerLabel', 'Proveedor de IA')}</div>
              <select data-testid="vsp-provider-select" value={provider} onChange={(e) => setProvider(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{t(p.i18n, p.value)}</option>)}
              </select>
            </div>

            <div>
              <div style={{ ...labelStyle, marginBottom: 8 }}>{t('videoStandalone.audienceLabel', 'Audiencia')}</div>
              <select data-testid="vsp-audience-select" value={audience} onChange={(e) => setAudience(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {AUDIENCES.map((a) => <option key={a} value={a}>{t(`videoStandalone.audience.${a}`, a)}</option>)}
              </select>
            </div>

            <div>
              <div style={{ ...labelStyle, marginBottom: 8 }}>{t('videoStandalone.durationLabel', 'Duración')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {DURATIONS.map((d) => (
                  <button key={d} type="button" data-testid={`vsp-duration-${d}`} onClick={() => setDuration(d)} style={{
                    flex: 1, padding: '10px 0', borderRadius: 9999, cursor: 'pointer',
                    background: duration === d ? 'rgba(99,102,241,0.18)' : 'transparent',
                    border: `1px solid ${duration === d ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                    color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700,
                  }}>{d}s</button>
                ))}
              </div>
            </div>

            <button
              type="button" data-testid="vsp-generate-btn" onClick={handleGenerate} disabled={!canGenerate}
              style={{
                marginTop: 6, padding: '14px 22px', borderRadius: 9999, border: 'none',
                background: canGenerate ? GRAD : 'var(--surface-2)',
                color: canGenerate ? '#FFF' : MUTED_2, fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: canGenerate ? 'pointer' : 'not-allowed', opacity: canGenerate ? 1 : 0.7,
                transition: `transform 280ms ${EASE}`,
                boxShadow: canGenerate ? '0 18px 48px -16px rgba(99,102,241,0.55)' : 'none',
              }}
              onMouseEnter={(e) => { if (canGenerate) e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >{loading ? t('videoStandalone.loading', 'Procesando...') : t('videoStandalone.generateCTA', 'Generar Video')}</button>

            {loading && (
              <p data-testid="vsp-loading-text" style={{ margin: 0, fontSize: 12, color: MUTED, textAlign: 'center' }}>
                {t('videoStandalone.loadingHint', 'Reintenta automáticamente si un proveedor falla (~30s)')}
              </p>
            )}
            {errorMsg && (
              <p data-testid="vsp-error-text" style={{
                margin: 0, padding: '8px 12px', background: 'rgba(236,72,153,0.10)',
                border: `1px solid ${ROSE}55`, borderRadius: 10, color: '#F9A8D4', fontSize: 12, lineHeight: 1.5,
              }}>{errorMsg}</p>
            )}
          </div>
        </section>

        {/* Hook warning (gate score<60 · informativo) */}
        {hookWarning?.warning && (
          <aside data-testid="vsp-hook-warning" style={{
            display: 'flex', gap: 10, padding: '12px 16px', borderRadius: 12,
            background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#FBBF24',
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700 }}>{hookWarning.warning}</div>
              {hookWarning.suggestion && <div style={{ marginTop: 4, color: MUTED }}>{hookWarning.suggestion}</div>}
            </div>
          </aside>
        )}

        {/* Latest result */}
        {latest?.ratios && (
          <section data-testid="vsp-latest-result" style={{ display: 'grid', gap: 12 }}>
            <VideoRatioPreview task_id={latest.video_id} ratios={latest.ratios} is_stub={!!latest.is_stub} scriptHint={script} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" data-testid="vsp-export-latest" onClick={() => openExport(latest)} style={{
                padding: '9px 18px', borderRadius: 9999, background: 'transparent', color: CREAM,
                border: '1px solid var(--border)', fontFamily: 'DM Sans, sans-serif',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}>{t('videoStandalone.exportLatest', 'Exportar este video')}</button>
            </div>
          </section>
        )}

        {/* Queue robust */}
        <section data-testid="vsp-queue-section">
          <VideoQueueRobust
            refreshKey={queueRefreshKey}
            onRegenerate={handleRegenerate}
            onExport={openExport}
            onView={openExport}
          />
        </section>

        <aside data-testid="vsp-disclaimer" style={{
          padding: '14px 18px', borderLeft: `3px solid ${INDIGO}`, background: 'rgba(99,102,241,0.06)',
          borderRadius: 12, color: MUTED_2, fontSize: 12,
        }}>{t('videoStandalone.disclaimer', 'Los videos son generados por IA · úsalos como inspiración · revisa siempre el resultado antes de publicar.')}</aside>
      </main>

      <HookPredictorModal open={hookModalOpen} onClose={() => setHookModalOpen(false)} initialText={script} />
      <VideoExportModal open={!!exportVideo} onClose={() => setExportVideo(null)} video={exportVideo} />
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function VideoStandalonePage(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <VideoStandalonePageBody {...props} />
    </PortalLayout>
  );
}

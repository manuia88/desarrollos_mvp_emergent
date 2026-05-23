// W5.16-C Sub-B · VideoRatioPreview · 3 tabs ratio + descargar + WhatsApp share
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const WA_GREEN = '#25D366';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const TABS = [
  { ratio: '1:1', i18n: 'studioVideo.tabs.reel', wrap: { aspectRatio: '1 / 1', maxWidth: 420 } },
  { ratio: '9:16', i18n: 'studioVideo.tabs.stories', wrap: { aspectRatio: '9 / 16', maxWidth: 280 } },
  { ratio: '16:9', i18n: 'studioVideo.tabs.youtube', wrap: { aspectRatio: '16 / 9', maxWidth: 720 } },
];

function isStubUrl(u) {
  return typeof u === 'string' && u.startsWith('stub://');
}

async function downloadUrl(url, filename) {
  try {
    if (isStubUrl(url)) return;
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error('download_failed');
    const blob = await r.blob();
    const obj = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = obj;
    a.download = filename || `video-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(obj);
  } catch {
    if (!isStubUrl(url)) window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function VideoRatioPreview({ task_id, ratios = {}, is_stub = false, scriptHint = '' }) {
  const { t } = useTranslation('common');
  const [activeRatio, setActiveRatio] = useState(TABS[0].ratio);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  const active = TABS.find((tt) => tt.ratio === activeRatio) || TABS[0];
  const activeUrl = ratios[activeRatio];
  const stubActive = is_stub || isStubUrl(activeUrl);

  const openShare = () => {
    setShareMsg(scriptHint ? `${scriptHint}\n\n${activeUrl}` : `${activeUrl}`);
    setShareOpen(true);
  };

  const sendWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareMsg || activeUrl || '')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setShareOpen(false);
  };

  return (
    <section
      data-testid="video-ratio-preview"
      data-task-id={task_id || ''}
      data-stub={stubActive ? 'true' : 'false'}
      style={{
        background: CARD_BG, border: BORDER, borderRadius: 24, padding: 20,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        fontFamily: 'DM Sans, sans-serif', color: CREAM,
        display: 'grid', gap: 14,
      }}
    >
      {/* Tabs gradient underline */}
      <div role="tablist" data-testid="vrp-tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, borderBottom: BORDER }}>
        {TABS.map((tab) => {
          const isActive = tab.ratio === activeRatio;
          return (
            <button
              key={tab.ratio}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`vrp-tab-${tab.ratio.replace(':', 'x')}`}
              onClick={() => setActiveRatio(tab.ratio)}
              style={{
                position: 'relative',
                padding: '10px 16px',
                background: 'transparent',
                border: 'none',
                color: isActive ? CREAM : MUTED,
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 13, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                cursor: 'pointer',
                transition: `color 280ms ${EASE}`,
              }}
            >
              {t(tab.i18n)}
              {isActive && (
                <span aria-hidden="true" style={{
                  position: 'absolute', left: 8, right: 8, bottom: -1, height: 2,
                  background: GRAD, borderRadius: 9999,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Stub banner */}
      {stubActive && (
        <div data-testid="vrp-stub-banner" style={{
          padding: '10px 14px', borderRadius: 12,
          background: 'rgba(245,158,11,0.10)',
          border: '1px solid rgba(245,158,11,0.35)',
          color: '#FBBF24', fontSize: 12.5, lineHeight: 1.5,
        }}>{t('studioVideo.stubBanner', 'Modo demo: video no real, sin creditos consumidos.')}</div>
      )}

      {/* Player */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          data-testid="vrp-player-wrap"
          data-ratio={active.ratio}
          style={{
            ...active.wrap, width: '100%',
            borderRadius: 18, overflow: 'hidden',
            background: 'rgba(240,235,224,0.04)',
            border: BORDER,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {stubActive ? (
            <div style={{
              textAlign: 'center', padding: 18, color: MUTED,
            }}>
              <div style={{
                fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, color: CREAM,
                letterSpacing: '-0.02em', marginBottom: 6,
              }}>{t('studioVideo.stubPlayerTitle', 'Video demo')}</div>
              <div style={{ fontSize: 12 }}>{active.ratio}</div>
            </div>
          ) : (
            <video
              data-testid="vrp-player"
              src={activeUrl}
              controls
              preload="metadata"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>
      </div>

      {/* Actions */}
      <footer style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="vrp-download-btn"
          onClick={() => downloadUrl(activeUrl, `video-${active.ratio.replace(':', 'x')}.mp4`)}
          disabled={stubActive}
          style={{
            padding: '8px 16px', borderRadius: 9999,
            background: 'transparent', color: stubActive ? MUTED_2 : CREAM,
            border: `1px solid ${stubActive ? 'rgba(240,235,224,0.10)' : 'rgba(240,235,224,0.30)'}`,
            fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700,
            letterSpacing: '0.04em', cursor: stubActive ? 'not-allowed' : 'pointer',
            opacity: stubActive ? 0.55 : 1,
            transition: `transform 280ms ${EASE}`,
          }}
          onMouseEnter={(e) => { if (!stubActive) e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >{t('studioVideo.downloadCTA', 'Descargar')}</button>

        <button
          type="button"
          data-testid="vrp-whatsapp-btn"
          onClick={openShare}
          disabled={stubActive}
          style={{
            padding: '8px 16px', borderRadius: 9999, border: '1px solid transparent',
            background: stubActive ? 'rgba(37,211,102,0.20)' : WA_GREEN,
            color: '#FFF',
            fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700,
            letterSpacing: '0.04em', cursor: stubActive ? 'not-allowed' : 'pointer',
            opacity: stubActive ? 0.55 : 1,
            transition: `transform 280ms ${EASE}`,
          }}
          onMouseEnter={(e) => { if (!stubActive) e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >{t('studioVideo.shareWhatsApp', 'Compartir a WhatsApp')}</button>
      </footer>

      {/* Share modal */}
      {shareOpen && (
        <div
          data-testid="vrp-share-modal"
          role="dialog"
          aria-label={t('studioVideo.shareWhatsApp', 'Compartir a WhatsApp')}
          onClick={() => setShareOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'rgba(6,8,15,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: CARD_BG, border: BORDER, borderRadius: 24, padding: 22,
              maxWidth: 480, width: '100%', display: 'grid', gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18, color: CREAM, letterSpacing: '-0.01em' }}>
              {t('studioVideo.shareWhatsApp', 'Compartir a WhatsApp')}
            </h3>
            <textarea
              data-testid="vrp-share-textarea"
              rows={5}
              value={shareMsg}
              onChange={(e) => setShareMsg(e.target.value)}
              style={{
                width: '100%', padding: 12, borderRadius: 12,
                background: 'rgba(240,235,224,0.04)',
                border: '1px solid rgba(240,235,224,0.12)',
                color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.5,
                outline: 'none', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                style={{
                  padding: '8px 16px', borderRadius: 9999,
                  background: 'transparent', color: CREAM,
                  border: '1px solid rgba(240,235,224,0.30)',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >{t('studioVideo.cancel', 'Cancelar')}</button>
              <button
                type="button"
                data-testid="vrp-share-send-btn"
                onClick={sendWhatsApp}
                style={{
                  padding: '8px 18px', borderRadius: 9999, border: 'none',
                  background: WA_GREEN, color: '#FFF',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >{t('studioVideo.sendNow', 'Enviar')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

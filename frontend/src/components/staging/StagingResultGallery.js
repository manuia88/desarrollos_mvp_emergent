// W5.17 · StagingResultGallery · variaciones lado a lado + descargar/usar
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

async function downloadUrl(url, filename) {
  try {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error('download_failed');
    const blob = await r.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || `staging-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function StagingResultGallery({ result, originalImageUrl, onReset, onUse }) {
  const { t } = useTranslation('common');
  const [compareOpen, setCompareOpen] = useState(false);
  const images = Array.isArray(result?.staged_images) ? result.staged_images : [];

  if (images.length === 0) {
    return (
      <section data-testid="staging-result-empty" style={{
        padding: 28, borderRadius: 24, border: BORDER, background: CARD_BG,
        color: MUTED, textAlign: 'center', fontFamily: 'DM Sans, sans-serif',
      }}>{t('virtualStaging.error_generic', 'No se generaron imagenes. Intenta de nuevo.')}</section>
    );
  }

  return (
    <section data-testid="staging-result-gallery" style={{ display: 'grid', gap: 18, fontFamily: 'DM Sans, sans-serif', color: CREAM }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{
          margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800,
          fontSize: 22, color: CREAM, letterSpacing: '-0.02em',
        }}>{t('virtualStaging.result_title', 'Staging generado')}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {result?.cached && (
            <span
              data-testid="staging-cached-chip"
              style={{
                padding: '3px 10px', borderRadius: 9999,
                background: 'rgba(99,102,241,0.14)', color: '#C7D2FE',
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                border: `1px solid ${INDIGO}55`,
              }}
            >{t('virtualStaging.result_cached_chip', 'Cache hit')}</span>
          )}
          {originalImageUrl && (
            <button
              type="button"
              data-testid="staging-view-original-btn"
              onClick={() => setCompareOpen(true)}
              style={{
                padding: '6px 14px', borderRadius: 9999,
                background: 'transparent', color: CREAM,
                border: '1px solid rgba(240,235,224,0.20)',
                fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em', cursor: 'pointer',
                transition: `transform 280ms ${EASE}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >{t('virtualStaging.btn_view_original', 'Ver original')}</button>
          )}
        </div>
      </header>

      {/* Grid */}
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: `repeat(auto-fit, minmax(${images.length === 1 ? '320px' : '260px'}, 1fr))`,
      }}>
        {images.map((img, idx) => {
          const ms = Number(img.processing_ms) || 0;
          return (
            <article
              key={`${img.style}-${idx}`}
              data-testid={`staging-result-card-${img.style}`}
              style={{
                background: CARD_BG, border: BORDER, borderRadius: 24, overflow: 'hidden',
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                display: 'grid', gridTemplateRows: 'auto auto 1fr auto',
                transition: `transform 320ms ${EASE}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {img.url ? (
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{
                  width: '100%', aspectRatio: '4 / 3',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.18))',
                }} />
              )}

              <div style={{
                padding: '10px 18px 4px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                borderTop: BORDER,
              }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 9999,
                  background: 'rgba(99,102,241,0.10)', color: '#C7D2FE',
                  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  border: `1px solid ${INDIGO}55`,
                }}>{t(`virtualStaging.style_${img.style}`, img.style)}</span>
                {ms > 0 && (
                  <span style={{ fontSize: 11, color: MUTED_2 }}>{Math.round(ms)}ms</span>
                )}
              </div>

              <div /* spacer */ />

              <footer style={{ padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  data-testid={`staging-download-${img.style}`}
                  onClick={() => downloadUrl(img.url, `staging-${img.style}-${Date.now()}.jpg`)}
                  style={{
                    flex: 1,
                    padding: '8px 14px', borderRadius: 9999,
                    background: 'transparent', color: CREAM,
                    border: '1px solid rgba(240,235,224,0.20)',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700,
                    letterSpacing: '0.04em', cursor: 'pointer',
                    transition: `transform 280ms ${EASE}`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >{t('virtualStaging.btn_download', 'Descargar')}</button>
                <button
                  type="button"
                  data-testid={`staging-use-${img.style}`}
                  onClick={() => { if (typeof onUse === 'function') onUse(img); }}
                  style={{
                    flex: 1,
                    padding: '8px 14px', borderRadius: 9999,
                    background: GRAD, color: '#FFF', border: '1px solid transparent',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700,
                    letterSpacing: '0.04em', cursor: 'pointer',
                    transition: `transform 280ms ${EASE}`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >{t('virtualStaging.btn_use', 'Usar este')}</button>
              </footer>
            </article>
          );
        })}
      </div>

      {/* Footer */}
      <footer style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        paddingTop: 4,
      }}>
        <span style={{ color: MUTED_2, fontSize: 11 }}>
          {images[0]?.model_used ? `Model: ${images[0].model_used}` : ''}
          {result?.processing_ms_total ? ` · ${Math.round(result.processing_ms_total)}ms` : ''}
        </span>
        <button
          type="button"
          data-testid="staging-generate-another-btn"
          onClick={onReset}
          style={{
            padding: '10px 22px', borderRadius: 9999,
            background: GRAD, color: '#FFF', border: 'none',
            fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 13,
            letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
            transition: `transform 280ms ${EASE}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >{t('virtualStaging.btn_generate_another', 'Generar otro')}</button>
      </footer>

      {/* Compare modal */}
      {compareOpen && originalImageUrl && (
        <div
          data-testid="staging-compare-modal"
          role="dialog"
          aria-label={t('virtualStaging.btn_view_original', 'Ver original')}
          onClick={() => setCompareOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'rgba(6,8,15,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: CARD_BG, border: BORDER, borderRadius: 24, padding: 18,
              maxWidth: 1080, width: '100%',
              display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            }}
          >
            <figure style={{ margin: 0 }}>
              <img src={originalImageUrl} alt="" style={{ width: '100%', borderRadius: 16, display: 'block', aspectRatio: '4/3', objectFit: 'cover' }} />
              <figcaption style={{ marginTop: 8, color: MUTED, fontSize: 12, textAlign: 'center', letterSpacing: '0.10em', textTransform: 'uppercase' }}>Original</figcaption>
            </figure>
            <figure style={{ margin: 0 }}>
              <img src={images[0]?.url} alt="" style={{ width: '100%', borderRadius: 16, display: 'block', aspectRatio: '4/3', objectFit: 'cover' }} />
              <figcaption style={{ marginTop: 8, color: MUTED, fontSize: 12, textAlign: 'center', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                {t(`virtualStaging.style_${images[0]?.style}`, images[0]?.style || 'staged')}
              </figcaption>
            </figure>
          </div>
        </div>
      )}
    </section>
  );
}

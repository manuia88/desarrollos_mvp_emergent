// W5.22 Z.2 Sub-D — Carrusel live preview · canvas mock per aspect ratio.
// Debounced 500ms re-render · consume brand_kit activo · NO requiere backend render.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ASPECT_RATIOS, RATIO_DIMS } from '../../api/studio_z2';

const GRADIENT = 'linear-gradient(135deg, #6366F1 0%, #EC4899 100%)';

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function fitContain(parent, w, h, maxH = 360) {
  // Returns the rendered dimensions that fit inside the parent box (max maxH px tall)
  const aspect = w / h;
  let outH = Math.min(maxH, h * 0.55);
  let outW = outH * aspect;
  if (outW > parent) {
    outW = parent;
    outH = outW / aspect;
  }
  return { outW: Math.round(outW), outH: Math.round(outH) };
}

export default function CarruselPreviewLive({ pages, brandKit, initialRatio = '1:1' }) {
  const { t } = useTranslation('common');
  const [activeRatio, setActiveRatio] = useState(initialRatio);
  const [pageIdx, setPageIdx] = useState(0);
  const [debouncedPages, setDebouncedPages] = useState(pages);
  const containerRef = useRef(null);
  const [parentW, setParentW] = useState(720);

  const debouncedSetPages = useMemo(() => debounce(setDebouncedPages, 500), []);
  useEffect(() => {
    debouncedSetPages(pages || []);
  }, [pages, debouncedSetPages]);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setParentW(containerRef.current.clientWidth || 720);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const pageCount = (debouncedPages || []).length;
  const current = (debouncedPages || [])[pageIdx] || { headline: '', body: '', cta: '' };

  const [nominalW, nominalH] = RATIO_DIMS[activeRatio] || [1080, 1080];
  const { outW, outH } = fitContain(parentW - 40, nominalW, nominalH);

  const colors = {
    primary: brandKit?.color_primary || '#6366F1',
    secondary: brandKit?.color_secondary || '#EC4899',
    accent: brandKit?.color_accent || 'var(--cream)',
    bg: brandKit?.color_bg || 'var(--bg)',
  };
  const fontHeading = brandKit?.font_heading || 'Outfit';
  const fontBody = brandKit?.font_body || 'DM Sans';

  return (
    <div data-testid="carrusel-preview-live" ref={containerRef} style={{
      padding: 16, borderRadius: 14,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
    }}>
      {/* Ratio tabs */}
      <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {ASPECT_RATIOS.map((r) => {
          const active = r === activeRatio;
          return (
            <button
              key={r}
              role="tab"
              aria-selected={active}
              data-testid={`ratio-${r}`}
              onClick={() => setActiveRatio(r)}
              style={{
                padding: '6px 12px', borderRadius: 9999,
                background: active ? GRADIENT : 'transparent',
                border: active ? 'none' : '1px solid var(--border)',
                color: active ? 'var(--cream, var(--cream))' : 'var(--cream-2)',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
                cursor: 'pointer',
              }}>
              {r}
            </button>
          );
        })}
      </div>

      {/* Canvas mock */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: 20, borderRadius: 12,
        background: 'var(--surface)',
        minHeight: 240,
      }}>
        <div
          data-testid="preview-canvas"
          style={{
            width: outW, height: outH, borderRadius: 14,
            background: colors.bg,
            border: `1px solid ${colors.primary}33`,
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            padding: '18px 22px',
          }}>
          {/* Gradient top bar */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 5,
            background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
          }} />
          <div>
            <div style={{
              fontFamily: fontHeading, fontWeight: 800,
              fontSize: Math.max(14, Math.min(28, outW / 22)),
              color: colors.accent, marginTop: 12, marginBottom: 8, letterSpacing: '-0.01em',
              lineHeight: 1.15,
            }}>
              {current.headline || t('studio.carrusel.preview_headline_placeholder')}
            </div>
            <div style={{
              fontFamily: fontBody,
              fontSize: Math.max(11, Math.min(16, outW / 32)),
              color: 'var(--cream-2)', lineHeight: 1.4,
            }}>
              {(current.body || t('studio.carrusel.preview_body_placeholder')).slice(0, 180)}
            </div>
          </div>
          {/* CTA */}
          <div>
            <button style={{
              padding: '8px 14px', borderRadius: 9999,
              background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
              border: 'none', color: 'var(--cream, var(--cream))',
              fontFamily: fontBody, fontWeight: 700, fontSize: 12,
              cursor: 'default',
            }}>
              {current.cta || t('studio.carrusel.preview_cta_default')}
            </button>
          </div>
        </div>
      </div>

      {/* Page navigation */}
      {pageCount > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <button
            data-testid="page-prev"
            onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
            disabled={pageIdx === 0}
            style={{
              padding: '6px 12px', borderRadius: 9999,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12,
              cursor: pageIdx === 0 ? 'not-allowed' : 'pointer',
              opacity: pageIdx === 0 ? 0.5 : 1,
            }}>
            ←
          </button>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
            {pageIdx + 1} / {pageCount}
          </span>
          <button
            data-testid="page-next"
            onClick={() => setPageIdx((i) => Math.min(pageCount - 1, i + 1))}
            disabled={pageIdx >= pageCount - 1}
            style={{
              padding: '6px 12px', borderRadius: 9999,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12,
              cursor: pageIdx >= pageCount - 1 ? 'not-allowed' : 'pointer',
              opacity: pageIdx >= pageCount - 1 ? 0.5 : 1,
            }}>
            →
          </button>
        </div>
      )}
    </div>
  );
}

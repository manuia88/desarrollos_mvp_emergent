// W5.22 Z.8.3 — Gallery · 5 theme-driven variants + lightbox
import React, { useState } from 'react';

export default function GallerySection({ config = {}, linkedEntity, theme = {} }) {
  const palette = theme.palette || {};
  const layout = theme.layout || {};
  const sectionVariants = theme.section_variants || {};

  const variant = config.layout || sectionVariants.gallery || 'masonry';
  const urls = (config.asset_urls && config.asset_urls.length ? config.asset_urls : (linkedEntity?.images || []));
  const [lightbox, setLightbox] = useState(null);
  if (!urls.length) return null;

  const radius = parseInt(layout.border_radius || '14', 10) || 0;
  const sectionPadding = layout.section_padding || '4rem 1.5rem';
  const themePrimary = palette.primary || '#6366F1';

  // Layout configurations per variant
  let cols = '200px';
  let gap = 12;
  let cardRadius = radius;
  let aspectFn = () => '4/3';
  let gridSpan = () => 'auto';
  let extraStyle = {};
  let captionStyle = null;
  let containerExtra = {};

  if (variant === 'grid-tight') {
    cols = '220px'; gap = 4; cardRadius = 0;
  } else if (variant === 'masonry') {
    cols = '220px'; gap = 12; cardRadius = radius || 14;
    aspectFn = (i) => (i % 3 === 0 ? '3/4' : '4/3');
    gridSpan = (i) => (i % 4 === 0 ? 'span 2' : 'auto');
  } else if (variant === 'grid-rounded') {
    cols = '240px'; gap = 16; cardRadius = 28;
    extraStyle = { boxShadow: `0 12px 36px ${themePrimary}22` };
  } else if (variant === 'polaroid-stack') {
    cols = '200px'; gap = 24; cardRadius = 2;
    captionStyle = { padding: '8px 4px', textAlign: 'center', fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: palette.text_dim || 'rgba(240,235,224,0.6)' };
    extraStyle = { background: '#fff', padding: 8, paddingBottom: 24, transform: 'rotate(-1deg)' };
  } else if (variant === 'fade-sequence') {
    cols = '100%'; gap = 4;
    cardRadius = radius || 12;
    containerExtra = { display: 'flex', flexDirection: 'column' };
  }

  const containerStyle = variant === 'fade-sequence'
    ? { ...containerExtra, gap }
    : {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${cols}, 1fr))`,
        gap,
        gridAutoFlow: variant === 'masonry' ? 'dense' : 'row',
      };

  return (
    <section data-testid="sec-gallery" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1280, margin: '0 auto' }}>
      <div style={containerStyle}>
        {urls.slice(0, 24).map((u, i) => (
          <div
            key={i}
            data-testid={`gallery-thumb-${i}`}
            onClick={() => setLightbox(i)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLightbox(i)}
            style={{
              cursor: 'pointer',
              aspectRatio: variant === 'fade-sequence' ? '16/9' : aspectFn(i),
              gridRow: variant === 'masonry' ? gridSpan(i) : 'auto',
              borderRadius: cardRadius,
              overflow: 'hidden',
              transition: `transform ${theme.animation?.duration || '320ms'} ${theme.animation?.transition_curve || 'cubic-bezier(0.22, 1, 0.36, 1)'}`,
              ...extraStyle,
            }}
          >
            <div style={{ width: '100%', height: '100%', background: `url(${u}) center/cover`, borderRadius: variant === 'polaroid-stack' ? 0 : cardRadius }} />
            {variant === 'polaroid-stack' && captionStyle && (
              <div style={captionStyle}>{`Foto ${i + 1}`}</div>
            )}
          </div>
        ))}
      </div>

      {lightbox !== null && (
        <div data-testid="gallery-lightbox" role="dialog" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9000, display: 'grid', placeItems: 'center' }} onClick={() => setLightbox(null)}>
          <img src={urls[lightbox]} alt="" style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: cardRadius }} />
          <button data-testid="lightbox-close" type="button" onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 24, right: 24, padding: '10px 16px', borderRadius: 9999, background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', cursor: 'pointer' }} aria-label="Close">Cerrar</button>
          <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14 }}>
            <button type="button" onClick={(e) => { e.stopPropagation(); setLightbox((p) => (p - 1 + urls.length) % urls.length); }} style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', cursor: 'pointer' }}>← Prev</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setLightbox((p) => (p + 1) % urls.length); }} style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', cursor: 'pointer' }}>Next →</button>
          </div>
        </div>
      )}
    </section>
  );
}

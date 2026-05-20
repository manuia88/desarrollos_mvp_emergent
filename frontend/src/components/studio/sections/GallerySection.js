// W5.22 Z.8.2 — Gallery: grid / masonry / carousel + lightbox
import React, { useState } from 'react';

export default function GallerySection({ config = {}, linkedEntity }) {
  const layout = config.layout || 'grid';
  const cols = config.columns || 3;
  const urls = (config.asset_urls && config.asset_urls.length ? config.asset_urls : (linkedEntity?.images || []));
  const [lightbox, setLightbox] = useState(null);

  if (!urls.length) return null;

  return (
    <section data-testid="sec-gallery" style={{ padding: '4rem 1.5rem', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${layout === 'carousel' ? '320px' : '200px'}, 1fr))`,
        gap: 12,
        gridAutoFlow: layout === 'masonry' ? 'dense' : 'row',
      }}>
        {urls.slice(0, 24).map((u, i) => (
          <button
            key={i}
            data-testid={`gallery-thumb-${i}`}
            type="button"
            onClick={() => setLightbox(i)}
            style={{
              padding: 0,
              aspectRatio: layout === 'masonry' && i % 3 === 0 ? '3/4' : '4/3',
              gridRow: layout === 'masonry' && i % 4 === 0 ? 'span 2' : 'auto',
              borderRadius: 14,
              border: 'none',
              cursor: 'pointer',
              background: `url(${u}) center/cover`,
              transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        ))}
      </div>

      {lightbox !== null && (
        <div data-testid="gallery-lightbox" role="dialog" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9000, display: 'grid', placeItems: 'center' }} onClick={() => setLightbox(null)}>
          <img src={urls[lightbox]} alt="" style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 14 }} />
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

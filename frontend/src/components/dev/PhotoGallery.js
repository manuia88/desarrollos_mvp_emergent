// PhotoGallery — galería premium estilo revista: foto principal grande + grid 2×2 de secundarias + lightbox.
// (Antes: caja única 480px con tabs de medios encimadas arriba — se veía mediocre.)
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from '../icons';

function Fallback({ hue = 231, seed = 0 }) {
  return (
    <svg viewBox="0 0 960 600" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`ph-bg-${seed}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue}, 40%, 90%)`} />
          <stop offset="100%" stopColor={`hsl(${hue}, 30%, 80%)`} />
        </linearGradient>
      </defs>
      <rect width={960} height={600} fill={`url(#ph-bg-${seed})`} />
      <path d="M0 470 L300 320 L470 430 L640 300 L960 500 L960 600 L0 600 Z" fill={`hsl(${hue}, 35%, 72%)`} opacity="0.6" />
      <circle cx={780} cy={150} r={48} fill={`hsl(${hue}, 45%, 82%)`} />
    </svg>
  );
}

export default function PhotoGallery({ dev }) {
  const { t } = useTranslation();
  const photos = dev.photos || [];
  const hue = dev.developer?.logo_hue || 231;
  const [err, setErr] = useState({});
  const [lb, setLb] = useState(null);            // índice activo en el lightbox (o null)
  const has = photos.length > 0;

  // navegación del lightbox con teclado
  useEffect(() => {
    if (lb === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setLb(null);
      if (e.key === 'ArrowRight') setLb((i) => (i + 1) % photos.length);
      if (e.key === 'ArrowLeft') setLb((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lb, photos.length]);

  const Img = ({ i, style, rounded }) => (
    (err[i] || !photos[i])
      ? <div style={{ width: '100%', height: '100%', ...style }}><Fallback hue={hue} seed={i} /></div>
      : <img src={photos[i]} alt={`${dev.name} ${i + 1}`} loading={i > 0 ? 'lazy' : 'eager'}
          onError={() => setErr((e) => ({ ...e, [i]: true }))}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in', ...style }}
          onClick={() => setLb(i)} />
  );

  const sec = photos.slice(1, 5);   // hasta 4 secundarias para el grid

  return (
    <div data-testid="photo-gallery">
      {/* Mosaico estilo revista */}
      <div style={{
        display: 'grid', gap: 8, borderRadius: 20, overflow: 'hidden',
        gridTemplateColumns: sec.length ? '1.55fr 1fr' : '1fr',
        height: 'clamp(320px, 46vw, 520px)', border: '1px solid var(--card-border, var(--border))',
        background: '#EDEEF1', position: 'relative',
      }}>
        {/* Principal */}
        <div style={{ position: 'relative', overflow: 'hidden', height: '100%' }}>
          <Img i={0} />
          {has && (
            <button data-testid="ver-fotos" onClick={() => setLb(0)} style={{
              position: 'absolute', left: 16, bottom: 16, padding: '9px 16px', borderRadius: 9999,
              background: 'rgba(15,18,28,0.7)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)',
              color: '#fff', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}>📷 Ver {photos.length} foto{photos.length === 1 ? '' : 's'}</button>
          )}
        </div>

        {/* Grid 2×2 de secundarias */}
        {sec.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, height: '100%' }}>
            {[0, 1, 2, 3].map((k) => {
              const i = k + 1;
              const isLast = k === 3 && photos.length > 5;
              if (!sec[k]) return <div key={k} style={{ background: 'var(--surface-card)' }} />;
              return (
                <div key={k} style={{ position: 'relative', overflow: 'hidden' }}>
                  <Img i={i} />
                  {isLast && (
                    <button onClick={() => setLb(i)} style={{
                      position: 'absolute', inset: 0, background: 'rgba(15,18,28,0.55)', border: 'none', cursor: 'pointer',
                      color: '#fff', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18,
                    }}>+{photos.length - 5} más</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lb !== null && (
        <div onClick={() => setLb(null)} style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(8,10,16,0.94)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px,4vw,56px)',
        }}>
          <button onClick={() => setLb(null)} style={{ position: 'absolute', top: 20, right: 24, width: 42, height: 42, borderRadius: 9999, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>✕</button>
          <button onClick={(e) => { e.stopPropagation(); setLb((i) => (i - 1 + photos.length) % photos.length); }} style={{ position: 'absolute', left: 'clamp(8px,2vw,28px)', top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: 9999, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={18} /></button>
          {(err[lb] || !photos[lb]) ? <div style={{ width: 'min(90vw,1100px)', height: 'min(78vh,720px)' }}><Fallback hue={hue} seed={lb} /></div>
            : <img src={photos[lb]} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(92vw,1200px)', maxHeight: '84vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 30px 90px rgba(0,0,0,0.5)' }} />}
          <button onClick={(e) => { e.stopPropagation(); setLb((i) => (i + 1) % photos.length); }} style={{ position: 'absolute', right: 'clamp(8px,2vw,28px)', top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: 9999, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={18} /></button>
          <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{lb + 1} / {photos.length}{t ? '' : ''}</div>
        </div>
      )}
    </div>
  );
}

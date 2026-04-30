// PhotoGallery — hero photo + thumbnail strip + media tabs
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from '../icons';

function Fallback({ hue = 231, seed = 0 }) {
  return (
    <svg viewBox="0 0 960 480" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`ph-bg-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue}, 70%, 18%)`} />
          <stop offset="100%" stopColor="#0A0D16" />
        </linearGradient>
      </defs>
      <rect width={960} height={480} fill={`url(#ph-bg-${seed})`} />
      <rect x={160} y={90} width={640} height={330} fill={`hsl(${hue}, 45%, 14%)`} />
      {Array.from({ length: 11 }).map((_, row) =>
        Array.from({ length: 10 }).map((_, col) => (
          <rect key={`${row}${col}`} x={180 + col*62} y={105 + row*28} width={38} height={16}
            fill={((row*10+col+seed) % 3) > 0 ? `hsla(${hue},70%,65%,0.45)` : 'rgba(255,255,255,0.04)'} rx={2} />
        ))
      )}
    </svg>
  );
}

export default function PhotoGallery({ dev }) {
  const { t } = useTranslation();
  const photos = dev.photos || [];
  const [active, setActive] = useState(0);
  const [mediaTab, setMediaTab] = useState('fotos');
  const [err, setErr] = useState({});
  const hue = dev.developer?.logo_hue || 231;

  const mediaTabs = [
    { k: 'fotos', label: t('dev.media.fotos') },
    { k: 'video', label: t('dev.media.video') },
    { k: '360', label: t('dev.media.360') },
    { k: 'planos', label: t('dev.media.planos') },
    { k: 'ubicacion', label: t('dev.media.ubicacion') },
    { k: 'street', label: t('dev.media.street') },
  ];

  const showFallback = photos.length === 0 || err[active];

  return (
    <div data-testid="photo-gallery" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {mediaTabs.map(mt => (
          <button key={mt.k}
            data-testid={`media-tab-${mt.k}`}
            onClick={() => setMediaTab(mt.k)}
            style={{
              padding: '6px 12px', borderRadius: 9999,
              background: mediaTab === mt.k ? 'var(--grad)' : 'transparent',
              border: `1px solid ${mediaTab === mt.k ? 'transparent' : 'var(--border)'}`,
              color: mediaTab === mt.k ? '#fff' : 'var(--cream-3)',
              fontFamily: 'DM Sans', fontWeight: 500, fontSize: 11.5,
              cursor: 'pointer',
            }}>
            {mt.label}
          </button>
        ))}
      </div>

      <div style={{
        position: 'relative', height: 480, borderRadius: 20, overflow: 'hidden',
        border: '1px solid var(--border)', background: '#0A0D16',
      }}>
        {mediaTab === 'fotos' ? (
          <>
            {showFallback ? (
              <Fallback hue={hue} seed={active} />
            ) : (
              <img src={photos[active]} alt={dev.name}
                onError={() => setErr(e => ({ ...e, [active]: true }))}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )}
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setActive(a => (a - 1 + photos.length) % photos.length)}
                  className="btn-icon-circle"
                  style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }}>
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setActive(a => (a + 1) % photos.length)}
                  className="btn-icon-circle"
                  style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)' }}>
                  <ChevronRight size={14} />
                </button>
              </>
            )}
            <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              padding: '4px 12px', borderRadius: 9999, background: 'rgba(6,8,15,0.7)',
              fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream)',
              backdropFilter: 'blur(6px)' }}>
              {active + 1} / {photos.length}
            </div>
          </>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
            {t('dev.media_soon')}
          </div>
        )}
      </div>

      {mediaTab === 'fotos' && photos.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0' }}>
          {photos.map((_, i) => (
            <button key={i} onClick={() => setActive(i)}
              data-testid={`thumb-${i}`}
              style={{
                flexShrink: 0, width: 80, height: 56,
                borderRadius: 8, overflow: 'hidden',
                border: `2px solid ${active === i ? 'var(--indigo-3)' : 'transparent'}`,
                background: '#0A0D16', padding: 0, cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}>
              {err[i] || !photos[i] ? <Fallback hue={hue} seed={i} /> : (
                <img src={photos[i]} alt=""
                  onError={() => setErr(e => ({ ...e, [i]: true }))}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

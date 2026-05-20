// W5.22 Z.8.5 — Video-first · Galeria video (5 clips amanecer · amenidades · rooftop · drone · atardecer)
import React, { useState } from 'react';

const DEFAULT_SLOTS = [
  { slot: 'amanecer', label: 'Amanecer en la torre' },
  { slot: 'amenidades', label: 'Tour amenidades' },
  { slot: 'rooftop', label: 'Vista rooftop' },
  { slot: 'drone', label: 'Vista aerea drone' },
  { slot: 'atardecer', label: 'Atardecer rooftop' },
];

function parseYouTube(u) { const m = (u || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/); return m ? m[1] : null; }

export default function VideoFirstGaleriaVideoSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const primary = palette.primary || '#FFFFFF';
  const text = palette.text || '#FFFFFF';
  const textDim = palette.text_dim || 'rgba(255,255,255,0.7)';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const radius = parseInt(layout.border_radius || '8', 10) || 0;
  const sectionPadding = layout.section_padding || '72px 24px';

  const tpl = config.spec_data || {};
  const slots = (tpl.video_clips_slots && tpl.video_clips_slots.length) ? tpl.video_clips_slots : DEFAULT_SLOTS;
  const urls = config.video_urls || {};
  const [active, setActive] = useState(slots[0]?.slot || '');

  const activeSlot = slots.find((s) => s.slot === active) || slots[0];
  const activeUrl = urls[active];
  const ytId = parseYouTube(activeUrl || '');

  return (
    <section data-testid="sec-galeria-video" style={{ padding: sectionPadding, fontFamily: bodyFont, color: text, background: '#000' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <h2 style={{ fontFamily: headingFont, fontWeight: 800, letterSpacing: '-0.03em', fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)', margin: '0 0 28px' }}>
          {config.title || '5 momentos · 5 videos'}
        </h2>
        <div style={{ aspectRatio: '21/9', borderRadius: radius, overflow: 'hidden', background: '#0a0a0a' }}>
          {ytId ? (
            <iframe data-testid="vfv-iframe" title={activeSlot?.label || 'video'} width="100%" height="100%" src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}`} frameBorder="0" allow="autoplay; fullscreen" allowFullScreen style={{ border: 0 }} />
          ) : activeUrl ? (
            <video data-testid="vfv-video" src={activeUrl} autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: textDim, fontSize: 14, padding: 32 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36 }}>▶</div>
                <div style={{ marginTop: 8 }}>{activeSlot?.label || 'Sin video asignado'}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.5 }}>Sube videos al brand kit y asigna por slot</div>
              </div>
            </div>
          )}
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {slots.map((s) => (
            <button key={s.slot} data-testid={`vfv-tab-${s.slot}`} type="button" onClick={() => setActive(s.slot)} style={{ padding: '10px 14px', background: active === s.slot ? primary : 'rgba(255,255,255,0.06)', color: active === s.slot ? '#000' : text, border: 'none', borderRadius: radius, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: bodyFont }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

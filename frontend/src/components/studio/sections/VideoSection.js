// W5.22 Z.8.3 — Video · theme-driven (default / fullbleed)
import React from 'react';

function parseYouTube(url) {
  const m = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function parseVimeo(url) {
  const m = (url || '').match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}

export default function VideoSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const layout = theme.layout || {};
  const sectionVariants = theme.section_variants || {};
  const variant = config.variant || sectionVariants.video || 'default';

  const url = config.url || '';
  const poster = config.poster || '';
  const autoplay = config.autoplay !== false;
  const muted = config.muted !== false;
  const loop = config.loop !== false;
  const ytId = parseYouTube(url);
  const vimId = parseVimeo(url);

  const radius = parseInt(layout.border_radius || '20', 10) || 0;
  const sectionPadding = layout.section_padding || '4rem 1.5rem';

  const isFullbleed = variant === 'fullbleed';
  const wrapStyle = isFullbleed
    ? { padding: 0, margin: 0 }
    : { padding: sectionPadding, maxWidth: 1100, margin: '0 auto' };
  const innerStyle = isFullbleed
    ? { aspectRatio: '21/9', borderRadius: 0, overflow: 'hidden', background: '#000' }
    : { aspectRatio: '16/9', borderRadius: radius, overflow: 'hidden', background: '#000' };

  return (
    <section data-testid="sec-video" data-variant={variant} style={wrapStyle}>
      <div style={innerStyle}>
        {ytId ? (
          <iframe data-testid="video-yt" title="video" width="100%" height="100%" src={`https://www.youtube.com/embed/${ytId}?autoplay=${autoplay ? 1 : 0}&mute=${muted ? 1 : 0}&loop=${loop ? 1 : 0}&playlist=${ytId}`} frameBorder="0" allow="autoplay; fullscreen" allowFullScreen style={{ border: 0 }} />
        ) : vimId ? (
          <iframe data-testid="video-vimeo" title="video" width="100%" height="100%" src={`https://player.vimeo.com/video/${vimId}?autoplay=${autoplay ? 1 : 0}&muted=${muted ? 1 : 0}&loop=${loop ? 1 : 0}`} frameBorder="0" allow="autoplay; fullscreen" allowFullScreen style={{ border: 0 }} />
        ) : url ? (
          <video data-testid="video-mp4" src={url} poster={poster} autoPlay={autoplay} muted={muted} loop={loop} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: palette.text_dim || 'rgba(255,255,255,0.4)' }}>Sin URL de video</div>
        )}
      </div>
    </section>
  );
}

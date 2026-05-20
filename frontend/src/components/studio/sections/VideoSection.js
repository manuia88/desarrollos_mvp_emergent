// W5.22 Z.8.2 — Video: YouTube / Vimeo / R2 MP4
import React from 'react';

function parseYouTube(url) {
  const m = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function parseVimeo(url) {
  const m = (url || '').match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}

export default function VideoSection({ config = {} }) {
  const url = config.url || '';
  const poster = config.poster || '';
  const autoplay = config.autoplay !== false;
  const muted = config.muted !== false;
  const loop = config.loop !== false;
  const ytId = parseYouTube(url);
  const vimId = parseVimeo(url);

  return (
    <section data-testid="sec-video" style={{ padding: '4rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ aspectRatio: '16/9', borderRadius: 20, overflow: 'hidden', background: '#000' }}>
        {ytId ? (
          <iframe data-testid="video-yt" title="video" width="100%" height="100%" src={`https://www.youtube.com/embed/${ytId}?autoplay=${autoplay ? 1 : 0}&mute=${muted ? 1 : 0}&loop=${loop ? 1 : 0}&playlist=${ytId}`} frameBorder="0" allow="autoplay; fullscreen" allowFullScreen style={{ border: 0 }} />
        ) : vimId ? (
          <iframe data-testid="video-vimeo" title="video" width="100%" height="100%" src={`https://player.vimeo.com/video/${vimId}?autoplay=${autoplay ? 1 : 0}&muted=${muted ? 1 : 0}&loop=${loop ? 1 : 0}`} frameBorder="0" allow="autoplay; fullscreen" allowFullScreen style={{ border: 0 }} />
        ) : url ? (
          <video data-testid="video-mp4" src={url} poster={poster} autoPlay={autoplay} muted={muted} loop={loop} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.4)' }}>Sin URL de video</div>
        )}
      </div>
    </section>
  );
}

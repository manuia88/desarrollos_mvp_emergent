// W5.22 Z.8 — Landing template: VideoFirst (hero video fullscreen autoplay)
import React from 'react';

export default function VideoFirst({ landing, children }) {
  const c = landing.content || {};
  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#6366F1';
  const secondary = brand.color_secondary || '#EC4899';
  const fontH = brand.font_heading || 'Outfit, sans-serif';
  const fontB = brand.font_body || 'DM Sans, sans-serif';
  const cta = c.cta?.primary?.text || 'Solicitar tour';
  const videoSrc = c.hero?.bg_video_r2_key || '';

  return (
    <div data-testid="tpl-video-first" style={{ background: '#000', color: '#fff', fontFamily: fontB, minHeight: '100vh' }}>
      <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
        {videoSrc ? (
          <video
            autoPlay loop muted playsInline
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${primary}, ${secondary})`, opacity: 0.65 }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.85) 100%)' }} />
        <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 1.5rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
          <h1 style={{ fontFamily: fontH, fontSize: 'clamp(2.4rem, 6vw, 4.5rem)', fontWeight: 800, margin: 0, lineHeight: 1.05, textShadow: '0 6px 30px rgba(0,0,0,0.7)' }}>
            {c.hero?.title}
          </h1>
          {c.hero?.subtitle && (
            <p style={{ maxWidth: 600, marginTop: 18, fontSize: 'clamp(1rem, 1.4vw, 1.2rem)', color: '#e0e0e0', lineHeight: 1.6, textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>{c.hero.subtitle}</p>
          )}
          <button
            data-testid="tpl-videofirst-cta"
            onClick={() => document.getElementById('lead-form-section')?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              marginTop: 24, width: 'fit-content', padding: '14px 32px',
              background: `linear-gradient(90deg, ${primary}, ${secondary})`,
              color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            {cta}
          </button>
        </div>
      </div>

      <div style={{ padding: '4rem 1.5rem', maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
        {(c.features || []).slice(0, 4).map((f, i) => (
          <div key={i} style={{ padding: 24, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
            <h3 style={{ margin: 0, fontFamily: fontH, fontSize: 18, color: primary }}>{f.title}</h3>
            <p style={{ margin: '8px 0 0 0', color: '#bbb', lineHeight: 1.5 }}>{f.description}</p>
          </div>
        ))}
      </div>

      <div id="lead-form-section" style={{ padding: '3rem 1.5rem', background: '#0a0a0a' }}>{children}</div>
    </div>
  );
}

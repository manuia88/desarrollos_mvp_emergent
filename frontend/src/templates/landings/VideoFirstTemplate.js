// W5.22 Z.8.7 Sub-B2 · VideoFirst Template · dark cinematic · VSL
import React from 'react';

const COL = { bg: '#0A0A0A', accent: '#fff', secondary: '#A855F7' };

export default function VideoFirstTemplate({ intake = {}, copy = null }) {
  const video = intake.videos?.[0]?.url || '';
  const chapters = (copy?.features || []).slice(0, 6).map((f, i) => ({ ts: `${i * 2}:${(i * 13 % 60).toString().padStart(2, '0')}`, title: f.title, desc: f.description })) ;
  const advisor = intake.assigned_advisor || {};
  const chaptersFallback = chapters.length ? chapters : [0, 1, 2, 3, 4].map((i) => ({ ts: `${i * 2}:00`, title: `Capitulo ${i + 1}`, desc: intake.unique_selling_points?.[i] || 'Capitulo del recorrido cinematico.' }));

  return (
    <div data-testid="tpl-z87-videofirst" style={{ background: COL.bg, color: COL.accent, fontFamily: 'DM Sans, sans-serif' }}>
      <section style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>
        {video ? (
          <video autoPlay loop muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}>
            <source src={video} type="video/mp4" />
          </video>
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${COL.secondary}, ${COL.bg})` }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.9) 100%)' }} />
        <div style={{ position: 'relative', zIndex: 2, height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 2rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2.5rem, 6vw, 5rem)', margin: 0, fontWeight: 800, lineHeight: 1.05, textShadow: '0 8px 40px rgba(0,0,0,0.8)' }}>{copy?.hero?.headline || intake.project_name}</h1>
          <p style={{ maxWidth: 600, marginTop: 20, fontSize: 'clamp(1rem, 1.6vw, 1.25rem)', color: '#E5E5E5', textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>{copy?.hero?.subhead || 'Recorrido cinematico · activar audio para experiencia completa'}</p>
        </div>
      </section>
      <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, marginBottom: 32 }}>Capitulos del recorrido</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {chaptersFallback.map((c, i) => (
            <div key={i} style={{ padding: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', color: COL.secondary, fontSize: 12, marginBottom: 6 }}>{c.ts}</div>
              <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 17 }}>{c.title}</h3>
              <p style={{ marginTop: 6, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </section>
      {intake.virtual_tour_url && (
        <section style={{ padding: '3rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22 }}>Tour 3D Gaussian Splatting</h3>
          <iframe src={intake.virtual_tour_url} title="3D tour" style={{ width: '100%', aspectRatio: '16/9', border: 0, borderRadius: 14, marginTop: 12 }} />
        </section>
      )}
      <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 90 }}>
        <a href={`https://wa.me/${(advisor.phone || '').replace(/\D/g, '')}`} style={{ display: 'block', padding: '14px 22px', background: '#25D366', color: '#fff', borderRadius: 9999, textDecoration: 'none', fontWeight: 800, boxShadow: '0 10px 30px rgba(37,211,102,0.5)' }}>WhatsApp ahora</a>
      </div>
      <section id="lead-form-anchor" style={{ padding: '4rem 2rem 6rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32 }}>Reserva visita guiada</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', maxWidth: 540, margin: '12px auto 0' }}>{advisor.full_name || 'Tu asesor'} te recibe en sitio · experiencia premium 60 min</p>
      </section>
    </div>
  );
}

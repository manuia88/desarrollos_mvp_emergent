// W5.22 Z.8.7 Sub-B2 · Scrollytelling Template · dark purple · cinematic chapters
import React from 'react';

const COL = { bg: '#2E1065', cream: '#FEF3C7', accent: '#A855F7', text: '#F5F3FF' };

export default function ScrollytellingTemplate({ intake = {}, copy = null }) {
  const chapters = (copy?.features || []).slice(0, 6);
  const photos = intake.photos || [];
  const fallback = chapters.length ? chapters : (intake.unique_selling_points || []).slice(0, 6).map((u, i) => ({ title: `Capitulo ${i + 1}`, description: u }));
  const sections = fallback.length ? fallback : [0, 1, 2, 3, 4, 5].map((i) => ({ title: `Capitulo ${i + 1}`, description: 'Una pieza del relato.' }));

  return (
    <div data-testid="tpl-z87-scrolly" style={{ background: COL.bg, color: COL.text, fontFamily: 'Inter, sans-serif' }}>
      <section style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '4rem 2rem', background: `radial-gradient(at top, rgba(168,85,247,0.4), transparent)` }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontStyle: 'italic', fontSize: 14, letterSpacing: '0.4em', textTransform: 'uppercase', color: COL.accent, marginBottom: 24 }}>Una historia</div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(3rem, 8vw, 6rem)', margin: 0, fontWeight: 900, lineHeight: 0.95 }}>{copy?.hero?.headline || intake.project_name}</h1>
          <p style={{ marginTop: 24, fontSize: 'clamp(1rem, 1.6vw, 1.25rem)', color: 'rgba(245,243,255,0.7)', lineHeight: 1.7 }}>{copy?.hero?.subhead || 'Pasa de un capitulo al siguiente para descubrirla.'}</p>
        </div>
      </section>
      {sections.map((s, i) => (
        <section key={i} style={{ minHeight: '100vh', position: 'relative', display: 'grid', placeItems: 'center', padding: '4rem 2rem', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: photos[i]?.url ? `url(${photos[i].url}) center/cover` : `linear-gradient(${i * 60}deg, rgba(168,85,247,0.3), rgba(46,16,101,0.95))`, opacity: 0.8 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(46,16,101,0.5), rgba(46,16,101,0.95))' }} />
          <div style={{ position: 'relative', maxWidth: 720, zIndex: 2 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontStyle: 'italic', letterSpacing: '0.4em', fontSize: 12, color: COL.cream, textTransform: 'uppercase', marginBottom: 16 }}>Capitulo {i + 1}</div>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', margin: 0, fontWeight: 800, lineHeight: 1.1 }}>{s.title}</h2>
            <p style={{ marginTop: 18, fontSize: 'clamp(1rem, 1.4vw, 1.15rem)', color: 'rgba(245,243,255,0.85)', lineHeight: 1.7 }}>{s.description}</p>
            <p style={{ marginTop: 18, fontStyle: 'italic', color: COL.cream, fontSize: 14 }}>· · · pero esto no termina aqui · · ·</p>
          </div>
        </section>
      ))}
      <section id="lead-form-anchor" style={{ padding: '6rem 2rem', textAlign: 'center', background: 'linear-gradient(180deg, rgba(46,16,101,0.95), #000)' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontStyle: 'italic', color: COL.cream }}>El epilogo lo escribes tu</h2>
        <a href="#" style={{ display: 'inline-block', marginTop: 24, padding: '14px 32px', border: `1px solid ${COL.cream}`, color: COL.cream, textDecoration: 'none', borderRadius: 0, fontFamily: 'Outfit, sans-serif', fontStyle: 'italic', letterSpacing: '0.2em' }}>Reservar visita</a>
        <p style={{ marginTop: 40, color: 'rgba(245,243,255,0.5)', fontSize: 13, fontStyle: 'italic' }}>— el equipo</p>
      </section>
    </div>
  );
}

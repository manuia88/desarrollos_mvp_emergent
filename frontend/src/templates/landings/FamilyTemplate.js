// W5.22 Z.8.7 Sub-B2 · Family Template · naranja+verde · calido · familias
import React from 'react';

const COL = { primary: '#F97316', secondary: '#10B981', bg: '#FFFBEB', text: '#1F2937' };

export default function FamilyTemplate({ intake = {}, copy = null }) {
  const photos = intake.photos || [];
  const landmarks = intake.landmarks || [];
  const testimonials = intake.testimonials || copy?.testimonials || [];
  const advisor = intake.assigned_advisor || {};
  const monthly = intake.typologies?.[0]?.price_mxn ? Math.round(intake.typologies[0].price_mxn * 0.005) : 18500;

  return (
    <div data-testid="tpl-z87-family" style={{ background: COL.bg, color: COL.text, fontFamily: 'DM Sans, sans-serif' }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', minHeight: '70vh', alignItems: 'center', padding: '4rem 2rem', gap: 32, maxWidth: 1280, margin: '0 auto' }}>
        <div>
          <div style={{ display: 'inline-block', padding: '6px 14px', background: COL.secondary, color: '#fff', borderRadius: 9999, fontSize: 12, fontWeight: 700, marginBottom: 20 }}>Para tu familia</div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', margin: 0, fontWeight: 800, color: COL.primary, lineHeight: 1.1 }}>{copy?.hero?.headline || intake.project_name}</h1>
          <p style={{ marginTop: 18, fontSize: 18, color: '#374151', lineHeight: 1.7 }}>{copy?.hero?.subhead || 'Un hogar diseniado para que tus hijos crezcan rodeados de naturaleza y seguridad.'}</p>
          <a href="#lead-form-anchor" style={{ display: 'inline-block', marginTop: 28, padding: '14px 32px', background: COL.primary, color: '#fff', borderRadius: 9999, textDecoration: 'none', fontWeight: 700 }}>Agenda visita en familia</a>
        </div>
        <div style={{ aspectRatio: '4/3', borderRadius: 24, background: photos[0]?.url ? `url(${photos[0].url}) center/cover` : `linear-gradient(135deg, ${COL.primary}, ${COL.secondary})` }} />
      </section>
      <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', textAlign: 'center', color: COL.primary, fontSize: 'clamp(1.5rem, 2.5vw, 2rem)' }}>Por que las familias eligen este lugar</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 32 }}>
          {[
            { label: 'Escuelas', tag: 'EDU' },
            { label: 'Parques', tag: 'PRK' },
            { label: 'Hospitales', tag: 'MED' },
            { label: 'Seguridad', tag: 'SEC' },
            { label: 'Transporte', tag: 'MOV' },
            { label: 'Amenidades', tag: 'AMN' },
          ].map((v, i) => (
            <div key={i} style={{ background: '#fff', padding: 24, borderRadius: 18, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div aria-hidden style={{ width: 56, height: 56, margin: '0 auto 10px', borderRadius: 9999, background: `linear-gradient(135deg, ${COL.primary}, ${COL.secondary})`, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 800, letterSpacing: '0.05em', fontSize: 13 }}>{v.tag}</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>{v.label}</div>
            </div>
          ))}
        </div>
      </section>
      <section style={{ padding: '4rem 2rem', textAlign: 'center', background: COL.secondary, color: '#fff' }}>
        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, opacity: 0.8 }}>Mensualidad estimada</div>
        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 800, marginTop: 6 }}>${monthly.toLocaleString('es-MX')} <span style={{ fontSize: 18, opacity: 0.7 }}>MXN/mes</span></div>
        <p style={{ opacity: 0.85, marginTop: 8 }}>Plan accesible con financiamiento personalizado</p>
      </section>
      {landmarks.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 900, margin: '0 auto' }}>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', textAlign: 'center', color: COL.primary }}>Distancia a tus puntos clave</h3>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 24, display: 'grid', gap: 10 }}>
            {landmarks.slice(0, 6).map((l, i) => (
              <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 14, background: '#fff', borderRadius: 12 }}>
                <span style={{ fontWeight: 600 }}>{l.name}</span>
                <span style={{ color: COL.secondary, fontWeight: 700 }}>{l.walking_minutes ? `${l.walking_minutes} min` : `${(l.distance_m || 0)} m`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {testimonials.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', textAlign: 'center', color: COL.primary, fontSize: 24 }}>Familias que ya viven aqui</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 32 }}>
            {testimonials.slice(0, 3).map((t, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ width: 48, height: 48, borderRadius: 9999, background: `linear-gradient(135deg, ${COL.primary}, ${COL.secondary})`, marginBottom: 12 }} />
                <p style={{ fontStyle: 'italic', color: '#4B5563', margin: 0 }}>&ldquo;{t.quote}&rdquo;</p>
                <div style={{ marginTop: 12, fontWeight: 700, color: COL.primary }}>{t.author}</div>
                <div style={{ fontSize: 13, color: '#6B7280' }}>{t.role}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section id="lead-form-anchor" style={{ padding: '4rem 2rem', textAlign: 'center', background: COL.bg }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', color: COL.primary, fontSize: 28 }}>Agenda tu visita en familia</h2>
        <p style={{ color: '#4B5563', marginTop: 8, maxWidth: 540, marginInline: 'auto' }}>{advisor.full_name || 'Tu asesor'} te recibira el sabado · kit familiar incluido</p>
        <a href={`https://wa.me/${(advisor.phone || '').replace(/\D/g, '')}`} style={{ display: 'inline-block', marginTop: 22, padding: '14px 32px', background: COL.primary, color: '#fff', borderRadius: 9999, textDecoration: 'none', fontWeight: 700 }}>Reservar visita</a>
      </section>
    </div>
  );
}

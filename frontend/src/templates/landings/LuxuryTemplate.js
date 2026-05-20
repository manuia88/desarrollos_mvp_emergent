// W5.22 Z.8.7 Sub-B2 · Luxury Template · serif editorial · oro · negro
import React from 'react';

const COL = { bg: '#FAF7F2', dark: '#1A1A1A', gold: '#B8941F' };

export default function LuxuryTemplate({ intake = {}, copy = null, isPreview = false }) {
  const hero = copy?.hero || { headline: intake.project_name, subhead: intake.target_buyer_persona };
  const photos = intake.photos || [];
  const advisor = intake.assigned_advisor || {};
  const usps = intake.unique_selling_points || [];
  const advisor_name = advisor.full_name || 'El arquitecto';

  return (
    <div data-testid="tpl-z87-luxury" style={{ background: COL.bg, color: COL.dark, fontFamily: 'Inter, sans-serif', minHeight: '100vh' }}>
      <header style={{ position: 'relative', minHeight: '90vh', backgroundImage: photos[0]?.url ? `linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.5)), url(${photos[0].url})` : `linear-gradient(135deg, ${COL.bg}, #e8e0d0)`, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '4rem 2rem' }}>
        <div style={{ maxWidth: 900 }}>
          <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontStyle: 'italic', color: COL.gold, fontSize: 18, marginBottom: 16 }}>Coleccion exclusiva</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(2.5rem, 6vw, 5rem)', margin: 0, fontWeight: 700, color: photos[0] ? '#fff' : COL.dark, lineHeight: 1 }}>{hero.headline}</h1>
          {hero.subhead && <p style={{ marginTop: 16, fontSize: 'clamp(1rem, 1.6vw, 1.25rem)', fontStyle: 'italic', color: photos[0] ? 'rgba(255,255,255,0.85)' : '#555' }}>{hero.subhead}</p>}
        </div>
      </header>
      <section style={{ padding: '6rem 2rem', maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontStyle: 'italic', color: COL.gold, margin: '0 0 24px' }}>La historia del arquitecto</h2>
        <p style={{ fontSize: 18, lineHeight: 1.8, color: '#3a3a3a' }}>{intake.developer_track_record || `${advisor_name} concibio este proyecto durante anos en estudio internacional · materiales seleccionados pieza a pieza · vision arquitectonica que no se encuentra en CDMX.`}</p>
      </section>
      <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Playfair Display, serif', textAlign: 'center', fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', color: COL.dark, marginBottom: 40, fontStyle: 'italic' }}>3 secretos del proyecto</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 32 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ borderTop: `1px solid ${COL.gold}`, paddingTop: 20 }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, color: COL.gold, marginBottom: 12 }}>{String(i + 1).padStart(2, '0')}</div>
              <p style={{ lineHeight: 1.7, color: '#3a3a3a' }}>{usps[i] || copy?.features?.[i]?.description || `Detalle ${i + 1} reservado para visita privada.`}</p>
            </div>
          ))}
        </div>
      </section>
      <section style={{ padding: '4rem 2rem', maxWidth: 800, margin: '0 auto' }}>
        <h3 style={{ fontFamily: 'Playfair Display, serif', textAlign: 'center', fontSize: 22, fontStyle: 'italic', color: COL.dark, marginBottom: 32 }}>Incluido en la entrega</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {(intake.premium_services || []).concat((copy?.features || [])).slice(0, 6).map((s, i) => (
            <li key={i} style={{ padding: '14px 0', borderBottom: `1px solid ${COL.gold}33`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic' }}>{s.name || s.title}</span>
              <span style={{ color: COL.gold, fontSize: 13 }}>·</span>
            </li>
          ))}
        </ul>
      </section>
      <section id="lead-form-anchor" data-testid="lead-form-section" style={{ padding: '5rem 2rem', textAlign: 'center', background: COL.dark, color: COL.bg }}>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontStyle: 'italic', color: COL.gold, margin: 0 }}>Reserva una visita privada</h2>
        <p style={{ marginTop: 16, maxWidth: 540, marginInline: 'auto', fontStyle: 'italic', color: 'rgba(250,247,242,0.7)' }}>{copy?.lead_form?.headline || 'Solo 12 visitas mensuales por invitacion'}</p>
        <a href={`https://wa.me/${(advisor.phone || '').replace(/\D/g, '')}`} style={{ display: 'inline-block', marginTop: 32, padding: '14px 40px', border: `1px solid ${COL.gold}`, color: COL.gold, textDecoration: 'none', fontFamily: 'Playfair Display, serif', fontStyle: 'italic', letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: 13 }}>Solicitar invitacion</a>
        <p style={{ marginTop: 48, fontStyle: 'italic', color: 'rgba(250,247,242,0.5)', fontSize: 13 }}>P.D. {advisor_name}, arquitecto del proyecto</p>
      </section>
    </div>
  );
}

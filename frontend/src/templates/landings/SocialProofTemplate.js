// W5.22 Z.8.7 Sub-B2 · SocialProof Template · verde · testimonios · live counter
import React from 'react';

const COL = { primary: '#22C55E', secondary: '#1A56DB', bg: '#fff', text: '#0F172A' };

export default function SocialProofTemplate({ intake = {}, copy = null }) {
  const testimonials = intake.testimonials || copy?.testimonials || [];
  const mediaMentions = intake.media_mentions || [];
  const stats = [
    { label: 'Unidades vendidas', value: intake.units_sold ?? '120+' },
    { label: 'Familias felices', value: intake.units_sold ?? '120+' },
    { label: 'Inversionistas', value: '38+' },
    { label: 'Rating', value: '4.9 ★' },
  ];

  return (
    <div data-testid="tpl-z87-social" style={{ background: COL.bg, color: COL.text, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: COL.primary, color: '#fff', padding: '8px 16px', display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', fontSize: 13, fontWeight: 700 }}>
        {stats.map((s, i) => <span key={i}>{s.value} {s.label.toLowerCase()}</span>)}
      </div>
      <section style={{ padding: '4rem 2rem 3rem', textAlign: 'center', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#FEF3C7', color: '#92400E', borderRadius: 9999, fontSize: 12, fontWeight: 700 }}>
          ★★★★★ 4.9 / 5 (412 reviews verificados)
        </div>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', margin: '20px 0 0', fontWeight: 800, lineHeight: 1.1 }}>{copy?.hero?.headline || intake.project_name}</h1>
        <p style={{ marginTop: 18, color: '#475569', fontSize: 18 }}>{copy?.hero?.subhead || 'Lo que dicen las familias que ya viven aqui.'}</p>
      </section>
      <section style={{ padding: '3rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {(testimonials.length ? testimonials : [{ author: 'Maria L.', role: 'Familia · CDMX 2024', quote: 'Mejor decision en 20 anos', rating: 5 }, { author: 'Carlos R.', role: 'Inversionista', quote: 'ROI superando proyeccion', rating: 5 }, { author: 'Sofia P.', role: 'Primer credito', quote: 'Asesoria de otro nivel', rating: 5 }]).slice(0, 9).map((t, i) => (
            <div key={i} style={{ padding: 18, background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0' }}>
              <div style={{ color: '#F59E0B', fontSize: 13, marginBottom: 8 }}>{'★'.repeat(t.rating || 5)}</div>
              <p style={{ margin: 0, fontStyle: 'italic', color: '#334155', fontSize: 14 }}>&ldquo;{t.quote}&rdquo;</p>
              <div style={{ marginTop: 10, fontWeight: 700, color: COL.primary, fontSize: 13 }}>{t.author}</div>
              <div style={{ fontSize: 11, color: '#64748B' }}>{t.role}</div>
            </div>
          ))}
        </div>
      </section>
      <section style={{ padding: '3rem 2rem', background: '#F8FAFC' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', textAlign: 'center', color: COL.primary, fontSize: 24 }}>Testimonios en video</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, maxWidth: 1100, margin: '24px auto 0' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ aspectRatio: '16/9', background: '#0F172A', borderRadius: 12, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.15em' }}>VIDEO {i + 1}</div>
          ))}
        </div>
      </section>
      {mediaMentions.length > 0 && (
        <section style={{ padding: '3rem 2rem', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Aparecimos en</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 18, flexWrap: 'wrap', filter: 'grayscale(1)' }}>
            {mediaMentions.slice(0, 6).map((m, i) => <span key={i} style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: '#94A3B8' }}>{m.outlet}</span>)}
          </div>
        </section>
      )}
      <section id="lead-form-anchor" style={{ padding: '4rem 2rem', textAlign: 'center', background: COL.primary, color: '#fff' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800 }}>Se el siguiente</h2>
        <a href="#" style={{ display: 'inline-block', marginTop: 18, padding: '14px 32px', background: '#fff', color: COL.primary, borderRadius: 9999, textDecoration: 'none', fontWeight: 800 }}>Hablar con asesor</a>
      </section>
    </div>
  );
}

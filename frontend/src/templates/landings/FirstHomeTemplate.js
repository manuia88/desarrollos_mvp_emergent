// W5.22 Z.8.7 Sub-B2 · FirstHome Template · verde · amarillo highlighter · ahorro
import React from 'react';

const COL = { primary: '#16A34A', highlight: '#FACC15', bg: '#fff', text: '#0F172A' };

export default function FirstHomeTemplate({ intake = {}, copy = null }) {
  const advisor = intake.assigned_advisor || {};
  const rent = 12000;
  const mortgage = intake.typologies?.[0]?.price_mxn ? Math.round(intake.typologies[0].price_mxn * 0.0045) : 14500;
  const usps = intake.unique_selling_points || [];

  return (
    <div data-testid="tpl-z87-first-home" style={{ background: COL.bg, color: COL.text, fontFamily: 'DM Sans, sans-serif' }}>
      <section style={{ padding: '4rem 1.5rem 3rem', maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, margin: 0, lineHeight: 1.1 }}>{copy?.hero?.headline || intake.project_name}</h1>
        <p style={{ marginTop: 18, fontSize: 18, color: '#374151', lineHeight: 1.6 }}>Deja de pagar renta. Empieza a construir patrimonio.</p>
      </section>
      <section style={{ padding: '2rem 1.5rem 4rem', maxWidth: 700, margin: '0 auto' }}>
        <div style={{ background: '#FFFBEB', border: `2px dashed ${COL.highlight}`, borderRadius: 18, padding: 28 }}>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', textAlign: 'center', marginTop: 0 }}>Renta vs Credito · que estas regalando?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
            <div style={{ padding: 18, background: '#FEE2E2', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#991B1B', fontWeight: 700 }}>Renta mensual</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, color: '#991B1B', marginTop: 6 }}>${rent.toLocaleString('es-MX')}</div>
              <div style={{ fontSize: 11, color: '#7F1D1D', marginTop: 4 }}>= $0 patrimonio</div>
            </div>
            <div style={{ padding: 18, background: '#DCFCE7', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>Credito mensual</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, color: '#166534', marginTop: 6 }}>${mortgage.toLocaleString('es-MX')}</div>
              <div style={{ fontSize: 11, color: '#14532D', marginTop: 4 }}>= ${Math.round(mortgage * 12).toLocaleString('es-MX')}/ano patrimonio</div>
            </div>
          </div>
          <div style={{ marginTop: 18, padding: 14, background: COL.highlight, borderRadius: 10, textAlign: 'center', fontWeight: 700 }}>
            Diferencia: $<span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{(mortgage - rent).toLocaleString('es-MX')}</span> al mes que YA NO regalas
          </div>
        </div>
      </section>
      <section style={{ padding: '3rem 1.5rem', maxWidth: 760, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', color: COL.primary, textAlign: 'center', fontSize: 24 }}>3 secretos que tu primer credito esconde</h2>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 24, display: 'grid', gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <li key={i} style={{ padding: 16, background: '#F0FDF4', borderRadius: 12, borderLeft: `4px solid ${COL.primary}` }}>
              <strong style={{ color: COL.primary }}>#{i + 1}.</strong> {usps[i] || `Detalle ${i + 1} crucial sobre tu primer credito.`}
            </li>
          ))}
        </ul>
      </section>
      <section style={{ padding: '3rem 1.5rem', maxWidth: 760, margin: '0 auto' }}>
        <h3 style={{ fontFamily: 'Outfit, sans-serif', textAlign: 'center', fontSize: 20, color: COL.primary }}>Lo que se incluye en tu primer hogar</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 20 }}>
          {[
            'Asesoria gratis credito Infonavit/Fovissste',
            'Acompaniamiento notario',
            'Kit mudanza primer credito',
            'Lista de errores que tu primer credito comete',
            'Cierre garantizado en 90 dias',
            'WhatsApp directo con tu asesor 24/7',
            'Plan financiero 5 anos personalizado',
            'Visita virtual antes de notaria',
            'Sesion legal gratuita',
          ].map((f, i) => (
            <div key={i} style={{ padding: 10, background: '#FAFAFA', borderRadius: 8, fontSize: 13, display: 'flex', gap: 8 }}>
              <span style={{ color: COL.primary, fontWeight: 800 }}>✓</span>{f}
            </div>
          ))}
        </div>
      </section>
      <div style={{ position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 50, display: 'block' }}>
        <a href={`https://wa.me/${(advisor.phone || '').replace(/\D/g, '')}`} style={{ display: 'block', padding: '16px 20px', background: COL.primary, color: '#fff', borderRadius: 9999, textAlign: 'center', textDecoration: 'none', fontWeight: 800, boxShadow: '0 8px 24px rgba(22,163,74,0.4)' }}>WhatsApp · empezar mi credito</a>
      </div>
      <section id="lead-form-anchor" style={{ padding: '4rem 1.5rem 8rem', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', color: COL.primary, fontSize: 24 }}>Empieza tu credito hoy</h2>
        <p style={{ color: '#4B5563', marginTop: 8 }}>{advisor.full_name || 'Tu asesor joven'} te responde en menos de 5 min</p>
        <p style={{ marginTop: 24, color: '#9CA3AF', fontSize: 13, fontStyle: 'italic' }}>P.D. — {advisor.full_name || 'Tu asesor'} · WhatsApp {advisor.phone || ''}</p>
      </section>
    </div>
  );
}

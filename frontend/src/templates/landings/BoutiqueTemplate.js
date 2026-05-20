// W5.22 Z.8.7 Sub-B2 · Boutique Template · tierra · cream · timeline + materiality
import React from 'react';

const COL = { primary: '#92400E', cream: '#FDF6E3', accent: '#65A30D', text: '#1C1917' };

export default function BoutiqueTemplate({ intake = {}, copy = null }) {
  const usps = intake.unique_selling_points || [];
  const advisor = intake.assigned_advisor || {};
  const year_built = intake.phases?.[0]?.delivery_estimate || '2024';

  return (
    <div data-testid="tpl-z87-boutique" style={{ background: COL.cream, color: COL.text, fontFamily: 'DM Sans, sans-serif' }}>
      <section style={{ padding: '5rem 2rem 2rem', textAlign: 'center', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ letterSpacing: '0.4em', fontSize: 11, color: COL.primary, textTransform: 'uppercase', marginBottom: 24 }}>Coleccion artesanal · 12 unidades</div>
        <h1 style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', margin: 0, fontWeight: 600, lineHeight: 1.1 }}>{copy?.hero?.headline || intake.project_name}</h1>
        <p style={{ marginTop: 18, color: '#57534E', lineHeight: 1.7, fontFamily: 'Lora, serif', fontStyle: 'italic' }}>{copy?.hero?.subhead || 'Cada detalle restaurado pieza a pieza.'}</p>
      </section>
      <section style={{ padding: '3rem 2rem', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Lora, serif', textAlign: 'center', color: COL.primary, fontSize: 28, fontStyle: 'italic' }}>Linea del tiempo · de la piedra al hogar</h2>
        <ol style={{ listStyle: 'none', padding: 0, marginTop: 32, display: 'grid', gap: 12 }}>
          {[
            { year: year_built, label: 'Construccion original' },
            { year: '2010', label: 'Investigacion historica' },
            { year: '2018', label: 'Restauracion comienza' },
            { year: '2023', label: 'Materiales contemporaneos integrados' },
            { year: '2026', label: 'Entrega' },
          ].map((t, i) => (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 18, padding: 12, borderLeft: `2px solid ${COL.primary}`, paddingLeft: 18 }}>
              <span style={{ fontFamily: 'Lora, serif', fontWeight: 700, color: COL.primary, fontSize: 22 }}>{t.year}</span>
              <span style={{ color: '#44403C' }}>{t.label}</span>
            </li>
          ))}
        </ol>
      </section>
      <section style={{ padding: '3rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
        <h3 style={{ fontFamily: 'Lora, serif', color: COL.primary, fontStyle: 'italic', textAlign: 'center', fontSize: 24 }}>Materiales</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginTop: 28 }}>
          {[
            { title: 'Original', desc: 'Piedra original conservada · vigas roble centenario' },
            { title: 'Restaurado', desc: 'Pisos pulidos a mano · herreria recuperada' },
            { title: 'Contemporaneo', desc: 'Domotica oculta · iluminacion editorial' },
          ].map((m, i) => (
            <div key={i} style={{ padding: 24, background: '#fff', borderRadius: 4, borderTop: `3px solid ${COL.accent}` }}>
              <h4 style={{ fontFamily: 'Lora, serif', fontStyle: 'italic', color: COL.primary, margin: 0 }}>{m.title}</h4>
              <p style={{ marginTop: 10, color: '#57534E', lineHeight: 1.6 }}>{m.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section style={{ padding: '3rem 2rem', maxWidth: 800, margin: '0 auto' }}>
        <h3 style={{ fontFamily: 'Lora, serif', textAlign: 'center', color: COL.primary, fontStyle: 'italic' }}>3 secretos del proyecto</h3>
        <div style={{ marginTop: 24, display: 'grid', gap: 18 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ padding: 18, background: 'rgba(146,64,14,0.05)', borderLeft: `3px solid ${COL.primary}` }}>
              <p style={{ fontFamily: 'Lora, serif', fontStyle: 'italic', margin: 0, color: '#44403C', lineHeight: 1.7 }}>{usps[i] || `Detalle ${i + 1} reservado para visita.`}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="lead-form-anchor" style={{ padding: '4rem 2rem', textAlign: 'center', background: '#fff' }}>
        <h2 style={{ fontFamily: 'Lora, serif', color: COL.primary, fontSize: 28, fontStyle: 'italic' }}>Agenda visita curada</h2>
        <p style={{ color: '#57534E', maxWidth: 540, margin: '12px auto 0' }}>Recorrido con {advisor.full_name || 'el curador'} · 60 minutos · solo 4 visitas semanales</p>
        <a href={`https://wa.me/${(advisor.phone || '').replace(/\D/g, '')}`} style={{ display: 'inline-block', marginTop: 24, padding: '12px 28px', border: `1px solid ${COL.primary}`, color: COL.primary, textDecoration: 'none', fontFamily: 'Lora, serif', fontStyle: 'italic', letterSpacing: '0.1em', fontSize: 14 }}>Solicitar visita</a>
      </section>
    </div>
  );
}

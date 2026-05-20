// W5.22 Z.8.2 — FAQ: accordion details/summary
import React from 'react';

export default function FAQSection({ config = {} }) {
  const items = config.items || [];
  if (!items.length) return null;
  return (
    <section data-testid="sec-faq" style={{ padding: '4rem 1.5rem', maxWidth: 760, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'Outfit, sans-serif', textAlign: 'center', margin: '0 0 28px', fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>{config.title || 'Preguntas frecuentes'}</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((q, i) => (
          <details key={i} data-testid={`faq-${i}`} style={{ background: 'rgba(13,16,23,0.6)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 12, padding: '14px 18px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontFamily: 'Outfit, sans-serif', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{q.question}</span>
              <span style={{ opacity: 0.5 }}>+</span>
            </summary>
            <p style={{ marginTop: 12, color: 'rgba(240,235,224,0.78)', lineHeight: 1.6 }}>{q.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

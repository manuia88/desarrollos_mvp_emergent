// W5.22 Z.8.2 — Testimonials: carousel / grid / cards + star rating
import React, { useEffect, useState } from 'react';

function Stars({ n = 5 }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={i < n ? '#F59E0B' : 'rgba(255,255,255,0.18)'}>
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      ))}
    </div>
  );
}

export default function TestimonialsSection({ config = {} }) {
  const layout = config.layout || 'grid';
  const items = config.items || [];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (layout !== 'carousel' || items.length <= 1) return undefined;
    const id = setInterval(() => setIdx((p) => (p + 1) % items.length), 4500);
    return () => clearInterval(id);
  }, [layout, items.length]);

  if (!items.length) return null;

  if (layout === 'carousel') {
    const t = items[idx] || {};
    return (
      <section data-testid="sec-testimonials-carousel" style={{ padding: '4rem 1.5rem', maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
        <Stars n={t.rating || 5} />
        <p style={{ fontSize: 'clamp(1.1rem, 1.6vw, 1.35rem)', color: '#F0EBE0', margin: '20px 0', fontStyle: 'italic', lineHeight: 1.6 }}>&ldquo;{t.quote}&rdquo;</p>
        <div style={{ fontWeight: 600 }}>{t.author}</div>
        <div style={{ color: 'rgba(240,235,224,0.6)', fontSize: 13 }}>{t.role}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          {items.map((_, i) => <button key={i} type="button" onClick={() => setIdx(i)} style={{ width: 8, height: 8, borderRadius: 9999, background: i === idx ? '#6366F1' : 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer' }} aria-label={`testimonial ${i}`} />)}
        </div>
      </section>
    );
  }

  return (
    <section data-testid={`sec-testimonials-${layout}`} style={{ padding: '4rem 1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
        {items.slice(0, 6).map((t, i) => (
          <div key={i} style={{ padding: 24, borderRadius: 14, background: 'rgba(13,16,23,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Stars n={t.rating || 5} />
            <p style={{ marginTop: 14, color: '#F0EBE0', lineHeight: 1.6 }}>&ldquo;{t.quote}&rdquo;</p>
            <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9999, background: 'linear-gradient(135deg, #6366F1, #EC4899)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.author}</div>
                <div style={{ color: 'rgba(240,235,224,0.6)', fontSize: 12 }}>{t.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

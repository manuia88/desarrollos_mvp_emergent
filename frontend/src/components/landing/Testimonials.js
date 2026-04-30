// Testimonials — double marquee rows, pause on hover
import React from 'react';
import { useTranslation } from 'react-i18next';
import FadeUp from '../animations/FadeUp';

function TestimonialCard({ t: item }) {
  return (
    <div style={{
      width: 340, flexShrink: 0,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRadius: 16,
      padding: 24,
      marginRight: 16,
    }}>
      <p style={{
        fontFamily: 'DM Sans', fontStyle: 'italic', fontSize: 14,
        color: 'var(--cream-2)', lineHeight: 1.65, marginBottom: 16,
      }}>
        "{item.quote}"
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9999,
          background: 'var(--grad)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: '#fff',
        }}>
          {item.author[0]}
        </div>
        <div>
          <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream)' }}>
            {item.author}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
            {item.role}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Testimonials() {
  const { t } = useTranslation();
  const items = t('testimonials.items', { returnObjects: true });
  const safeItems = Array.isArray(items) ? items : [];
  const ROW1 = [...safeItems, ...safeItems];
  const mid = Math.floor(safeItems.length / 2);
  const rotated = [...safeItems.slice(mid), ...safeItems.slice(0, mid)];
  const ROW2 = [...rotated, ...rotated];

  return (
    <section data-testid="testimonials-section" style={{ padding: '80px 0', background: 'var(--bg)', overflow: 'hidden' }}>
      <FadeUp>
        <div style={{ textAlign: 'center', padding: '0 32px', marginBottom: 48 }}>
          <div className="tag-pill" style={{ marginBottom: 16 }}>{t('testimonials.eyebrow')}</div>
          <h2 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(32px, 4.5vw, 54px)',
            lineHeight: 1.0, letterSpacing: '-0.028em',
            color: 'var(--cream)',
            maxWidth: 720, margin: '0 auto',
          }}>
            {t('testimonials.h2')}
          </h2>
        </div>
      </FadeUp>

      <div className="marquee-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 80, height: '100%', background: 'linear-gradient(to right, var(--bg), transparent)', zIndex: 2, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, width: 80, height: '100%', background: 'linear-gradient(to left, var(--bg), transparent)', zIndex: 2, pointerEvents: 'none' }} />
          <div className="marquee-row" style={{ animationDuration: '38s' }}>
            {ROW1.map((item, i) => <TestimonialCard key={i} t={item} />)}
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 80, height: '100%', background: 'linear-gradient(to right, var(--bg), transparent)', zIndex: 2, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, width: 80, height: '100%', background: 'linear-gradient(to left, var(--bg), transparent)', zIndex: 2, pointerEvents: 'none' }} />
          <div className="marquee-row rev" style={{ animationDuration: '44s' }}>
            {ROW2.map((item, i) => <TestimonialCard key={i} t={item} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

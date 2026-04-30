// Stats — 4-col count-up, radial glow inner
import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useInView from '../../hooks/useInView';

function CountUp({ target, suffix, active }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const duration = 1800;
    const isFloat = target % 1 !== 0;

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const cur = eased * target;
      setDisplay(isFloat ? +cur.toFixed(1) : Math.round(cur));
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active, target]);

  return <span>{display}{suffix}</span>;
}

export default function Stats() {
  const { t } = useTranslation();
  const [ref, inView] = useInView({ once: true, amount: 0.4 });

  const STATS = [
    { value: 117, suffix: '', labelKey: 'variables' },
    { value: 50, suffix: '+', labelKey: 'sources' },
    { value: 16, suffix: '', labelKey: 'colonias' },
    { value: 3.2, suffix: 's', labelKey: 'time' },
  ];

  return (
    <section data-testid="stats-section" style={{ padding: '60px 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          ref={ref}
          style={{
            background: '#06080F',
            border: '1px solid var(--border)',
            borderRadius: 20,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div style={{
            position: 'absolute', top: '-30%', left: '50%',
            transform: 'translateX(-50%)',
            width: '80%', height: '200%',
            background: 'radial-gradient(ellipse, rgba(99,102,241,0.10) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            position: 'relative',
          }} className="stats-grid">
            {STATS.map(({ value, suffix, labelKey }, i) => (
              <div
                key={labelKey}
                data-testid={`stat-${i}`}
                style={{
                  padding: '40px 32px',
                  textAlign: 'center',
                  borderRight: i < STATS.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 64,
                  lineHeight: 1.0, letterSpacing: '-0.04em',
                  background: 'var(--grad)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  marginBottom: 8,
                }}>
                  <CountUp target={value} suffix={suffix} active={inView} />
                </div>
                <div className="eyebrow">{t(`stats.items.${labelKey}`)}</div>
              </div>
            ))}
          </div>

          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '14px 32px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              {t('stats.updated')}
            </span>
            <span className="score-pill" style={{ fontSize: 11 }}>
              {t('stats.updated_colonia')}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) { .stats-grid { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
    </section>
  );
}

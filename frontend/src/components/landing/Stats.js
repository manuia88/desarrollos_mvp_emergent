// Stats — 4-col count-up, radial glow inner
import React, { useRef, useEffect, useState } from 'react';
import useInView from '../../hooks/useInView';

const STATS = [
  { value: 97, suffix: '+', label: 'Variables por colonia' },
  { value: 50, suffix: '+', label: 'Fuentes de datos reales' },
  { value: 18, suffix: '', label: 'Colonias CDMX indexadas' },
  { value: 3.2, suffix: 's', label: 'Tiempo de análisis' },
];

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
      // easeOut
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
  const [ref, inView] = useInView({ once: true, amount: 0.4 });

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
          {/* Inner radial glow */}
          <div style={{
            position: 'absolute', top: '-30%', left: '50%',
            transform: 'translateX(-50%)',
            width: '80%', height: '200%',
            background: 'radial-gradient(ellipse, rgba(99,102,241,0.10) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />

          {/* Stats grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            position: 'relative',
          }} className="stats-grid">
            {STATS.map(({ value, suffix, label }, i) => (
              <div
                key={label}
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
                <div className="eyebrow">{label}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '14px 32px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              Actualización más reciente:
            </span>
            <span className="score-pill" style={{ fontSize: 11 }}>
              Benito Juárez · hace 6 horas
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

// W5.22 Z.8.2 — Stats: animated counter
import React, { useEffect, useRef, useState } from 'react';

function AnimatedNumber({ value }) {
  const [n, setN] = useState(0);
  const target = parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return undefined;
    ref.current = true;
    const start = performance.now();
    const dur = 1200;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(target * eased);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return undefined;
  }, [target]);
  if (String(value).match(/[^0-9.]/)) return <>{value}</>;
  return <>{Number.isInteger(target) ? Math.round(n) : n.toFixed(1)}</>;
}

export default function StatsSection({ config = {}, brandKit = {} }) {
  const items = config.items || [];
  const cols = Math.min(items.length, config.columns || 3);
  const primary = brandKit.color_primary || '#6366F1';
  const secondary = brandKit.color_secondary || '#EC4899';
  const grad = `linear-gradient(90deg, ${primary}, ${secondary})`;
  if (!items.length) return null;

  return (
    <section data-testid="sec-stats" style={{ padding: '4rem 1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols > 2 ? '180' : '220'}px, 1fr))`, gap: 18 }}>
        {items.map((s, i) => (
          <div key={i} data-testid={`stat-${i}`} style={{ padding: 28, borderRadius: 14, background: 'rgba(13,16,23,0.6)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 3.5vw, 2.75rem)', fontWeight: 800, background: grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 1 }}>
              {s.prefix || ''}<AnimatedNumber value={s.value} />{s.suffix || ''}
            </div>
            <div style={{ marginTop: 8, color: 'rgba(240,235,224,0.62)', fontSize: 13 }}>{s.label}</div>
            {s.description && <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(240,235,224,0.4)' }}>{s.description}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

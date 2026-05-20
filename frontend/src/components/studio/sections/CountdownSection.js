// W5.22 Z.8.2 — Countdown: timer JS local (scarcity / banner / inline)
import React, { useEffect, useState } from 'react';

function useTime(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = target ? new Date(target).getTime() : (Date.now() + 1000 * 60 * 60 * 48);
  const diff = Math.max(0, t - now);
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff / 3600000) % 24),
    m: Math.floor((diff / 60000) % 60),
    s: Math.floor((diff / 1000) % 60),
    expired: diff === 0,
  };
}

export default function CountdownSection({ config = {}, brandKit = {} }) {
  const variant = config.variant || 'inline';
  const { d, h, m, s, expired } = useTime(config.expires_at);
  const primary = brandKit.color_primary || '#EF4444';

  if (variant === 'banner') {
    return (
      <div data-testid="sec-countdown-banner" style={{ background: primary, color: '#fff', padding: '10px 16px', textAlign: 'center', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12 }}>
        {expired ? 'Promocion terminada' : `Termina en ${d}d ${h}h ${m}m ${s}s`}
      </div>
    );
  }

  if (variant === 'scarcity') {
    return (
      <section data-testid="sec-countdown-scarcity" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', gap: 8, padding: '10px 16px', borderRadius: 9999, background: 'rgba(239,68,68,0.12)', color: primary, border: `1px solid ${primary}55`, fontWeight: 700, fontSize: 14 }}>
          Solo quedan {d}d {h}h {m}m
        </div>
      </section>
    );
  }

  return (
    <section data-testid="sec-countdown-inline" style={{ padding: '3rem 1.5rem', maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
      <h3 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 18px' }}>{config.title || 'Termina la promocion en'}</h3>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {[{l: 'Dias', v: d}, {l: 'Hrs', v: h}, {l: 'Min', v: m}, {l: 'Seg', v: s}].map((u) => (
          <div key={u.l} style={{ minWidth: 80, padding: 14, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, color: primary }}>{String(u.v).padStart(2, '0')}</div>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{u.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

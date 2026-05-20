// W5.22 Z.8.3 — Countdown · theme-driven (inline / banner / scarcity)
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

export default function CountdownSection({ config = {}, brandKit = {}, theme = {}, templateKey, themeMode }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const sectionVariants = theme.section_variants || {};
  const variant = config.variant || sectionVariants.countdown || 'inline';
  const { d, h, m, s, expired } = useTime(config.expires_at);

  const themePrimary = palette.primary || brandKit.color_primary || '#EF4444';
  const text = palette.text || '#F0EBE0';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const dataFont = typography.data_font || headingFont;
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";

  if (variant === 'banner' || variant === 'banner-top') {
    return (
      <div data-testid="sec-countdown-banner" data-variant={variant} style={{ background: themePrimary, color: '#fff', padding: '12px 16px', textAlign: 'center', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12, fontFamily: bodyFont, position: 'sticky', top: 0, zIndex: 90 }}>
        {expired ? 'Promocion terminada' : <>Termina en <span style={{ fontFamily: dataFont }}>{d}d {h}h {m}m {String(s).padStart(2, '0')}s</span></>}
      </div>
    );
  }

  if (variant === 'scarcity') {
    return (
      <section data-testid="sec-countdown-scarcity" data-variant={variant} style={{ padding: '2rem 1.5rem', textAlign: 'center', fontFamily: bodyFont }}>
        <div style={{ display: 'inline-flex', gap: 8, padding: '10px 16px', borderRadius: 9999, background: `${themePrimary}1f`, color: themePrimary, border: `1px solid ${themePrimary}55`, fontWeight: 700, fontSize: 14 }}>
          Solo quedan {d}d {h}h {m}m
        </div>
      </section>
    );
  }

  return (
    <section data-testid="sec-countdown-inline" data-variant={variant} style={{ padding: '3rem 1.5rem', maxWidth: 800, margin: '0 auto', textAlign: 'center', fontFamily: bodyFont }}>
      <h3 style={{ fontFamily: headingFont, margin: '0 0 18px', color: text }}>{config.title || 'Termina la promocion en'}</h3>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {[{l: 'Dias', v: d}, {l: 'Hrs', v: h}, {l: 'Min', v: m}, {l: 'Seg', v: s}].map((u) => (
          <div key={u.l} style={{ minWidth: 80, padding: 14, background: `${themePrimary}14`, border: `1px solid ${themePrimary}3a`, borderRadius: 12 }}>
            <div style={{ fontFamily: dataFont, fontSize: 28, fontWeight: 800, color: themePrimary }}>{String(u.v).padStart(2, '0')}</div>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.15em', color: text }}>{u.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

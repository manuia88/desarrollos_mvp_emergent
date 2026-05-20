// W5.22 Z.8.3 — Stats · animated counter + theme variants
import React, { useEffect, useRef, useState } from 'react';

function AnimatedNumber({ value, duration = 1200 }) {
  const [n, setN] = useState(0);
  const target = parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return undefined;
    ref.current = true;
    const start = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(target * eased);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return undefined;
  }, [target, duration]);
  if (String(value).match(/[^0-9.]/)) return <>{value}</>;
  return <>{Number.isInteger(target) ? Math.round(n) : n.toFixed(1)}</>;
}

export default function StatsSection({ config = {}, brandKit = {}, theme = {}, templateKey, themeMode }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const sectionVariants = theme.section_variants || {};
  const variant = config.layout || sectionVariants.stats || 'default';

  const items = config.items || [];
  const cols = Math.min(items.length, config.columns || 3);
  if (!items.length) return null;

  const themePrimary = palette.primary || brandKit.color_primary || '#6366F1';
  const themeSecondary = palette.secondary || brandKit.color_secondary || '#EC4899';
  const grad = palette.gradient || `linear-gradient(90deg, ${themePrimary}, ${themeSecondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.62)';
  const radius = parseInt(layout.border_radius || '14', 10) || 0;
  const sectionPadding = layout.section_padding || '4rem 1.5rem';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const dataFont = typography.data_font || headingFont;

  // ── big-numbers-mono (investor) ─────────────────────────────────────────
  if (variant === 'big-numbers-mono') {
    return (
      <section data-testid="sec-stats-mono" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1200, margin: '0 auto', fontFamily: bodyFont }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, borderTop: `1px solid ${themePrimary}33`, borderBottom: `1px solid ${themePrimary}33` }}>
          {items.map((s, i) => (
            <div key={i} data-testid={`stat-${i}`} style={{ padding: '28px 18px', borderRight: i < items.length - 1 ? `1px solid ${themePrimary}22` : 'none' }}>
              <div style={{ fontFamily: dataFont, fontSize: 'clamp(2.2rem, 4vw, 3.25rem)', fontWeight: 800, color: themeSecondary, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {s.prefix || ''}<AnimatedNumber value={s.value} />{s.suffix || ''}
              </div>
              <div style={{ marginTop: 10, color: textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{s.label}</div>
              {s.description && <div style={{ marginTop: 4, fontSize: 11, color: textDim }}>{s.description}</div>}
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── social-proof-numbers (social_proof) ─────────────────────────────────
  if (variant === 'social-proof-numbers') {
    return (
      <section data-testid="sec-stats-social" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1200, margin: '0 auto', fontFamily: bodyFont }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
          {items.map((s, i) => (
            <div key={i} data-testid={`stat-${i}`} style={{ padding: 32, borderRadius: radius || 16, background: 'rgba(34,197,94,0.08)', border: `1px solid ${themePrimary}33`, textAlign: 'center' }}>
              <div style={{ fontFamily: headingFont, fontSize: 'clamp(2.5rem, 4.5vw, 3.5rem)', fontWeight: 800, color: themePrimary, lineHeight: 1 }}>
                {s.prefix || ''}<AnimatedNumber value={s.value} />{s.suffix || ''}
              </div>
              <div style={{ marginTop: 10, color: text, fontSize: 14, fontWeight: 600 }}>{s.label}</div>
              {s.description && <div style={{ marginTop: 4, color: textDim, fontSize: 12 }}>{s.description}</div>}
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── default (modern · gradient text) ────────────────────────────────────
  return (
    <section data-testid="sec-stats" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1200, margin: '0 auto', fontFamily: bodyFont }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols > 2 ? '180' : '220'}px, 1fr))`, gap: 18 }}>
        {items.map((s, i) => (
          <div key={i} data-testid={`stat-${i}`} style={{ padding: 28, borderRadius: radius || 14, background: 'rgba(13,16,23,0.6)', border: `1px solid ${themePrimary}33`, textAlign: 'center' }}>
            <div style={{ fontFamily: headingFont, fontSize: 'clamp(2rem, 3.5vw, 2.75rem)', fontWeight: 800, background: grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 1 }}>
              {s.prefix || ''}<AnimatedNumber value={s.value} />{s.suffix || ''}
            </div>
            <div style={{ marginTop: 8, color: textDim, fontSize: 13 }}>{s.label}</div>
            {s.description && <div style={{ marginTop: 4, fontSize: 11, color: textDim }}>{s.description}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// W5.22 Z.8.3 — Features · 10 theme-driven variants
import React from 'react';
import * as Icons from 'lucide-react';

export default function FeaturesSection({ config = {}, brandKit = {}, theme = {}, templateKey, themeMode }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const sectionVariants = theme.section_variants || {};

  const variant = config.layout || sectionVariants.features || 'cards';
  const items = config.items || [];
  if (!items.length) return null;

  const themePrimary = palette.primary || brandKit.color_primary || '#6366F1';
  const themeSecondary = palette.secondary || brandKit.color_secondary || '#EC4899';
  const grad = palette.gradient || `linear-gradient(135deg, ${themePrimary}, ${themeSecondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.62)';
  const radius = parseInt(layout.border_radius || '14', 10) || 0;
  const sectionPadding = layout.section_padding || '4rem 1.5rem';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";

  // ── alternating (luxury) ────────────────────────────────────────────────
  if (variant === 'alternating' || variant === 'alternating-text') {
    return (
      <section data-testid="sec-features-alt" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1100, margin: '0 auto', fontFamily: bodyFont }}>
        {items.map((f, i) => {
          const Icon = Icons[f.icon] || Icons.Sparkles;
          const reverse = i % 2 !== 0;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: reverse ? '2fr 1fr' : '1fr 2fr', gap: 40, alignItems: 'center', marginBottom: 64, direction: reverse ? 'rtl' : 'ltr' }}>
              <div style={{ direction: 'ltr', aspectRatio: '4/3', borderRadius: radius, background: grad, opacity: 0.45 }} />
              <div style={{ direction: 'ltr' }}>
                <Icon size={32} color={themePrimary} />
                <h3 style={{ margin: '14px 0 0', fontFamily: headingFont, fontSize: 26, color: text }}>{f.title}</h3>
                <p style={{ color: textDim, marginTop: 10, lineHeight: 1.7 }}>{f.description}</p>
              </div>
            </div>
          );
        })}
      </section>
    );
  }

  // ── icons-warm (family) ─────────────────────────────────────────────────
  if (variant === 'icons-warm') {
    return (
      <section data-testid="sec-features-warm" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1100, margin: '0 auto', fontFamily: bodyFont }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {items.map((f, i) => {
            const Icon = Icons[f.icon] || Icons.Heart;
            return (
              <div key={i} style={{ padding: 28, borderRadius: 24, background: 'rgba(249,115,22,0.06)', border: `1px solid ${themePrimary}33`, textAlign: 'center', boxShadow: `0 10px 32px ${themePrimary}15` }}>
                <div style={{ width: 64, height: 64, borderRadius: 9999, background: grad, display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
                  <Icon size={28} color="#fff" />
                </div>
                <h3 style={{ margin: 0, fontFamily: headingFont, fontSize: 19, color: text }}>{f.title}</h3>
                <p style={{ color: textDim, marginTop: 8, lineHeight: 1.65 }}>{f.description}</p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // ── minimal (investor) ──────────────────────────────────────────────────
  if (variant === 'minimal' || variant === 'minimal-dark') {
    return (
      <section data-testid="sec-features-minimal" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1100, margin: '0 auto', fontFamily: bodyFont }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, borderTop: `1px solid ${themePrimary}22` }}>
          {items.map((f, i) => {
            const Icon = Icons[f.icon] || Icons.Check;
            return (
              <div key={i} style={{ padding: '24px 0', borderBottom: `1px solid ${themePrimary}11` }}>
                <Icon size={18} color={themePrimary} />
                <h3 style={{ margin: '12px 0 6px', fontFamily: headingFont, fontSize: 15, color: text }}>{f.title}</h3>
                <p style={{ color: textDim, fontSize: 13, lineHeight: 1.55, margin: 0 }}>{f.description}</p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // ── checkmarks-fast (urgent) ────────────────────────────────────────────
  if (variant === 'checkmarks-fast') {
    return (
      <section data-testid="sec-features-check" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 760, margin: '0 auto', fontFamily: bodyFont }}>
        {items.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 0', borderBottom: `1px solid ${themePrimary}22` }}>
            <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 9999, background: themePrimary, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>✓</div>
            <div>
              <strong style={{ fontFamily: headingFont, color: text }}>{f.title}</strong>
              <div style={{ color: textDim, fontSize: 14, marginTop: 4 }}>{f.description}</div>
            </div>
          </div>
        ))}
      </section>
    );
  }

  // ── scroll-sticky (scrollytelling) ──────────────────────────────────────
  if (variant === 'scroll-sticky') {
    return (
      <section data-testid="sec-features-sticky" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1100, margin: '0 auto', fontFamily: bodyFont }}>
        {items.map((f, i) => {
          const Icon = Icons[f.icon] || Icons.Sparkles;
          return (
            <div key={i} style={{ minHeight: '60vh', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 40, alignItems: 'center', padding: '64px 0' }}>
              <div style={{ position: 'sticky', top: 80 }}>
                <Icon size={36} color={themePrimary} />
                <h3 style={{ margin: '14px 0 0', fontFamily: headingFont, fontSize: 30, color: text, lineHeight: 1.15 }}>{f.title}</h3>
                <p style={{ color: textDim, marginTop: 14, fontSize: 17, lineHeight: 1.7 }}>{f.description}</p>
              </div>
              <div style={{ aspectRatio: '4/5', borderRadius: radius, background: grad, opacity: 0.4 }} />
            </div>
          );
        })}
      </section>
    );
  }

  // ── with-reviews (social_proof) ─────────────────────────────────────────
  if (variant === 'with-reviews') {
    return (
      <section data-testid="sec-features-reviews" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1200, margin: '0 auto', fontFamily: bodyFont }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {items.map((f, i) => {
            const Icon = Icons[f.icon] || Icons.Star;
            return (
              <div key={i} style={{ padding: 24, borderRadius: radius || 16, background: 'rgba(34,197,94,0.06)', border: `1px solid ${themePrimary}33` }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                  {Array.from({ length: 5 }).map((_, j) => <span key={j} style={{ color: themePrimary, fontSize: 14 }}>★</span>)}
                </div>
                <Icon size={20} color={themePrimary} />
                <h3 style={{ margin: '10px 0 4px', fontFamily: headingFont, fontSize: 17, color: text }}>{f.title}</h3>
                <p style={{ color: textDim, marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>{f.description}</p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // ── comparison-grid (compare) ───────────────────────────────────────────
  if (variant === 'comparison-grid') {
    return (
      <section data-testid="sec-features-compare" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1100, margin: '0 auto', fontFamily: bodyFont }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 12, alignItems: 'center', padding: '14px 18px', background: grad, color: '#fff', borderRadius: radius || 12, marginBottom: 6, fontWeight: 700 }}>
          <span>Caracteristica</span>
          <span style={{ textAlign: 'center', opacity: 0.7, fontSize: 12 }}>Otros</span>
          <span style={{ textAlign: 'center', fontSize: 12 }}>DMX</span>
        </div>
        {items.map((f, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 12, alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${themePrimary}22` }}>
            <div>
              <strong style={{ fontFamily: headingFont, color: text }}>{f.title}</strong>
              <div style={{ color: textDim, fontSize: 12, marginTop: 2 }}>{f.description}</div>
            </div>
            <div style={{ textAlign: 'center', color: textDim, fontSize: 18, opacity: 0.5 }}>✗</div>
            <div style={{ textAlign: 'center', color: themeSecondary, fontSize: 22, fontWeight: 800 }}>✓</div>
          </div>
        ))}
      </section>
    );
  }

  // ── cards (modern) · DEFAULT ────────────────────────────────────────────
  return (
    <section data-testid="sec-features-cards" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1200, margin: '0 auto', fontFamily: bodyFont }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {items.map((f, i) => {
          const Icon = Icons[f.icon] || Icons.Sparkles;
          return (
            <div key={i} data-testid={`feature-${i}`} style={{ padding: 24, borderRadius: radius || 14, background: 'rgba(13,16,23,0.6)', border: `1px solid ${themePrimary}33` }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: grad, display: 'grid', placeItems: 'center', marginBottom: 14 }}>
                <Icon size={20} color="#fff" />
              </div>
              <h3 style={{ margin: 0, fontFamily: headingFont, fontSize: 17, color: text }}>{f.title}</h3>
              <p style={{ color: textDim, marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>{f.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

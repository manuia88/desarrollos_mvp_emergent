// W5.22 Z.8.2 — Features: minimal / cards / alternating
import React from 'react';
import * as Icons from 'lucide-react';

export default function FeaturesSection({ config = {}, brandKit = {} }) {
  const layout = config.layout || 'cards';
  const cols = config.columns || 3;
  const items = config.items || [];
  const primary = brandKit.color_primary || '#6366F1';
  const secondary = brandKit.color_secondary || '#EC4899';
  const grad = `linear-gradient(135deg, ${primary}, ${secondary})`;
  if (!items.length) return null;

  if (layout === 'alternating') {
    return (
      <section data-testid="sec-features-alt" style={{ padding: '4rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>
        {items.map((f, i) => {
          const Icon = Icons[f.icon] || Icons.Sparkles;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: i % 2 === 0 ? '1fr 2fr' : '2fr 1fr', gap: 32, alignItems: 'center', marginBottom: 48 }}>
              {i % 2 === 0 ? (
                <>
                  <div style={{ aspectRatio: '4/3', borderRadius: 14, background: grad, opacity: 0.4 }} />
                  <div>
                    <Icon size={28} color={primary} />
                    <h3 style={{ margin: '12px 0 0', fontFamily: 'Outfit, sans-serif', fontSize: 22 }}>{f.title}</h3>
                    <p style={{ color: 'rgba(240,235,224,0.62)', marginTop: 8 }}>{f.description}</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Icon size={28} color={secondary} />
                    <h3 style={{ margin: '12px 0 0', fontFamily: 'Outfit, sans-serif', fontSize: 22 }}>{f.title}</h3>
                    <p style={{ color: 'rgba(240,235,224,0.62)', marginTop: 8 }}>{f.description}</p>
                  </div>
                  <div style={{ aspectRatio: '4/3', borderRadius: 14, background: grad, opacity: 0.4 }} />
                </>
              )}
            </div>
          );
        })}
      </section>
    );
  }

  return (
    <section data-testid={`sec-features-${layout}`} style={{ padding: '4rem 1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols > 3 ? '220' : '260'}px, 1fr))`, gap: 16 }}>
        {items.map((f, i) => {
          const Icon = Icons[f.icon] || Icons.Sparkles;
          return (
            <div key={i} data-testid={`feature-${i}`} style={{ padding: layout === 'minimal' ? 16 : 24, borderRadius: 14, background: layout === 'cards' ? 'rgba(13,16,23,0.6)' : 'transparent', border: layout === 'cards' ? '1px solid rgba(99,102,241,0.18)' : 'none' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: grad, display: 'grid', placeItems: 'center', marginBottom: 14 }}>
                <Icon size={20} color="#fff" />
              </div>
              <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 17 }}>{f.title}</h3>
              <p style={{ color: 'rgba(240,235,224,0.62)', marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>{f.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

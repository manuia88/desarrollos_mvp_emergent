// W5.22 Z.8.2 — PriceTable: 2/3/4 col comparison · highlight col gradient
import React from 'react';

export default function PriceTableSection({ config = {}, brandKit = {} }) {
  const tiers = config.tiers || [
    { name: 'Basico', price: '$4.8M', features: ['Tipo 1R', '54m2', 'Roof'], cta: 'Reservar' },
    { name: 'Premium', price: '$7.2M', features: ['Tipo 2R', '88m2', 'Roof + Parking'], cta: 'Reservar', highlight: true },
    { name: 'Penthouse', price: '$12.5M', features: ['PH', '140m2', 'Premium Pack'], cta: 'Consultar' },
  ];
  const primary = brandKit.color_primary || '#6366F1';
  const secondary = brandKit.color_secondary || '#EC4899';
  const grad = `linear-gradient(135deg, ${primary}, ${secondary})`;

  return (
    <section data-testid="sec-price-table" style={{ padding: '4rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'Outfit, sans-serif', textAlign: 'center', margin: '0 0 32px', fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>{config.title || 'Selecciona tu tipologia'}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))`, gap: 18 }}>
        {tiers.map((t, i) => (
          <div key={i} data-testid={`price-tier-${i}`} style={{ position: 'relative', padding: 28, borderRadius: 18, background: t.highlight ? grad : 'rgba(13,16,23,0.6)', border: t.highlight ? 'none' : '1px solid rgba(99,102,241,0.18)', color: '#F0EBE0' }}>
            {t.highlight && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', padding: '4px 12px', borderRadius: 9999, background: '#fff', color: '#111', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>POPULAR</div>}
            <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 20 }}>{t.name}</h3>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 36, fontWeight: 800, margin: '12px 0' }}>{t.price}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'grid', gap: 8 }}>
              {(t.features || []).map((f, j) => (
                <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, opacity: t.highlight ? 1 : 0.85 }}>
                  <span style={{ color: t.highlight ? '#fff' : primary }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button type="button" style={{ width: '100%', padding: '12px 20px', borderRadius: 9999, background: t.highlight ? '#fff' : grad, color: t.highlight ? '#111' : '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{t.cta || 'Reservar'}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

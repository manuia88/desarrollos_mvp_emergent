// LiveTicker — marquee of diverse colonias with live price m² and momentum
import React from 'react';
import { useTranslation } from 'react-i18next';
import { COLONIAS } from '../../data/colonias';

export default function LiveTicker() {
  const { t } = useTranslation();
  // Use 14 colonias for ticker
  const ITEMS = COLONIAS.slice(0, 14).map(c => ({
    name: c.name, price: `${c.priceM2}/m²`, delta: c.momentum, up: c.momentumPositive,
  }));
  const DOUBLED = [...ITEMS, ...ITEMS];

  return (
    <section
      data-testid="live-ticker"
      style={{
        height: 52,
        background: '#0A0D16',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        marginTop: 24,
        position: 'relative',
        zIndex: 10,
      }}
    >
      <div style={{
        flexShrink: 0, width: 220,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 20px',
        borderRight: '1px solid var(--border)',
        background: '#0A0D16', zIndex: 2,
      }}>
        <div className="pulse-dot" />
        <span style={{
          fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12,
          color: 'var(--cream-2)', whiteSpace: 'nowrap',
        }}>
          {t('ticker.label')}
        </span>
      </div>

      <div style={{
        position: 'absolute', left: 220, top: 0, width: 40, height: '100%',
        background: 'linear-gradient(to right, #0A0D16, transparent)',
        zIndex: 2, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', right: 0, top: 0, width: 60, height: '100%',
        background: 'linear-gradient(to left, #0A0D16, transparent)',
        zIndex: 2, pointerEvents: 'none',
      }} />

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div className="marquee-row" style={{ animationDuration: '72s', gap: 0 }}>
          {DOUBLED.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 28px',
              borderRight: '1px solid var(--border)',
              whiteSpace: 'nowrap',
            }}>
              <span style={{
                fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12,
                color: 'var(--cream-2)',
              }}>{item.name}</span>
              <span style={{
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
                color: 'var(--cream)',
              }}>{item.price}</span>
              <span className={item.up ? 'mom-pill mom-up' : 'mom-pill mom-dn'}>
                {item.delta}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

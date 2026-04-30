// LiveTicker — 52px height, marquee 60s, 12 colonias x2 duplication
import React from 'react';

const TICKER_ITEMS = [
  { name: 'Del Valle', price: '$58k/m²', delta: '+6%', up: true },
  { name: 'Condesa', price: '$72k/m²', delta: '+4%', up: true },
  { name: 'Roma Norte', price: '$68k/m²', delta: '+8%', up: true },
  { name: 'Polanco', price: '$95k/m²', delta: '+3%', up: true },
  { name: 'Nápoles', price: '$52k/m²', delta: '+5%', up: true },
  { name: 'Santa Fe', price: '$85k/m²', delta: '+2%', up: true },
  { name: 'Escandón', price: '$61k/m²', delta: '-1%', up: false },
  { name: 'Doctores', price: '$38k/m²', delta: '+1%', up: true },
  { name: 'Narvarte', price: '$55k/m²', delta: '+7%', up: true },
  { name: 'Pedregal', price: '$78k/m²', delta: '+2%', up: true },
  { name: 'Lomas', price: '$110k/m²', delta: '+1%', up: true },
  { name: 'Coyoacán', price: '$65k/m²', delta: '+4%', up: true },
];

// Duplicate for seamless loop
const DOUBLED = [...TICKER_ITEMS, ...TICKER_ITEMS];

export default function LiveTicker() {
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
      {/* Fixed label */}
      <div style={{
        flexShrink: 0,
        width: 200,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 20px',
        borderRight: '1px solid var(--border)',
        background: '#0A0D16',
        zIndex: 2,
      }}>
        <div className="pulse-dot" />
        <span style={{
          fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12,
          color: 'var(--cream-2)',
          whiteSpace: 'nowrap',
        }}>
          Precio m² · En vivo
        </span>
      </div>

      {/* Left fade */}
      <div style={{
        position: 'absolute', left: 200, top: 0, width: 40, height: '100%',
        background: 'linear-gradient(to right, #0A0D16, transparent)',
        zIndex: 2, pointerEvents: 'none',
      }} />
      {/* Right fade */}
      <div style={{
        position: 'absolute', right: 0, top: 0, width: 60, height: '100%',
        background: 'linear-gradient(to left, #0A0D16, transparent)',
        zIndex: 2, pointerEvents: 'none',
      }} />

      {/* Scrolling track */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div
          className="marquee-row"
          style={{ animationDuration: '60s', gap: 0 }}
        >
          {DOUBLED.map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 28px',
                borderRight: '1px solid var(--border)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12,
                color: 'var(--cream-2)',
              }}>
                {item.name}
              </span>
              <span style={{
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
                color: 'var(--cream)',
              }}>
                {item.price}
              </span>
              <span className={item.up ? 'mom-up' : 'mom-dn'}>
                {item.delta}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

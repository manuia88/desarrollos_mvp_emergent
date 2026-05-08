// W3.6 — VerticalProductCard
import React from 'react';
import { Badge } from '../advisor/primitives';

export default function VerticalProductCard({ vertical, stats, onTest }) {
  const { key, name, tier_required, description, icon: Icon } = vertical;
  return (
    <div data-testid={`vertical-card-${key}`}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        borderRadius: 16, padding: 18,
        display: 'flex', flexDirection: 'column', gap: 10,
        minHeight: 180,
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {Icon && (
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.36)',
              color: '#a5b4fc',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={18} />
            </div>
          )}
          <div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>
              {name}
            </h3>
            <Badge tone={tier_required === 'enterprise' ? 'pink' : 'brand'}>
              {tier_required}+
            </Badge>
          </div>
        </div>
      </div>
      <p style={{
        fontFamily: 'DM Sans', fontSize: 12.5,
        color: 'var(--cream-3)', lineHeight: 1.55, margin: 0, flex: 1,
      }}>{description}</p>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Calls 30d</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
            {(stats?.calls_30d || 0).toLocaleString('es-MX')}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Avg ms</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
            {Math.round(stats?.avg_latency_ms || 0)}
          </div>
        </div>
      </div>
      <button data-testid={`vertical-card-test-${key}-btn`}
        onClick={() => onTest?.(vertical)}
        style={{
          padding: '8px 14px', borderRadius: 9999,
          background: 'rgba(99,102,241,0.10)',
          border: '1px solid rgba(99,102,241,0.36)',
          color: '#a5b4fc', cursor: 'pointer',
          fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5,
          marginTop: 4,
        }}>Probar endpoint · ver snippet</button>
    </div>
  );
}

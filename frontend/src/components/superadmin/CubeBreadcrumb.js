// W2.5 SA6 — Cube breadcrumb (city > alcaldia > colonia > development > unit)
import React from 'react';
import { ChevronRight } from 'lucide-react';

const TIER_LABEL = {
  city: 'Ciudad', alcaldia: 'Alcaldía', colonia: 'Colonia',
  development: 'Desarrollo', unit: 'Unidad',
};

export default function CubeBreadcrumb({ path, onNavigate }) {
  // path = [{tier, tier_id, name}] last is active
  return (
    <div data-testid="cube-breadcrumb" style={{
      display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      padding: '8px 0', marginBottom: 14,
    }}>
      {path.map((seg, i) => {
        const active = i === path.length - 1;
        return (
          <React.Fragment key={`${seg.tier}-${seg.tier_id}`}>
            {i > 0 && (
              <ChevronRight size={12} style={{ color: 'rgba(240,235,224,0.30)', flexShrink: 0 }} />
            )}
            <button
              data-testid={`cube-breadcrumb-${seg.tier}`}
              onClick={() => !active && onNavigate(i)}
              disabled={active}
              style={{
                padding: '5px 12px', borderRadius: 9999, border: 'none',
                fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600,
                cursor: active ? 'default' : 'pointer',
                background: active
                  ? 'linear-gradient(90deg,#6366F1,#EC4899)'
                  : 'rgba(255,255,255,0.04)',
                color: active ? '#fff' : 'rgba(240,235,224,0.65)',
                border: active ? 'none' : '1px solid rgba(255,255,255,0.10)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                transition: 'background 180ms, transform 180ms',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5,
                opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {TIER_LABEL[seg.tier] || seg.tier}
              </span>
              <span style={{ marginLeft: 3 }}>{seg.name}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

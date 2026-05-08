// W3.6 — DataLicensingBundleCard
import React from 'react';
import { Badge } from '../advisor/primitives';

export default function DataLicensingBundleCard({ bundle, onCreate }) {
  const isCustom = bundle.key === 'custom';
  return (
    <div data-testid={`bundle-card-${bundle.key}`}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        borderRadius: 16, padding: 18,
        display: 'flex', flexDirection: 'column', gap: 8,
        minHeight: 240,
      }}>
      <div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>
          {bundle.name}
        </h3>
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <Badge tone={bundle.frequency === 'daily' ? 'ok' : 'brand'}>{bundle.frequency}</Badge>
          {(bundle.geo_scope || []).map(g => (
            <Badge key={g} tone="muted">{g}</Badge>
          ))}
        </div>
      </div>
      <p style={{
        fontFamily: 'DM Sans', fontSize: 12.5,
        color: 'var(--cream-3)', lineHeight: 1.55, margin: 0, flex: 1,
      }}>{bundle.description}</p>
      <div style={{
        paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Precio anual
        </div>
        <div data-testid={`bundle-card-price-${bundle.key}`} style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
          backgroundImage: 'linear-gradient(90deg,#6366F1,#EC4899)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {isCustom ? 'Personalizado'
            : `$${(bundle.price_usd_annual || 0).toLocaleString('en-US')} USD`}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
          SLA {bundle.sla_uptime_pct}% · {bundle.ideal_for}
        </div>
      </div>
      <button data-testid={`bundle-card-create-${bundle.key}-btn`}
        onClick={() => onCreate?.(bundle)}
        style={{
          padding: '9px 16px', borderRadius: 9999,
          backgroundImage: 'linear-gradient(90deg,#6366F1,#EC4899)',
          border: '1px solid rgba(255,255,255,0.16)',
          color: '#fff', cursor: 'pointer',
          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
          marginTop: 4,
        }}>Crear suscripción</button>
    </div>
  );
}

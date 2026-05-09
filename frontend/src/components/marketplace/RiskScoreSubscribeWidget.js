// W3.9c — RiskScoreSubscribeWidget · marketplace single-zone subscribe
// Shown when user filters/searches by a specific zone
import React, { useState } from 'react';
import WatchlistSubscribeForm from '../watchlist/WatchlistSubscribeForm';

export default function RiskScoreSubscribeWidget({ zoneId, zoneLabel }) {
  const [open, setOpen] = useState(false);

  if (!zoneId) return null;

  return (
    <div
      data-testid="risk-score-subscribe-widget"
      style={{
        background: 'rgba(13,16,23,0.92)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: 16,
        padding: 16,
        marginTop: 14,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}>
        <div>
          <div style={{
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
            color: 'var(--cream)', letterSpacing: '-0.01em',
          }}>
            Alertas de riesgo · {zoneLabel || zoneId}
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
            marginTop: 2,
          }}>
            Recibe email cuando esta zona cambie a tier de riesgo crítico.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="btn btn-glass"
          style={{ padding: '8px 14px', fontSize: 12 }}
          data-testid="risk-subscribe-toggle"
        >
          {open ? 'Cerrar' : 'Suscribirme'}
        </button>
      </div>

      {open && (
        <div style={{
          marginTop: 14,
          paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <WatchlistSubscribeForm
            defaultScope="risk_alerts"
            defaultZoneIds={[zoneId]}
            showScopeSelector={false}
            showZonesField={false}
            ctaLabel="Activar alerta"
            compact
          />
        </div>
      )}
    </div>
  );
}

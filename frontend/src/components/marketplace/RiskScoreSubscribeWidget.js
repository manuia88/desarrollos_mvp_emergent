// W3.9c — RiskScoreSubscribeWidget (single-zone, marketplace sidebar)
import React, { useState } from 'react';
import WatchlistSubscribeForm from '../watchlist/WatchlistSubscribeForm';

export default function RiskScoreSubscribeWidget({ zoneId, zoneLabel }) {
  const [open, setOpen] = useState(false);
  if (!zoneId) return null;

  return (
    <div
      data-testid="risk-score-subscribe-widget"
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: 16,
        background: 'rgba(13,16,23,0.6)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(240,235,224,0.08)',
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{
            fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13,
            color: 'var(--cream)', letterSpacing: '-0.01em',
          }}>
            Alertas riesgo · {zoneLabel}
          </div>
          <div style={{
            fontFamily: 'DM Sans, sans-serif', fontSize: 11,
            color: 'var(--cream-3)', marginTop: 2,
          }}>
            Te avisamos si cambia a tier crítico.
          </div>
        </div>
        <button
          type="button"
          data-testid="risk-score-subscribe-toggle"
          onClick={() => setOpen((o) => !o)}
          style={{
            padding: '5px 14px',
            borderRadius: 9999,
            background: open ? 'rgba(240,235,224,0.06)' : 'rgba(99,102,241,0.18)',
            border: `1px solid ${open ? 'rgba(240,235,224,0.18)' : 'rgba(99,102,241,0.4)'}`,
            color: open ? 'var(--cream-3)' : 'rgba(165,180,252,0.95)',
            fontFamily: 'DM Sans, sans-serif',
            fontWeight: 600,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {open ? 'Cerrar' : 'Suscribirme'}
        </button>
      </div>
      {open && (
        <div data-testid="risk-score-subscribe-panel">
          <WatchlistSubscribeForm
            defaultScope="risk_alerts"
            defaultZoneIds={[zoneId]}
            showZonesField={false}
            showScopeSelector={false}
            ctaLabel="Activar alerta"
            compact
          />
        </div>
      )}
    </div>
  );
}

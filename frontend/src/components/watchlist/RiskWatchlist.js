// W3.9c — RiskWatchlist (público multi-zona)
import React from 'react';
import WatchlistSubscribeForm from './WatchlistSubscribeForm';

export default function RiskWatchlist() {
  return (
    <section
      data-testid="risk-watchlist"
      style={{
        margin: '40px auto 0',
        maxWidth: 720,
        padding: 28,
        borderRadius: 24,
        background: 'rgba(13,16,23,0.5)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(240,235,224,0.08)',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 12px',
          borderRadius: 9999,
          background: 'rgba(99,102,241,0.15)',
          color: 'rgba(165,180,252,0.95)',
          fontFamily: 'DM Sans, sans-serif',
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 14,
        }}
      >
        Watchlist público
      </div>
      <h3
        style={{
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 700,
          fontSize: 'clamp(22px, 2.6vw, 28px)',
          color: 'var(--cream)',
          letterSpacing: '-0.02em',
          margin: '0 0 8px',
        }}
      >
        Sigue el riesgo de tus zonas favoritas
      </h3>
      <p
        style={{
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 14,
          color: 'var(--cream-2)',
          lineHeight: 1.65,
          margin: '0 0 20px',
        }}
      >
        Recibe el boletín mensual del DRPI y alertas cuando una zona en tu lista cambie a tier
        crítico (Risk Score). 1 alerta por semana máximo.
      </p>
      <WatchlistSubscribeForm
        defaultScope="both"
        showZonesField
        showScopeSelector
        ctaLabel="Crear watchlist"
      />
    </section>
  );
}

// W3.9c — RiskWatchlist · public multi-zone subscribe panel
// Mounted on /inteligencia · invites visitors to track multiple zones at once
import React from 'react';
import WatchlistSubscribeForm from './WatchlistSubscribeForm';

export default function RiskWatchlist() {
  return (
    <section
      data-testid="risk-watchlist-public"
      style={{
        marginTop: 32,
        padding: 28,
        background: 'rgba(13,16,23,0.5)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        backdropFilter: 'blur(24px)',
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8, color: 'rgba(99,102,241,0.9)' }}>
          WATCHLIST PÚBLICO
        </div>
        <h3 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(22px, 2.6vw, 28px)',
          color: 'var(--cream)', letterSpacing: '-0.02em', margin: '0 0 8px',
        }}>
          Sigue el riesgo de tus zonas favoritas
        </h3>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)',
          lineHeight: 1.6, maxWidth: 560, margin: 0,
        }}>
          Escribe los slugs de las zonas que te interesan (ej. <code style={{ color: '#a5b4fc' }}>polanco</code>,{' '}
          <code style={{ color: '#a5b4fc' }}>condesa</code>) y recibe alertas cuando cualquiera cambie a
          tier de riesgo crítico. Free · 1 alerta/sem máx.
        </p>
      </div>

      <div style={{ maxWidth: 480 }}>
        <WatchlistSubscribeForm
          defaultScope="both"
          defaultZoneIds={[]}
          showScopeSelector={true}
          showZonesField={true}
          zoneFieldLabel="Zonas a seguir (slugs separados por coma)"
          ctaLabel="Crear watchlist"
        />
      </div>
    </section>
  );
}

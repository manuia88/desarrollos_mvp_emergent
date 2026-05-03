// /desarrollador/crm/metricas-equipo — Team Metrics (B21 Sub-A: Tour Completion)
import React from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import TourCompletionAnalytics from '../../components/developer/TourCompletionAnalytics';

export default function MetricasEquipo({ user, onLogout }) {
  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div
        data-testid="metricas-equipo-page"
        style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px', fontFamily: 'DM Sans' }}
      >
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>CRM · Analytics</div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
            color: 'var(--cream)', margin: 0, marginBottom: 8,
          }}>
            Métricas del equipo
          </h1>
          <p style={{ color: 'var(--cream-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Análisis de adopción del onboarding tour por rol y período.
          </p>
        </div>

        {/* Tour Completion Analytics — B21 Sub-A */}
        <section style={{ marginBottom: 40 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
            paddingBottom: 12, borderBottom: '1px solid rgba(240,235,224,0.08)',
          }}>
            <h2 style={{
              fontFamily: 'Outfit', fontWeight: 700, fontSize: 18,
              color: 'var(--cream)', margin: 0,
            }}>
              Onboarding tour completion
            </h2>
          </div>
          <TourCompletionAnalytics />
        </section>

        {/* Sub-B + Sub-C sections will be added in subsequent batches */}
      </div>
    </DeveloperLayout>
  );
}

/**
 * SuperadminOnboardingAnalytics — ruta /superadmin/onboarding-analytics
 * Expone TourCompletionAnalytics para el superadmin.
 */
import React from 'react';
import { PortalLayout } from '../../components/shared/PortalLayout';
import TourCompletionAnalytics from '../../components/developer/TourCompletionAnalytics';

export default function SuperadminOnboardingAnalyticsPage({ user, onLogout }) {
  return (
    <PortalLayout role="superadmin" user={user} onLogout={onLogout}>
      <div
        data-testid="superadmin-onboarding-analytics"
        style={{
          minHeight: '100%',
          background: 'var(--bg)',
          fontFamily: 'DM Sans, sans-serif',
          padding: '32px 24px',
        }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Superadmin · Onboarding</div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
            color: 'var(--cream)', margin: 0, marginBottom: 6,
            letterSpacing: '-0.02em',
          }}>
            Analytics de Tours
          </h1>
          <p style={{ color: 'var(--cream-2)', fontSize: 14, marginBottom: 32 }}>
            Tasa de finalización de tours de bienvenida por rol y periodo.
          </p>
          <TourCompletionAnalytics />
        </div>
      </div>
    </PortalLayout>
  );
}

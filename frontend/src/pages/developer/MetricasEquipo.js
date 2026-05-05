/**
 * Phase 4 Batch 21 — Métricas del equipo
 *
 * Page: /desarrollador/metricas-equipo
 * 3 secciones: Tour analytics (Sub-A) · Productividad (Sub-B) · Tabla equipo (Sub-C).
 * Filter chip "Período" en topbar controla las 3 secciones simultáneamente.
 */
import React, { useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { FilterChipsBar } from '../../components/shared/FilterChipsBar';
import TourCompletionAnalytics from '../../components/developer/TourCompletionAnalytics';
import ProductivityWidget from '../../components/developer/ProductivityWidget';
import TeamAggregatedTable from '../../components/developer/TeamAggregatedTable';

const PERIOD_LABELS = { '7d': '7 días', '30d': '30 días', '90d': '90 días' };

const PERIOD_FILTER_CONFIG = [{
  key: 'period',
  label: 'Período',
  options: [
    { value: '7d',  label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: '90d', label: '90 días' },
  ],
}];

export default function MetricasEquipo({ user, onLogout }) {
  const [period, setPeriod] = useState('30d');
  const handleFilterChange = useCallback((key, value) => {
    if (key === 'period') {
      setPeriod(value || '30d');
    }
  }, []);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div
        data-testid="metricas-equipo-page"
        style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px', fontFamily: 'DM Sans' }}
      >
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>CRM · Analytics</div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
            color: 'var(--cream)', margin: 0, marginBottom: 8,
          }}>
            Métricas del equipo
          </h1>
          <p style={{ color: 'var(--cream-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Tour completion · productividad · tabla agregada por asesor.
          </p>
        </div>

        {/* Period filter chips topbar — controla las 3 secciones */}
        <div data-testid="metricas-period-bar" style={{ marginBottom: 18 }}>
          <FilterChipsBar
            filters_config={PERIOD_FILTER_CONFIG}
            current_state={{ period }}
            on_change={handleFilterChange}
            sync_url={true}
          />
        </div>

        {/* Section 1 — Tour completion (Sub-A) */}
        <Section title={`Onboarding tour completion · Últimos ${PERIOD_LABELS[period]}`}
                  testId="metricas-section-tour">
          <TourCompletionAnalytics period={period} />
        </Section>

        {/* Section 2 — Productividad (Sub-B) */}
        <Section title={`Productividad del equipo · Últimos ${PERIOD_LABELS[period]}`}
                  testId="metricas-section-productividad">
          <ProductivityWidget period={period} />
        </Section>

        {/* Section 3 — Tabla equipo (Sub-C) */}
        <Section title={`Tabla equipo · Últimos ${PERIOD_LABELS[period]}`}
                  testId="metricas-section-tabla">
          <TeamAggregatedTable period={period} />
        </Section>
      </div>
    </DeveloperLayout>
  );
}

function Section({ title, testId, children }) {
  return (
    <section data-testid={testId} style={{ marginTop: 28, marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
        paddingBottom: 12, borderBottom: '1px solid rgba(240,235,224,0.08)',
      }}>
        <h2 style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 18,
          color: 'var(--cream)', margin: 0,
        }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

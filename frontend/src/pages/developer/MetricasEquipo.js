/**
 * Phase 4 Batch 21 — Métricas del equipo
 *
 * Page: /desarrollador/metricas-equipo
 * 3 secciones: Tour analytics (Sub-A) · Productividad (Sub-B) · Tabla equipo (Sub-C).
 * Filter chip "Período" en topbar controla las 3 secciones simultáneamente.
 */
import React, { useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader } from '../../components/advisor/primitives';
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
      // Don't allow null — keep a value
      setPeriod(value || '30d');
    }
  }, []);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="MÉTRICAS · EQUIPO"
        title="Rendimiento del equipo"
        sub="Tour completion · productividad · tabla agregada"
      />

      {/* Period filter chips topbar */}
      <div data-testid="metricas-period-bar" style={{ marginBottom: 18 }}>
        <FilterChipsBar
          filters_config={PERIOD_FILTER_CONFIG}
          current_state={{ period }}
          on_change={handleFilterChange}
          sync_url={true}
        />
      </div>

      {/* Section 1 — Tour completion (Sub-A) */}
      <Section title={`Tour completion · Últimos ${PERIOD_LABELS[period]}`}
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
    </DeveloperLayout>
  );
}

function Section({ title, testId, children }) {
  return (
    <section data-testid={testId} style={{ marginTop: 28 }}>
      <h2 style={{
        margin: '0 0 12px',
        fontFamily: 'Outfit', fontSize: 17, fontWeight: 700,
        color: 'var(--cream)', letterSpacing: '-0.01em',
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

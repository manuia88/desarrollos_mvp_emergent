/**
 * Phase 4 Batch 20 · /desarrollador/crm/asesores-metrics — Tabla equipo + drawer.
 *
 * Reutiliza TeamAggregatedTable (B21 Sub-C) que ya tiene 9 cols sortables, drawer
 * con sparklines y SmartEmptyState. Aquí extendemos con FilterChipsBar period
 * a nivel page.
 */
import React, { useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader } from '../../components/advisor/primitives';
import { FilterChipsBar } from '../../components/shared/FilterChipsBar';
import TeamAggregatedTable from '../../components/developer/TeamAggregatedTable';

const PERIOD_FILTERS = [{
  key: 'period', label: 'Periodo',
  options: [
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: '90d', label: '90 días' },
  ],
}];

export default function AsesoresMetrics({ user, onLogout, embedded }) {
  const [period, setPeriod] = useState('30d');
  const handle = useCallback((k, v) => {
    if (k === 'period') setPeriod(v || '30d');
  }, []);
  return (
    <DeveloperLayout user={user} onLogout={onLogout} bare={embedded}>
      <PageHeader
        eyebrow="CRM · ASESORES"
        title="Métricas del equipo"
        sub="Pipeline · conversión · tiempo de respuesta · nivel de actividad · salud · citas"
      />
      <div data-testid="asesores-metrics-filters" style={{ marginBottom: 14 }}>
        <FilterChipsBar
          filters_config={PERIOD_FILTERS}
          current_state={{ period }}
          on_change={handle}
          sync_url={true}
        />
      </div>
      <TeamAggregatedTable period={period} />
    </DeveloperLayout>
  );
}

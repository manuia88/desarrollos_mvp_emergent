/**
 * Phase 4 Batch 21 · Sub-Chunk A — <TourCompletionAnalytics> (STUB)
 *
 * Placeholder shipped alongside Sub-B/C to allow MetricasEquipo to render.
 * Will be replaced when Sub-A's full implementation lands.
 */
import React from 'react';

export default function TourCompletionAnalytics({ period = '30d' }) {
  return (
    <div data-testid="tour-completion-analytics-stub"
         style={{
           padding: 20, borderRadius: 14,
           background: 'rgba(99,102,241,0.06)',
           border: '1px dashed rgba(99,102,241,0.25)',
           color: 'var(--cream-2)',
           fontFamily: 'DM Sans',
         }}>
      <div style={{
        fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: '#a5b4fc', marginBottom: 6,
      }}>
        Tour Completion Analytics · stub Sub-A
      </div>
      <p style={{ margin: 0, fontSize: 13 }}>
        Esta sección mostrará métricas de tours completados por asesor (período activo:
        <strong> {period}</strong>). Pendiente de implementación del Batch 21 Sub-A.
      </p>
    </div>
  );
}

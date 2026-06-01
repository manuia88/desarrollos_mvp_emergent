/**
 * Phase 3 Batch 31 · Page — /asesor/briefing
 * Briefing pre-visita: tráfico + clima al destino del proyecto.
 */
import React from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader } from '../../components/advisor/primitives';
import TrafficBriefingWidget from '../../components/asesor/TrafficBriefingWidget';

export default function AsesorBriefingTraffic({ user, onLogout }) {
  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="HERRAMIENTAS · BRIEFING DE VISITA"
        title="Tráfico y clima en vivo"
        sub="Calcula tiempo real de traslado y condiciones meteorológicas antes de visitar un proyecto. Comparte el briefing con el cliente para reducir cancelaciones."
      />

      <div data-testid="asesor-briefing-page" style={{
        display: 'grid', gap: 18, marginTop: 12,
      }}>
        <TrafficBriefingWidget />

        <div style={{
          padding: 16, borderRadius: 14,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.7,
        }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--cream-3)', marginBottom: 8,
          }}>Cómo aprovechar este briefing</div>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>Envíalo por WhatsApp 1 hora antes de la visita.</li>
            <li>Si el tráfico supera 30 min, ofrece punto de encuentro intermedio.</li>
            <li>Cuando el clima es lluvia/tormenta, mueve la visita o asegura traslado techado.</li>
            <li>Caché 15 min: consultas repetidas no consumen cuota Mapbox.</li>
          </ul>
        </div>
      </div>
    </AdvisorLayout>
  );
}

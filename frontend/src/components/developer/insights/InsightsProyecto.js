/**
 * InsightsProyecto — "Inteligencia del proyecto" en UN solo scroll (founder).
 * Apila, a nivel proyecto y sin sub-tabs escondidos: valor de mercado + resumen,
 * comparación con la zona, demanda/engagement y predicción de venta.
 */
import React from 'react';
import InsightsResumen from './InsightsResumen';
import InsightsComparables from './InsightsComparables';
import InsightsEngagement from './InsightsEngagement';
import InsightsIA from './InsightsIA';

function Divider() {
  return <div style={{ borderTop: '1px solid rgba(var(--cream-rgb),0.08)' }} />;
}

function Section({ title, subtitle, children }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 16, fontWeight: 800, color: 'var(--cream)' }}>{title}</h3>
        {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--cream-3)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default function InsightsProyecto({ projectId, user }) {
  return (
    <div data-testid="insights-proyecto" style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <Section title="Resumen y valor de mercado" subtitle="Cómo va el proyecto y tu precio vs la zona.">
        <InsightsResumen projectId={projectId} />
      </Section>
      <Divider />
      <Section title="Cómo te comparas con la zona" subtitle="Tu proyecto frente a desarrollos parecidos.">
        <InsightsComparables projectId={projectId} />
      </Section>
      <Divider />
      <Section title="Demanda e interés" subtitle="Quién está viendo y contactando tu proyecto.">
        <InsightsEngagement projectId={projectId} />
      </Section>
      <Divider />
      <Section title="Predicción de venta (IA)" subtitle="Qué esperar y qué conviene hacer.">
        <InsightsIA projectId={projectId} user={user} />
      </Section>
    </div>
  );
}

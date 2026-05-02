// AsesorLeadsDev — /asesor/leads-dev
// Phase 4 Batch 4.2 — Universal LeadKanban scoped to mine (asesor own leads of dev origin)
import React, { useState } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import LeadKanban from '../../components/shared/LeadKanban';
import { Toast } from '../../components/advisor/primitives';
import { Target } from '../../components/icons';

export default function AsesorLeadsDev({ user, onLogout }) {
  const [toast, setToast] = useState(null);

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>4.29 · LEADS UNIVERSAL</div>
        <h1 data-testid="asesor-leads-dev-h1" style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--cream)',
          letterSpacing: '-0.025em', margin: '4px 0 6px',
        }}>
          <Target size={20} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          Mis leads de desarrollos
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 720, lineHeight: 1.55 }}>
          Kanban con tus leads de desarrollos. Arrastra tarjetas para actualizar la etapa.
          Los badges <strong>2 proyectos</strong> identifican clientes con citas activas en otros desarrollos.
        </p>
      </div>

      <LeadKanban scope="mine" onToast={setToast} />

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </AdvisorLayout>
  );
}

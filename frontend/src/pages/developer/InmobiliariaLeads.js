// InmobiliariaLeads — /inmobiliaria/leads
// Phase 4 Batch 4.2 — Universal LeadKanban scoped to all_inmobiliaria
import React, { useState } from 'react';
import InmobiliariaLayout from '../../components/developer/InmobiliariaLayout';
import LeadKanban from '../../components/shared/LeadKanban';
import { Toast } from '../../components/advisor/primitives';
import { Target } from '../../components/icons';

export default function InmobiliariaLeads({ user, onLogout }) {
  const [toast, setToast] = useState(null);

  return (
    <InmobiliariaLayout user={user} onLogout={onLogout}>
      <div style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>4.30 · LEADS UNIVERSAL</div>
        <h1 data-testid="inmobiliaria-leads-h1" style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--cream)',
          letterSpacing: '-0.025em', margin: '4px 0 6px',
        }}>
          <Target size={20} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          Pipeline de leads
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 720, lineHeight: 1.55 }}>
          Kanban universal con todos los leads asignados a tu inmobiliaria. Arrastra tarjetas para mover entre etapas.
          Los iconos <strong>Lock</strong> indican leads sobre los que no tienes permiso de movimiento.
        </p>
      </div>

      <LeadKanban scope="all_inmobiliaria" onToast={setToast} />

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </InmobiliariaLayout>
  );
}

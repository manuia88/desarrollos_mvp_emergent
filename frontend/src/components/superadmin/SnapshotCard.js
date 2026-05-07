// W2.4 SA5 — SnapshotCard
import React from 'react';
import { Camera, Edit3, ArrowRightCircle, Layers } from 'lucide-react';

export default function SnapshotCard({ snapshot, onEdit, onApply }) {
  const s = snapshot.summary || {};
  const stats = [];
  if (s.features) stats.push(`${s.features} features`);
  if (s.pipeline_stages) stats.push(`pipeline ${s.pipeline_stages} etapas`);
  if (s.email_templates) stats.push(`${s.email_templates} emails`);
  if (s.automations) stats.push(`${s.automations} autos`);
  if (s.has_branding) stats.push('branding');
  if (s.has_disc) stats.push('DISC');
  if (s.has_reportes) stats.push('reportes');

  return (
    <div data-testid={`snapshot-card-${snapshot.id}`} style={{
      padding: 18, borderRadius: 14,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(236,72,153,0.10)',
          border: '1px solid rgba(236,72,153,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#EC4899', flexShrink: 0,
        }}>
          <Camera size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>
              {snapshot.name}
            </h3>
            <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 9.5, fontFamily: 'DM Sans', fontWeight: 700, background: 'rgba(255,255,255,0.05)', color: 'rgba(240,235,224,0.65)', textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid rgba(255,255,255,0.10)' }}>
              {snapshot.scope}
            </span>
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', margin: 0, lineHeight: 1.4 }}>
            {snapshot.description || '—'}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.55)' }}>
        <Layers size={11} />
        {stats.length === 0 ? 'Vacío' : stats.join(' · ')}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button data-testid={`snap-edit-${snapshot.id}`} onClick={() => onEdit && onEdit(snapshot)}
          style={{ padding: '6px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Edit3 size={10} /> Editar
        </button>
        <button data-testid={`snap-apply-${snapshot.id}`} onClick={() => onApply && onApply(snapshot)}
          style={{ padding: '6px 14px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <ArrowRightCircle size={10} /> Aplicar
        </button>
      </div>
    </div>
  );
}

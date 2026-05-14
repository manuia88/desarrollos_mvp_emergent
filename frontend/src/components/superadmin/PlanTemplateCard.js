// W2.4 SA5 — PlanTemplateCard
import React from 'react';
import { Briefcase, Edit3, ArrowRightCircle } from 'lucide-react';

const TIER_CFG = {
  basic:      { color: '#4ADE80', bg: 'rgba(74,222,128,0.10)' },
  pro:        { color: 'var(--theme)', bg: 'rgba(var(--theme-rgb),0.10)' },
  enterprise: { color: 'var(--theme)', bg: 'rgba(var(--theme-rgb),0.10)' },
  custom:     { color: '#FACC15', bg: 'rgba(250,204,21,0.10)' },
};

export default function PlanTemplateCard({ template, onEdit, onApply }) {
  const tier = TIER_CFG[template.plan_tier] || TIER_CFG.custom;
  return (
    <div data-testid={`template-card-${template.id}`} style={{
      padding: 18, borderRadius: 14,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: tier.bg, border: `1px solid ${tier.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: tier.color, flexShrink: 0,
        }}>
          <Briefcase size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>
              {template.name}
            </h3>
            <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 9.5, fontFamily: 'DM Sans', fontWeight: 700, background: tier.bg, color: tier.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {template.plan_tier}
            </span>
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', margin: 0, lineHeight: 1.4 }}>
            {template.description || '—'}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', flexWrap: 'wrap' }}>
        <span><strong style={{ color: 'var(--cream)' }}>{(template.features || []).length}</strong> features</span>
        <span><strong style={{ color: 'var(--cream)' }}>${template.price_mxn ?? 0}</strong> /mes</span>
      </div>
      {(template.features || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {template.features.slice(0, 6).map(f => (
            <span key={f} style={{ padding: '2px 7px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Mono, monospace', background: 'rgba(var(--theme-rgb),0.08)', color: 'var(--theme)', border: '1px solid rgba(var(--theme-rgb),0.20)' }}>
              {f}
            </span>
          ))}
          {template.features.length > 6 && (
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240, 235, 224, 0.70)', alignSelf: 'center' }}>+{template.features.length - 6}</span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button data-testid={`tpl-edit-${template.id}`} onClick={() => onEdit && onEdit(template)}
          style={{ padding: '6px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Edit3 size={10} /> Editar
        </button>
        <button data-testid={`tpl-apply-${template.id}`} onClick={() => onApply && onApply(template)}
          style={{ padding: '6px 14px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <ArrowRightCircle size={10} /> Aplicar
        </button>
      </div>
    </div>
  );
}

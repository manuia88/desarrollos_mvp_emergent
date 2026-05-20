// W5.22 Z.8 — LandingLeadFormConfig: editor de campos del formulario
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, GripVertical } from 'lucide-react';

const FIELD_TYPES = ['text', 'email', 'phone', 'select'];

export default function LandingLeadFormConfig({ leadForm, onChange }) {
  const { t } = useTranslation('common');
  const lf = leadForm || { fields: [], submit_text: 'Enviar', success_message: '' };

  const update = (patch) => onChange({ ...lf, ...patch });
  const updateField = (idx, patch) => {
    const next = [...(lf.fields || [])];
    next[idx] = { ...next[idx], ...patch };
    update({ fields: next });
  };
  const addField = () => update({
    fields: [...(lf.fields || []), { name: `campo_${(lf.fields || []).length + 1}`, type: 'text', required: false, label: 'Nuevo campo' }],
  });
  const removeField = (idx) => {
    const next = [...(lf.fields || [])];
    next.splice(idx, 1);
    update({ fields: next });
  };
  const moveField = (idx, dir) => {
    const next = [...(lf.fields || [])];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    update({ fields: next });
  };

  return (
    <div data-testid="lead-form-config" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontFamily: 'Outfit, sans-serif' }}>{t('studio.landings.lead_form_title')}</strong>
        <button
          data-testid="lead-form-add-field"
          type="button"
          onClick={addField}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9999, background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          <Plus size={14} />
          {t('studio.landings.lead_form_add')}
        </button>
      </div>

      {(lf.fields || []).map((f, i) => (
        <div
          key={i}
          data-testid={`lead-form-field-${i}`}
          style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr 100px 36px 36px', gap: 8, alignItems: 'center', padding: 10, background: 'rgba(13,16,23,0.55)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 10 }}
        >
          <div style={{ cursor: 'grab', color: '#6b7280', display: 'flex', flexDirection: 'column' }}>
            <button type="button" data-testid={`field-up-${i}`} onClick={() => moveField(i, -1)} style={{ background: 'transparent', border: 'none', color: '#a0a4b0', cursor: 'pointer', padding: 0 }}>▲</button>
            <button type="button" data-testid={`field-down-${i}`} onClick={() => moveField(i, 1)} style={{ background: 'transparent', border: 'none', color: '#a0a4b0', cursor: 'pointer', padding: 0 }}>▼</button>
          </div>
          <input
            data-testid={`field-label-${i}`}
            value={f.label || ''}
            onChange={(e) => updateField(i, { label: e.target.value })}
            placeholder={t('studio.landings.lead_form_field_label')}
            style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#F0EBE0', fontSize: 13 }}
          />
          <input
            data-testid={`field-name-${i}`}
            value={f.name || ''}
            onChange={(e) => updateField(i, { name: e.target.value.replace(/[^a-z0-9_]/g, '_').toLowerCase() })}
            placeholder={t('studio.landings.lead_form_field_name')}
            style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#F0EBE0', fontSize: 13 }}
          />
          <select
            data-testid={`field-type-${i}`}
            value={f.type || 'text'}
            onChange={(e) => updateField(i, { type: e.target.value })}
            style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#F0EBE0', fontSize: 13 }}
          >
            {FIELD_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
          </select>
          <label data-testid={`field-required-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#a0a4b0', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
            *
          </label>
          <button type="button" data-testid={`field-remove-${i}`} onClick={() => removeField(i)} style={{ background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer' }} aria-label="Remove">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <label style={{ fontSize: 12, color: '#a0a4b0' }}>{t('studio.landings.lead_form_submit_text')}</label>
        <input
          data-testid="lead-form-submit-text"
          value={lf.submit_text || ''}
          onChange={(e) => update({ submit_text: e.target.value })}
          style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#F0EBE0' }}
        />
        <label style={{ fontSize: 12, color: '#a0a4b0' }}>{t('studio.landings.lead_form_success_msg')}</label>
        <input
          data-testid="lead-form-success-msg"
          value={lf.success_message || ''}
          onChange={(e) => update({ success_message: e.target.value })}
          style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#F0EBE0' }}
        />
      </div>
    </div>
  );
}

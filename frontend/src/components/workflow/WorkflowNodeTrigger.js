// W6.AS.1 · Workflow Builder · Trigger node (4 types)
import React from 'react';
import { useTranslation } from 'react-i18next';

const GREEN = '#10B981';
const CREAM = 'var(--cream)';
const BORDER = '1px solid var(--border)';
const BG = 'var(--bg)';

const TRIGGER_OPTIONS = [
  { value: 'lead.new',                key: 'workflows.trigger_new_lead' },
  { value: 'lead.stage_changed',      key: 'workflows.trigger_stage_changed' },
  { value: 'lead.no_response_X_hours', key: 'workflows.trigger_no_response' },
  { value: 'lead.custom_event',       key: 'workflows.trigger_custom' },
];

export default function WorkflowNodeTrigger({ node, selected, onChange, onSelect }) {
  const { t } = useTranslation('common');
  const cfg = node.config || {};
  const triggerType = cfg.trigger_type || 'lead.new';

  const update = (patch) => {
    onChange && onChange({ ...node, config: { ...cfg, ...patch } });
  };

  return (
    <div
      data-testid={`wf-node-trigger-${node.id}`}
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(node.id); }}
      style={{
        width: 220,
        background: BG,
        border: `1px solid ${selected ? GREEN : BORDER}`,
        borderRadius: 9999,
        padding: '14px 18px',
        color: CREAM,
        fontFamily: 'DM Sans, sans-serif',
        boxShadow: selected ? `0 0 0 2px ${BORDER}` : 'none',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        color: GREEN, textTransform: 'uppercase', marginBottom: 4,
      }}>
        {t('workflows.palette_trigger')}
      </div>
      <select
        value={triggerType}
        onChange={(e) => update({ trigger_type: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: 'transparent', color: CREAM,
          border: 'none', outline: 'none', fontSize: 13, fontWeight: 600,
          appearance: 'none', cursor: 'pointer',
        }}
      >
        {TRIGGER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: 'var(--surface)', color: CREAM }}>
            {t(opt.key)}
          </option>
        ))}
      </select>
      {triggerType === 'lead.no_response_X_hours' && (
        <input
          type="number"
          value={cfg.hours || 24}
          min={1}
          max={720}
          onChange={(e) => update({ hours: Number(e.target.value) })}
          onClick={(e) => e.stopPropagation()}
          style={inputStyle()}
          placeholder="horas"
        />
      )}
      {triggerType === 'lead.stage_changed' && (
        <input
          type="text"
          value={cfg.stage || ''}
          onChange={(e) => update({ stage: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          style={inputStyle()}
          placeholder="visita_realizada"
        />
      )}
      {triggerType === 'lead.custom_event' && (
        <input
          type="text"
          value={cfg.event_name || ''}
          onChange={(e) => update({ event_name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          style={inputStyle()}
          placeholder="birthday"
        />
      )}
    </div>
  );
}

function inputStyle() {
  return {
    marginTop: 6, width: '100%', background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 8,
    padding: '6px 8px', color: 'var(--cream)', fontSize: 12, outline: 'none',
  };
}

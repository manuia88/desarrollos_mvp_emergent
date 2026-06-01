// W6.AS.1 · Workflow Builder · Condition node (IF/ELSE)
import React from 'react';
import { useTranslation } from 'react-i18next';

const AMBER = '#F59E0B';
const CREAM = 'var(--cream)';
const BORDER = '1px solid var(--border)';
const BG = 'var(--bg)';

const FIELDS = [
  { value: 'zone',          key: 'workflows.field_zone' },
  { value: 'price',         key: 'workflows.field_price' },
  { value: 'heat_score',    key: 'workflows.field_score' },
  { value: 'status_v2',     key: 'workflows.field_stage' },
  { value: 'tags',          key: 'workflows.field_tags' },
];
const OPS = ['eq', 'neq', 'gt', 'lt', 'in', 'contains'];

export default function WorkflowNodeCondition({ node, selected, onChange, onSelect }) {
  const { t } = useTranslation('common');
  const cfg = node.config || {};
  const update = (patch) => onChange && onChange({ ...node, config: { ...cfg, ...patch } });

  return (
    <div
      data-testid={`wf-node-condition-${node.id}`}
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(node.id); }}
      style={{
        width: 240,
        background: BG,
        border: `1px solid ${selected ? AMBER : BORDER}`,
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
        color: AMBER, textTransform: 'uppercase', marginBottom: 4,
      }}>
        {t('workflows.palette_condition')}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <select
          value={cfg.field || 'zone'}
          onChange={(e) => update({ field: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          style={selectStyle({ flex: 1 })}
        >
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value} style={{ background: 'var(--surface)' }}>
              {t(f.key)}
            </option>
          ))}
        </select>
        <select
          value={cfg.op || 'eq'}
          onChange={(e) => update({ op: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          style={selectStyle({ width: 80 })}
        >
          {OPS.map((o) => (
            <option key={o} value={o} style={{ background: 'var(--surface)' }}>{o}</option>
          ))}
        </select>
      </div>
      <input
        type="text"
        value={cfg.value === undefined || cfg.value === null ? '' : String(cfg.value)}
        onChange={(e) => update({ value: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        placeholder="valor"
        style={inputStyle()}
      />
      <div style={{
        marginTop: 8, display: 'flex', justifyContent: 'space-between',
        fontSize: 11, color: 'var(--cream-2)', fontWeight: 600,
      }}>
        <span>↳ {t('workflows.condition_if')}</span>
        <span>↳ {t('workflows.condition_else')}</span>
      </div>
    </div>
  );
}

function inputStyle() {
  return {
    width: '100%', background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 8,
    padding: '6px 8px', color: 'var(--cream)', fontSize: 12, outline: 'none',
  };
}
function selectStyle(extra = {}) {
  return {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 8,
    padding: '6px 8px', color: 'var(--cream)', fontSize: 12, outline: 'none',
    appearance: 'none', cursor: 'pointer', ...extra,
  };
}

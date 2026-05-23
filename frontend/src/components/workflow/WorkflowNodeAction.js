// W6.AS.1 · Workflow Builder · Action node (5 types)
import React from 'react';
import { useTranslation } from 'react-i18next';

const INDIGO = '#6366F1';
const CREAM = '#F0EBE0';
const BORDER = 'rgba(99,102,241,0.35)';
const GRADIENT = 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.10) 100%)';

const ACTION_OPTIONS = [
  { value: 'send_whatsapp', key: 'workflows.action_send_whatsapp' },
  { value: 'send_email',    key: 'workflows.action_send_email' },
  { value: 'create_task',   key: 'workflows.action_create_task' },
  { value: 'move_stage',    key: 'workflows.action_move_stage' },
  { value: 'call_webhook',  key: 'workflows.action_call_webhook' },
];

export default function WorkflowNodeAction({ node, selected, onChange, onSelect }) {
  const { t } = useTranslation('common');
  const cfg = node.config || {};
  const actionType = cfg.action_type || 'send_whatsapp';
  const params = cfg.params || {};

  const update = (patch) => onChange && onChange({ ...node, config: { ...cfg, ...patch } });
  const updateParams = (patch) => update({ params: { ...params, ...patch } });

  return (
    <div
      data-testid={`wf-node-action-${node.id}`}
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(node.id); }}
      style={{
        width: 240,
        background: GRADIENT,
        border: `1px solid ${selected ? INDIGO : BORDER}`,
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
        color: INDIGO, textTransform: 'uppercase', marginBottom: 4,
      }}>
        {t('workflows.palette_action')}
      </div>
      <select
        value={actionType}
        onChange={(e) => update({ action_type: e.target.value, params: {} })}
        onClick={(e) => e.stopPropagation()}
        style={selectStyle()}
      >
        {ACTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: '#0D1017', color: CREAM }}>
            {t(opt.key)}
          </option>
        ))}
      </select>

      {actionType === 'send_whatsapp' && (
        <textarea
          rows={2}
          value={params.body || ''}
          onChange={(e) => updateParams({ body: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Hola {nombre}, …"
          style={inputStyle()}
        />
      )}
      {actionType === 'send_email' && (
        <>
          <input
            type="text"
            value={params.subject || ''}
            onChange={(e) => updateParams({ subject: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Asunto"
            style={inputStyle()}
          />
          <textarea
            rows={2}
            value={params.body || ''}
            onChange={(e) => updateParams({ body: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Cuerpo del correo"
            style={inputStyle()}
          />
        </>
      )}
      {actionType === 'create_task' && (
        <input
          type="text"
          value={params.title || ''}
          onChange={(e) => updateParams({ title: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Llamar al lead"
          style={inputStyle()}
        />
      )}
      {actionType === 'move_stage' && (
        <input
          type="text"
          value={params.stage || ''}
          onChange={(e) => updateParams({ stage: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="calificado"
          style={inputStyle()}
        />
      )}
      {actionType === 'call_webhook' && (
        <input
          type="url"
          value={params.url || ''}
          onChange={(e) => updateParams({ url: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="https://hooks.example.com/…"
          style={inputStyle()}
        />
      )}
    </div>
  );
}

function inputStyle() {
  return {
    marginTop: 6, width: '100%', background: 'rgba(240,235,224,0.05)',
    border: '1px solid rgba(240,235,224,0.10)', borderRadius: 8,
    padding: '6px 8px', color: '#F0EBE0', fontSize: 12, outline: 'none',
    fontFamily: 'inherit', resize: 'none',
  };
}
function selectStyle() {
  return {
    width: '100%', background: 'transparent', color: '#F0EBE0',
    border: 'none', outline: 'none', fontSize: 13, fontWeight: 600,
    appearance: 'none', cursor: 'pointer',
  };
}

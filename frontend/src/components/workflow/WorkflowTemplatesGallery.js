// W6.AS.1 · Workflow Builder · 5 plantillas precargadas
import React from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';

const NODE_X = 260;
const NODE_Y = 140;

function pos(col, row) { return { x: 80 + col * NODE_X, y: 80 + row * NODE_Y }; }

function nid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function tplNurture30d() {
  const t = nid('t'); const a1 = nid('a'); const d1 = nid('d');
  const a2 = nid('a'); const d2 = nid('d'); const a3 = nid('a');
  const d3 = nid('d'); const a4 = nid('a'); const d4 = nid('d'); const a5 = nid('a');
  return {
    name: 'Nurture 30 días',
    description: '5 toques distribuidos en 30 días para lead nuevo.',
    nodes: [
      { id: t, type: 'trigger', position: pos(0,0), config: { trigger_type: 'lead.new' } },
      { id: a1, type: 'action',  position: pos(1,0), config: { action_type: 'send_whatsapp', params: { body: 'Hola {nombre}, gracias por tu interés.' } } },
      { id: d1, type: 'delay',   position: pos(2,0), config: { unit: 'days', amount: 3 } },
      { id: a2, type: 'action',  position: pos(3,0), config: { action_type: 'send_email',    params: { subject: 'Más info', body: '…' } } },
      { id: d2, type: 'delay',   position: pos(4,0), config: { unit: 'days', amount: 7 } },
      { id: a3, type: 'action',  position: pos(0,1), config: { action_type: 'send_whatsapp', params: { body: '¿Pudiste revisar la propuesta, {nombre}?' } } },
      { id: d3, type: 'delay',   position: pos(1,1), config: { unit: 'days', amount: 10 } },
      { id: a4, type: 'action',  position: pos(2,1), config: { action_type: 'send_email',    params: { subject: 'Recordatorio', body: '…' } } },
      { id: d4, type: 'delay',   position: pos(3,1), config: { unit: 'days', amount: 10 } },
      { id: a5, type: 'action',  position: pos(4,1), config: { action_type: 'create_task',   params: { title: 'Llamada de cierre', due_in_days: 1 } } },
    ],
    edges: [
      { source: t, target: a1 }, { source: a1, target: d1 }, { source: d1, target: a2 },
      { source: a2, target: d2 }, { source: d2, target: a3 }, { source: a3, target: d3 },
      { source: d3, target: a4 }, { source: a4, target: d4 }, { source: d4, target: a5 },
    ],
  };
}

function tplPostVisit() {
  const t = nid('t'); const d1 = nid('d'); const a1 = nid('a'); const d2 = nid('d'); const a2 = nid('a');
  return {
    name: 'Post-visita 24h',
    description: 'WhatsApp 2h + email 24h después de la visita.',
    nodes: [
      { id: t,  type: 'trigger', position: pos(0,0), config: { trigger_type: 'lead.stage_changed', stage: 'visita_realizada' } },
      { id: d1, type: 'delay',   position: pos(1,0), config: { unit: 'hours', amount: 2 } },
      { id: a1, type: 'action',  position: pos(2,0), config: { action_type: 'send_whatsapp', params: { body: 'Gracias por la visita, {nombre}. ¿Cómo te pareció?' } } },
      { id: d2, type: 'delay',   position: pos(3,0), config: { unit: 'hours', amount: 22 } },
      { id: a2, type: 'action',  position: pos(4,0), config: { action_type: 'send_email',    params: { subject: 'Resumen post-visita', body: '…' } } },
    ],
    edges: [
      { source: t, target: d1 }, { source: d1, target: a1 },
      { source: a1, target: d2 }, { source: d2, target: a2 },
    ],
  };
}

function tplWinback60d() {
  const t = nid('t'); const a1 = nid('a'); const d1 = nid('d'); const a2 = nid('a'); const d2 = nid('d'); const a3 = nid('a');
  return {
    name: 'Win-back 60 días',
    description: 'Reactivación con 3 toques tras 60d sin respuesta.',
    nodes: [
      { id: t,  type: 'trigger', position: pos(0,0), config: { trigger_type: 'lead.no_response_X_hours', hours: 1440 } },
      { id: a1, type: 'action',  position: pos(1,0), config: { action_type: 'send_whatsapp', params: { body: 'Hola {nombre}, retomamos contacto.' } } },
      { id: d1, type: 'delay',   position: pos(2,0), config: { unit: 'days', amount: 3 } },
      { id: a2, type: 'action',  position: pos(3,0), config: { action_type: 'send_email',    params: { subject: 'Sigues interesado?', body: '…' } } },
      { id: d2, type: 'delay',   position: pos(4,0), config: { unit: 'days', amount: 5 } },
      { id: a3, type: 'action',  position: pos(0,1), config: { action_type: 'create_task',   params: { title: 'Llamada win-back', due_in_days: 1 } } },
    ],
    edges: [
      { source: t, target: a1 }, { source: a1, target: d1 }, { source: d1, target: a2 },
      { source: a2, target: d2 }, { source: d2, target: a3 },
    ],
  };
}

function tplColdReactivation() {
  const t = nid('t'); const a1 = nid('a'); const d1 = nid('d'); const c1 = nid('c'); const a2 = nid('a'); const a3 = nid('a'); const a4 = nid('a');
  return {
    name: 'Reactivación leads fríos',
    description: '3 toques con bifurcación según score.',
    nodes: [
      { id: t,  type: 'trigger',   position: pos(0,0), config: { trigger_type: 'lead.stage_changed', stage: 'cold' } },
      { id: a1, type: 'action',    position: pos(1,0), config: { action_type: 'send_whatsapp', params: { body: '{nombre}, una oferta especial para ti.' } } },
      { id: d1, type: 'delay',     position: pos(2,0), config: { unit: 'days', amount: 2 } },
      { id: c1, type: 'condition', position: pos(3,0), config: { field: 'heat_score', op: 'gt', value: 50 } },
      { id: a2, type: 'action',    position: pos(4,0), config: { action_type: 'create_task',   params: { title: 'Llamada VIP', due_in_days: 1 } } },
      { id: a3, type: 'action',    position: pos(4,1), config: { action_type: 'send_email',    params: { subject: 'Recordatorio', body: '…' } } },
      { id: a4, type: 'action',    position: pos(3,2), config: { action_type: 'move_stage',    params: { stage: 'archived' } } },
    ],
    edges: [
      { source: t, target: a1 }, { source: a1, target: d1 }, { source: d1, target: c1 },
      { source: c1, target: a2, branch: 'true' },
      { source: c1, target: a3, branch: 'false' },
      { source: a3, target: a4 },
    ],
  };
}

function tplBirthday() {
  const t = nid('t'); const a1 = nid('a'); const a2 = nid('a');
  return {
    name: 'Cumpleaños / Aniversario',
    description: 'Mensaje personalizado en fecha clave.',
    nodes: [
      { id: t,  type: 'trigger', position: pos(0,0), config: { trigger_type: 'lead.custom_event', event_name: 'birthday' } },
      { id: a1, type: 'action',  position: pos(1,0), config: { action_type: 'send_whatsapp', params: { body: '¡Feliz cumpleaños, {nombre}!' } } },
      { id: a2, type: 'action',  position: pos(2,0), config: { action_type: 'create_task',   params: { title: 'Llamar a {nombre}', due_in_days: 0 } } },
    ],
    edges: [
      { source: t, target: a1 }, { source: a1, target: a2 },
    ],
  };
}

export const TEMPLATES = [
  { key: 'nurture_30d',       nameKey: 'workflows.tpl_nurture_30d',  descKey: 'workflows.tpl_nurture_30d_desc',  build: tplNurture30d },
  { key: 'post_visit_24h',    nameKey: 'workflows.tpl_post_visit',   descKey: 'workflows.tpl_post_visit_desc',   build: tplPostVisit },
  { key: 'winback_60d',       nameKey: 'workflows.tpl_winback',      descKey: 'workflows.tpl_winback_desc',      build: tplWinback60d },
  { key: 'cold_reactivation', nameKey: 'workflows.tpl_cold',         descKey: 'workflows.tpl_cold_desc',         build: tplColdReactivation },
  { key: 'birthday',          nameKey: 'workflows.tpl_birthday',     descKey: 'workflows.tpl_birthday_desc',     build: tplBirthday },
];

export default function WorkflowTemplatesGallery({ open, onClose, onSelect }) {
  const { t } = useTranslation('common');
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 92vw)', maxHeight: '82vh', overflowY: 'auto',
          background: CARD_BG, border: BORDER, borderRadius: 24, padding: 28,
          color: CREAM, fontFamily: 'DM Sans, sans-serif',
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('workflows.templates_gallery_title')}
        </h2>
        <p style={{ color: 'rgba(240,235,224,0.62)', marginTop: 6, fontSize: 14 }}>
          {t('workflows.templates_gallery_subtitle')}
        </p>

        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          {TEMPLATES.map((tpl) => (
            <div
              key={tpl.key}
              data-testid={`wf-template-${tpl.key}`}
              style={{
                padding: 16, border: BORDER, borderRadius: 18,
                background: 'rgba(240,235,224,0.04)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{t(tpl.nameKey)}</div>
                <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.62)', marginTop: 4 }}>
                  {t(tpl.descKey)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { onSelect && onSelect(tpl.build()); onClose && onClose(); }}
                style={{
                  background: INDIGO, color: '#fff', border: 'none', borderRadius: 9999,
                  padding: '8px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}
              >
                {t('workflows.template_load')}
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 22, textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', color: CREAM,
              border: '1px solid rgba(240,235,224,0.18)', borderRadius: 9999,
              padding: '8px 18px', fontSize: 12, cursor: 'pointer',
            }}
          >
            {t('workflows.node_close')}
          </button>
        </div>
      </div>
    </div>
  );
}

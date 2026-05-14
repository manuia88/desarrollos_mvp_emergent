/**
 * W4.13.A Sub-B — LeadJourneyTimeline
 * Vertical timeline · cards horizontales · filter chips · expandable payload.
 */
import React, { useEffect, useState, useMemo } from 'react';
import JourneyStepIcon from './JourneyStepIcon';

const API = process.env.REACT_APP_BACKEND_URL;

const STEP_LABELS = {
  captured: 'Capturado',
  enriched: 'Enriquecido',
  disc_inferred: 'DISC inferido',
  routed: 'Ruteado a asesor',
  assigned: 'Asignado',
  first_touch_email: 'Primer contacto · email',
  first_touch_whatsapp: 'Primer contacto · WhatsApp',
  meeting_scheduled: 'Cita agendada',
  visit_completed: 'Visita completada',
  quote_sent: 'Cotización enviada',
  nurtured: 'Nurture enviado',
  outbound_initiated_by_asesor: 'Outbound iniciado por asesor',
  atlax_consulted_broker: 'Atlax consultado por broker',
  closed_won: 'Cerrado · ganado',
  closed_lost: 'Cerrado · perdido',
  nurture_paused: 'Nurture pausado',
};

function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const diffS = Math.max(0, (Date.now() - t) / 1000);
  if (diffS < 60) return `hace ${Math.round(diffS)}s`;
  if (diffS < 3600) return `hace ${Math.round(diffS / 60)}m`;
  if (diffS < 86400) return `hace ${Math.round(diffS / 3600)}h`;
  return `hace ${Math.round(diffS / 86400)}d`;
}

const FILTERS = [
  { k: 'all',     label: 'Todos' },
  { k: 'system',  label: 'Sistema' },
  { k: 'asesor',  label: 'Asesor' },
  { k: 'ai',      label: 'AI (Atlax/DISC)' },
];

export default function LeadJourneyTimeline({ leadId }) {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    fetch(`${API}/api/leads/${encodeURIComponent(leadId)}/journey`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setSteps(d?.steps || []))
      .catch(() => setSteps([]))
      .finally(() => setLoading(false));
  }, [leadId]);

  const filteredSteps = useMemo(() => {
    if (filter === 'all') return steps;
    if (filter === 'system') return steps.filter(s => s.actor_type === 'system' || s.actor_type === 'cron');
    if (filter === 'asesor') return steps.filter(s => ['asesor', 'broker'].includes(s.actor_type));
    if (filter === 'ai') return steps.filter(s => s.actor_type === 'atlax');
    return steps;
  }, [steps, filter]);

  return (
    <div data-testid="journey-timeline">
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f.k}
            data-testid={`journey-filter-${f.k}`}
            onClick={() => setFilter(f.k)}
            style={{
              padding: '6px 14px', borderRadius: 9999,
              background: filter === f.k ? 'rgba(var(--theme-rgb),0.18)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filter === f.k ? 'rgba(var(--theme-rgb),0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: filter === f.k ? 'var(--theme)' : 'rgba(240,235,224,0.6)',
              fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
            }}
          >{f.label}</button>
        ))}
      </div>

      {loading && <div style={{ padding: 20, color: 'rgba(240,235,224,0.5)', fontFamily: 'DM Sans' }}>Cargando journey…</div>}

      {!loading && filteredSteps.length === 0 && (
        <div data-testid="journey-empty" style={{
          padding: 36, textAlign: 'center', borderRadius: 16,
          background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: 'DM Sans',
        }}>
          <div style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: '#F0EBE0', marginBottom: 6 }}>
            Aún no hay actividad en este lead
          </div>
          <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>
            Las acciones (captura · DISC · routing · contacto · cierre) aparecerán aquí en orden cronológico.
          </div>
        </div>
      )}

      {!loading && filteredSteps.length > 0 && (
        <div style={{ position: 'relative' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', left: 17, top: 6, bottom: 6, width: 1,
            background: 'linear-gradient(180deg,rgba(var(--theme-rgb),0.3),rgba(var(--theme-rgb),0.15))',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredSteps.map((s, i) => {
              const isExpanded = expanded[i];
              return (
                <div
                  key={s.step_id || i}
                  data-testid={`journey-step-${s.step_type}`}
                  style={{ display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative' }}
                >
                  <JourneyStepIcon stepType={s.step_type} actorType={s.actor_type} />
                  <div
                    onClick={() => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))}
                    data-testid={`journey-step-expand-${i}`}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 14,
                      background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer', transition: 'border-color 220ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: '#F0EBE0' }}>
                        {STEP_LABELS[s.step_type] || s.step_type}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.4)', fontFamily: 'DM Sans' }}>
                        {relTime(s.occurred_at)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 9999,
                        background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.25)',
                        color: 'var(--theme)', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>{s.actor_type}</span>
                      {s.actor_id && (
                        <span style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.5)', fontFamily: 'DM Sans' }}>
                          · {s.actor_id}
                        </span>
                      )}
                    </div>
                    {isExpanded && s.payload && Object.keys(s.payload).length > 0 && (
                      <pre style={{
                        marginTop: 10, padding: 10, borderRadius: 10,
                        background: 'rgba(0,0,0,0.3)', color: 'rgba(240,235,224,0.7)',
                        fontFamily: 'DM Mono, monospace', fontSize: 10.5, lineHeight: 1.5,
                        whiteSpace: 'pre-wrap', overflowX: 'auto',
                      }}>{JSON.stringify(s.payload, null, 2)}</pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

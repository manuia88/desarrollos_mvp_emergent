/**
 * Phase 4 Batch 33 · Component — VisitAutoPrepCard
 *
 * Card expandible para mostrar dentro de AsesorTareas / cita upcoming.
 * Muestra:
 *  - Header colapsado: lead nombre + project + hora cita + botón "Ver briefing"
 *  - Expand: 4 secciones (lead_summary, objeciones, talking points, cierre)
 *  - Auto-genera si no existe; spinner mientras carga
 *  - Cache: 2da apertura no consume Claude
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  generateVisitBriefing, getVisitBriefing, markBriefingViewed,
} from '../../api/asesor_daily';

const GRADIENT = 'linear-gradient(90deg, var(--theme), var(--theme-3))';

function Section({ title, children, testId }) {
  return (
    <div data-testid={testId} style={{
      padding: 14, borderRadius: 12,
      background: 'rgba(240,235,224,0.04)',
      border: '1px solid rgba(240,235,224,0.08)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--cream-3)',
      }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--cream)', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

export default function VisitAutoPrepCard({
  appointment,
  asesorOwn = true,
}) {
  const apptId = appointment?.appointment_id || appointment?.id;
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  const loadOrGenerate = useCallback(async (force = false) => {
    if (!apptId) return;
    setError('');
    setLoading(true);
    try {
      let doc = force ? null : await getVisitBriefing(apptId);
      if (!doc) {
        doc = await generateVisitBriefing(apptId, force);
      }
      setBriefing(doc);
      // Mark viewed (idempotent)
      if (doc?.briefing_id && !doc?.viewed_at) {
        markBriefingViewed(doc.briefing_id).catch(() => {});
      }
    } catch (e) {
      setError(e.message || 'Error al obtener briefing');
    } finally {
      setLoading(false);
    }
  }, [apptId]);

  // Auto-poll when expanded and briefing not yet available (within 15s of cita)
  useEffect(() => {
    if (!expanded) return;
    if (briefing) return;
    let t;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const doc = await getVisitBriefing(apptId);
        if (doc) setBriefing(doc);
        else t = setTimeout(tick, 10000);
      } catch {
        t = setTimeout(tick, 10000);
      }
    };
    if (!loading) loadOrGenerate();
    return () => { cancelled = true; if (t) clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, apptId]);

  if (!apptId) return null;

  const content = briefing?.content || {};
  const time = appointment?.scheduled_at || appointment?.datetime || '';
  const timeFmt = time
    ? new Date(time).toLocaleString('es-MX', {
        weekday: 'short', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <div data-testid={`visit-prep-card-${apptId}`} style={{
      padding: 16, borderRadius: 14,
      background: 'rgba(13,16,23,0.92)',
      border: '1px solid rgba(240,235,224,0.12)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--cream-3)',
          }}>Próxima visita</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream)', marginTop: 2 }}>
            {appointment?.lead_name || appointment?.lead_id || 'Lead'}
            {appointment?.project_name && (
              <span style={{ color: 'var(--cream-3)', fontWeight: 400 }}>
                {' '}· {appointment.project_name}
              </span>
            )}
          </div>
          {timeFmt && (
            <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
              {timeFmt}
            </div>
          )}
        </div>

        <button
          data-testid={`visit-prep-toggle-${apptId}`}
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            padding: '8px 18px', borderRadius: 9999,
            border: expanded ? '1px solid rgba(240,235,224,0.18)' : 'none',
            background: expanded ? 'transparent' : GRADIENT,
            color: expanded ? 'var(--cream)' : '#fff',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {expanded ? 'Ocultar briefing' : 'Ver briefing'}
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div data-testid={`visit-prep-body-${apptId}`}
             style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && !briefing && (
            <div style={{
              padding: 16, textAlign: 'center', fontSize: 12,
              color: 'var(--cream-3)',
              background: 'rgba(var(--theme-rgb),0.06)',
              border: '1px solid rgba(var(--theme-rgb),0.18)',
              borderRadius: 12,
            }}>Generando briefing con IA…</div>
          )}

          {error && (
            <div data-testid="visit-prep-error" style={{
              padding: 10, borderRadius: 10,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#fca5a5', fontSize: 12,
            }}>{error}</div>
          )}

          {briefing && (
            <>
              {content.lead_summary && (
                <Section title="Sobre el lead" testId="brief-section-lead">
                  {content.lead_summary}
                </Section>
              )}

              {(content.top_3_objections || []).length > 0 && (
                <Section title="3 objeciones probables" testId="brief-section-objections">
                  <ol style={{ margin: 0, paddingLeft: 18,
                               display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {content.top_3_objections.map((obj, i) => (
                      <li key={i} data-testid={`brief-objection-${i}`}>
                        <div style={{ fontWeight: 600, color: 'var(--cream)' }}>
                          {obj.objection}
                        </div>
                        <div style={{ color: 'var(--cream-2)', marginTop: 2 }}>
                          {obj.script}
                        </div>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {(content.top_3_talking_points || []).length > 0 && (
                <Section title="Tus talking points" testId="brief-section-talking">
                  <ul style={{ margin: 0, paddingLeft: 18,
                               display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {content.top_3_talking_points.map((tp, i) => (
                      <li key={i}>{tp}</li>
                    ))}
                  </ul>
                </Section>
              )}

              {content.closing_recommendation && (
                <div data-testid="brief-section-closing" style={{
                  padding: 14, borderRadius: 12,
                  background: 'linear-gradient(90deg, rgba(var(--theme-rgb),0.1), rgba(var(--theme-rgb),0.1))',
                  border: '1px solid rgba(var(--theme-rgb),0.3)',
                }}>
                  <div style={{
                    fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--cream-3)', marginBottom: 6,
                  }}>Cierre sugerido</div>
                  <div style={{ fontSize: 13.5, color: 'var(--cream)', lineHeight: 1.7 }}>
                    {content.closing_recommendation}
                  </div>
                </div>
              )}

              {(content.related_comparables || []).length > 0 && (
                <Section title="Comparables relacionados" testId="brief-section-comparables">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {content.related_comparables.map((pid) => (
                      <a key={pid} href={`/desarrollo/${pid}`}
                         style={{
                           padding: '4px 12px', borderRadius: 9999,
                           background: 'rgba(240,235,224,0.06)',
                           border: '1px solid rgba(240,235,224,0.14)',
                           color: 'var(--cream)', textDecoration: 'none',
                           fontSize: 11,
                         }}>{pid}</a>
                    ))}
                  </div>
                </Section>
              )}

              {asesorOwn && (
                <button data-testid="visit-prep-regenerate" type="button"
                        onClick={() => loadOrGenerate(true)}
                        disabled={loading}
                        style={{
                          alignSelf: 'flex-start',
                          padding: '6px 14px', borderRadius: 9999,
                          border: '1px solid rgba(240,235,224,0.18)',
                          background: 'transparent', color: 'var(--cream-3)',
                          fontSize: 11, cursor: loading ? 'not-allowed' : 'pointer',
                        }}>Regenerar</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

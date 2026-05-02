// Universal LeadKanban — Phase 4 Batch 4.2
// Single component used by 4 surfaces: asesor (/asesor/leads-dev), dev (/desarrollador/leads),
// dev project CRM (/desarrollador/desarrollos/:slug/crm), inmobiliaria (/inmobiliaria/leads).
//
// Props:
//   scope: 'mine' | 'all_org' | 'all_inmobiliaria'
//   projectId?: string         (filter to a single project)
//   onToast?: (toast) => void  (parent toast handler)
//
// Features:
// - HTML5 drag-drop column move (disabled per-card if !card.can_move)
// - Cross-project badge "Link2 · N proyectos" when client_global_id has >0 other active leads
// - Lead drawer with conditional render: full-data | conversation | ai-summary by permissions
// - Other appointments of same client section (cross-project list)
import React, { useEffect, useMemo, useState } from 'react';
import * as leadsApi from '../../api/leads';
import { Link2, Lock, Brain, MessageCircle, X, EyeOff, Sparkle } from '../icons';

const SOURCE_LABELS = {
  web_form: 'Web', caya_bot: 'Caya', whatsapp: 'WhatsApp', feria: 'Feria',
  asesor_referral: 'Asesor', erp_webhook: 'ERP', manual: 'Manual', cita_form: 'Cita',
};
const COL_COLOR = {
  nuevo:            { bg: 'rgba(99,102,241,0.10)',  bd: 'rgba(99,102,241,0.30)',  fg: '#a5b4fc' },
  en_contacto:      { bg: 'rgba(236,72,153,0.10)',  bd: 'rgba(236,72,153,0.30)',  fg: '#f9a8d4' },
  visita_realizada: { bg: 'rgba(251,191,36,0.10)',  bd: 'rgba(251,191,36,0.30)',  fg: '#fcd34d' },
  propuesta:        { bg: 'rgba(139,92,246,0.10)',  bd: 'rgba(139,92,246,0.30)',  fg: '#c4b5fd' },
  cerrado:          { bg: 'rgba(34,197,94,0.10)',   bd: 'rgba(34,197,94,0.30)',   fg: '#86efac' },
};
const COL_TO_DEFAULT_STATUS = {
  nuevo: 'nuevo', en_contacto: 'contactado', visita_realizada: 'visita_realizada',
  propuesta: 'propuesta', cerrado: 'cerrado_ganado',
};

const fmtMXN = (v) => v == null ? '—' : `$${(v / 1_000_000).toFixed(1)}M`;

// ═════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════
export default function LeadKanban({ scope = 'mine', projectId, onToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(null);
  const [openLeadId, setOpenLeadId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await leadsApi.getKanban({ scope, project_id: projectId });
      setData(r);
    } catch (e) {
      onToast?.({ kind: 'error', text: e.body?.detail || 'Error al cargar kanban' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope, projectId]);

  const handleDrop = async (colKey, e) => {
    e.preventDefault();
    setDragOver(null);
    const leadId = e.dataTransfer.getData('text/lead-id');
    const fromCol = e.dataTransfer.getData('text/from-col');
    const canMove = e.dataTransfer.getData('text/can-move');
    if (canMove !== 'true') {
      onToast?.({ kind: 'error', text: 'No tienes permiso para mover este lead' });
      return;
    }
    if (!leadId || fromCol === colKey) return;
    const target = COL_TO_DEFAULT_STATUS[colKey];
    try {
      await leadsApi.moveColumn(leadId, target);
      onToast?.({ kind: 'success', text: `Lead movido a "${target}"` });
      load();
    } catch (e2) {
      onToast?.({ kind: 'error', text: e2.body?.detail || 'Error al mover' });
    }
  };

  if (loading || !data) {
    return (
      <div data-testid="lead-kanban-loading" style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
        Cargando kanban…
      </div>
    );
  }

  return (
    <>
      <div data-testid="lead-kanban-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, minmax(220px, 1fr))',
        gap: 10, overflowX: 'auto', paddingBottom: 8,
      }}>
        {data.columns.map(col => {
          const color = COL_COLOR[col.key] || COL_COLOR.nuevo;
          const isOver = dragOver === col.key;
          return (
            <div key={col.key}
              data-testid={`lead-kanban-col-${col.key}`}
              onDragOver={e => { e.preventDefault(); setDragOver(col.key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => handleDrop(col.key, e)}
              style={{
                minHeight: 380,
                background: isOver ? color.bg : 'rgba(13,17,24,0.5)',
                border: `1px solid ${isOver ? color.bd : 'var(--border)'}`,
                borderRadius: 14, padding: 12,
                display: 'flex', flexDirection: 'column', gap: 8,
                transition: 'background 0.15s, border-color 0.15s',
              }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '4px 6px', borderBottom: `1px dashed ${color.bd}`,
                paddingBottom: 8, marginBottom: 2,
              }}>
                <div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: color.fg }}>{col.label}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', marginTop: 2 }}>
                    {col.count} leads · {col.total_budget_max ? fmtMXN(col.total_budget_max) : '—'}
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 9999,
                  background: color.bg, border: `1px solid ${color.bd}`,
                  color: color.fg, fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700,
                }}>{col.count}</span>
              </div>
              {col.cards.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 11 }}>
                  Sin leads
                </div>
              )}
              {col.cards.map(card => (
                <LeadKanbanCard key={card.id} card={card} colKey={col.key} color={color} onOpen={() => setOpenLeadId(card.id)} />
              ))}
            </div>
          );
        })}
      </div>

      {openLeadId && (
        <LeadDrawer
          leadId={openLeadId}
          onClose={() => setOpenLeadId(null)}
          onToast={onToast}
        />
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LeadKanbanCard — conditional render by permissions
// ═════════════════════════════════════════════════════════════════════════════
function LeadKanbanCard({ card, colKey, color, onOpen }) {
  const [hover, setHover] = useState(false);
  const canMove = card.can_move !== false;
  const canFull = card.can_view_full !== false;
  const initials = (card.contact_name || 'L').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const crossCount = card.cross_project_count || 0;
  const showLockHint = !canMove;

  return (
    <div
      draggable={canMove}
      onDragStart={canMove ? (e => {
        e.dataTransfer.setData('text/lead-id', card.id);
        e.dataTransfer.setData('text/from-col', colKey);
        e.dataTransfer.setData('text/can-move', 'true');
        e.dataTransfer.effectAllowed = 'move';
      }) : undefined}
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={!canMove ? 'No tienes permiso para mover este lead' : undefined}
      data-testid={`lead-card-${card.id}`}
      data-can-move={canMove ? 'true' : 'false'}
      data-can-view-full={canFull ? 'true' : 'false'}
      style={{
        position: 'relative',
        padding: 10, borderRadius: 10,
        background: hover ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${hover ? color.bd : 'var(--border)'}`,
        cursor: canMove ? 'grab' : 'pointer',
        opacity: canMove ? 1 : 0.92,
        transition: 'background 0.12s, border-color 0.12s',
      }}>
      {showLockHint && (
        <div title="Sin permiso para mover" style={{
          position: 'absolute', top: 8, right: 8,
          width: 20, height: 20, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: 'var(--cream-3)',
        }}>
          <Lock size={11} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 9999,
          background: color.bg, border: `1px solid ${color.bd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 11, color: color.fg, flexShrink: 0,
        }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {!canFull && <EyeOff size={10} color="var(--cream-3)" />}
            {card.contact_name}
          </div>
          <div style={{
            fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--cream-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {canFull ? (card.contact_email || card.contact_phone || '—') : 'Datos privados'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
        <Badge tone="neutral">{SOURCE_LABELS[card.source] || card.source}</Badge>
        {card.intent && <Badge tone="brand">{card.intent}</Badge>}
        {crossCount > 0 && (
          <span data-testid={`cross-badge-${card.id}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 6px', borderRadius: 9999,
            background: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.30)',
            color: '#7dd3fc', fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700,
          }}>
            <Link2 size={10} /> {crossCount + 1} proyectos
          </span>
        )}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--cream-3)',
      }}>
        <span>{card.assigned_to_name || 'Sin asignar'}</span>
        <span>{card.days_in_status != null ? `${card.days_in_status}d` : '—'}</span>
      </div>
      {card.budget_range?.max && (
        <div style={{ marginTop: 4, fontFamily: 'DM Mono, monospace', fontSize: 10, color: color.fg, fontWeight: 600 }}>
          {fmtMXN(card.budget_range.max)}
        </div>
      )}
    </div>
  );
}

function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: { bg: 'rgba(255,255,255,0.05)', bd: 'rgba(255,255,255,0.10)', fg: 'var(--cream-2)' },
    brand:   { bg: 'rgba(236,72,153,0.10)',  bd: 'rgba(236,72,153,0.30)',  fg: '#f9a8d4' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      padding: '2px 6px', borderRadius: 9999,
      background: t.bg, border: `1px solid ${t.bd}`, color: t.fg,
      fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 600,
    }}>{children}</span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LeadDrawer — full lead detail with conditional sections
// ═════════════════════════════════════════════════════════════════════════════
function LeadDrawer({ leadId, onClose, onToast }) {
  const [lead, setLead] = useState(null);
  const [conv, setConv] = useState(null);
  const [ai, setAi] = useState(null);
  const [crossLeads, setCrossLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [convLocked, setConvLocked] = useState(false);
  const [aiLocked, setAiLocked] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const r = await leadsApi.getLead(leadId);
        if (!mounted) return;
        setLead(r);
        // Load conversation
        leadsApi.getConversation(leadId).then(c => mounted && setConv(c)).catch(() => mounted && setConvLocked(true));
        // Load AI summary
        leadsApi.getAiSummary(leadId).then(a => mounted && setAi(a)).catch(() => mounted && setAiLocked(true));
        // Load cross-project leads
        if (r.client_global_id) {
          leadsApi.getClientLeads(r.client_global_id).then(cp => {
            if (!mounted) return;
            setCrossLeads((cp.leads || []).filter(l => l.id !== leadId));
          }).catch(() => {});
        }
      } catch (e) {
        onToast?.({ kind: 'error', text: e.body?.detail || 'Error al cargar lead' });
        onClose();
      } finally { if (mounted) setLoading(false); }
    };
    load();
    return () => { mounted = false; };
  }, [leadId, onClose, onToast]);

  return (
    <div
      data-testid="lead-drawer"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        display: 'flex', justifyContent: 'flex-end',
      }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(560px, 100vw)', height: '100vh', overflowY: 'auto',
        background: 'var(--navy)', borderLeft: '1px solid var(--border)',
        padding: 24, display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Detalle del lead</div>
            <h2 data-testid="lead-drawer-title" style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: 0,
            }}>
              {loading ? 'Cargando…' : (lead?.contact?.name || 'Sin nombre')}
            </h2>
          </div>
          <button data-testid="lead-drawer-close" onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-2)',
            width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={14} />
          </button>
        </div>

        {!loading && lead && (
          <>
            {/* Permission badge bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <PermBadge active={lead._permissions?.can_view_full} label="Datos cliente" />
              <PermBadge active={lead._permissions?.can_view_conversation} label="Conversación" />
              <PermBadge active={lead._permissions?.can_view_ai_summary} label="Resumen IA" />
              <PermBadge active={lead._permissions?.can_move} label="Mover columna" />
            </div>

            {/* Contact section */}
            <Section title="Contacto" icon={<MessageCircle size={13} />}>
              {lead._scrubbed ? (
                <div data-testid="lead-drawer-scrubbed" style={{ color: 'var(--cream-3)', fontSize: 12, fontFamily: 'DM Sans' }}>
                  <EyeOff size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  {lead.contact?.name} (datos privados — visibles solo para el asesor asignado)
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, fontFamily: 'DM Sans' }}>
                  <Field label="Email" value={lead.contact?.email || '—'} />
                  <Field label="Teléfono" value={lead.contact?.phone || '—'} />
                  <Field label="Asesor" value={lead.assigned_to_name || lead.assigned_to || '—'} />
                  <Field label="Estado" value={lead.status} />
                </div>
              )}
            </Section>

            {/* Cross-project leads */}
            {crossLeads.length > 0 && (
              <Section title="Otras citas de este cliente" icon={<Link2 size={13} />} testid="lead-drawer-cross">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {crossLeads.map(cl => (
                    <div key={cl.id} data-testid={`cross-lead-${cl.id}`} style={{
                      padding: '8px 10px', borderRadius: 8,
                      background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.20)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 11.5, fontFamily: 'DM Sans', color: 'var(--cream-2)',
                    }}>
                      <div>
                        <div style={{ color: 'var(--cream)', fontWeight: 600 }}>{cl.project_name}</div>
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)' }}>
                          {cl.status} · {cl.asesor_name}
                        </div>
                      </div>
                      <span style={{
                        padding: '2px 8px', borderRadius: 9999, background: 'rgba(56,189,248,0.12)',
                        color: '#7dd3fc', fontFamily: 'DM Mono, monospace', fontSize: 10,
                      }}>{cl.origin_type}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Conversation section */}
            <Section title="Conversación" icon={<MessageCircle size={13} />} testid="lead-drawer-conversation">
              {convLocked ? (
                <LockedHint text="Sin permisos para ver la conversación de este lead" />
              ) : !conv ? (
                <div style={{ color: 'var(--cream-3)', fontSize: 11, fontFamily: 'DM Sans' }}>Cargando…</div>
              ) : conv.notes.length === 0 ? (
                <div style={{ color: 'var(--cream-3)', fontSize: 11, fontFamily: 'DM Sans' }}>Sin notas registradas</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {conv.notes.map((n, i) => (
                    <div key={i} style={{
                      padding: 10, borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                      fontSize: 12, fontFamily: 'DM Sans', color: 'var(--cream-2)',
                    }}>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', marginBottom: 4 }}>
                        {n.user_name} · {n.created_at?.slice(0, 16).replace('T', ' ')}
                      </div>
                      {n.text}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* AI Summary section */}
            <Section title="Resumen IA" icon={<Brain size={13} />} testid="lead-drawer-ai-summary">
              {aiLocked ? (
                <LockedHint text="Sin permisos para ver el resumen IA de este lead" />
              ) : !ai ? (
                <div style={{ color: 'var(--cream-3)', fontSize: 11, fontFamily: 'DM Sans' }}>Cargando…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'DM Sans' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>
                    <Sparkle size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    {ai.headline}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--cream-2)' }}>
                    <strong style={{ color: 'var(--cream-3)' }}>Intención:</strong> {ai.intent}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--cream-2)' }}>
                    <strong style={{ color: 'var(--cream-3)' }}>Presupuesto:</strong> {ai.budget_summary}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--cream-2)' }}>
                    <strong style={{ color: 'var(--cream-3)' }}>Riesgo:</strong>{' '}
                    <span style={{
                      color: ai.risk_level === 'alto' ? '#fca5a5' : ai.risk_level === 'medio' ? '#fcd34d' : '#86efac',
                      fontWeight: 600,
                    }}>{ai.risk_level}</span>
                  </div>
                  {ai.recommendations && ai.recommendations.length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--cream-2)' }}>
                      <strong style={{ color: 'var(--cream-3)' }}>Próxima acción:</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {ai.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function PermBadge({ active, label }) {
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 9999,
      background: active ? 'rgba(34,197,94,0.10)' : 'rgba(120,120,120,0.10)',
      border: `1px solid ${active ? 'rgba(34,197,94,0.30)' : 'rgba(120,120,120,0.20)'}`,
      color: active ? '#86efac' : 'var(--cream-3)',
      fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 600,
    }}>
      {active ? '✓' : '○'} {label}
    </span>
  );
}

function Section({ title, icon, children, testid }) {
  return (
    <div data-testid={testid} style={{
      padding: 14, borderRadius: 10,
      background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: 'var(--cream)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ color: 'var(--cream)' }}>{value}</div>
    </div>
  );
}

function LockedHint({ text }) {
  return (
    <div data-testid="locked-hint" style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: 12, borderRadius: 8,
      background: 'rgba(252,165,165,0.06)', border: '1px solid rgba(252,165,165,0.20)',
      color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 11.5,
    }}>
      <Lock size={13} /> {text}
    </div>
  );
}

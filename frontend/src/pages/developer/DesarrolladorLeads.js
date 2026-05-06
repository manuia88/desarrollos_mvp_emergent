// /desarrollador/leads — Phase 4.19 Lead Pipeline + Phase 4.2 Universal Kanban
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, Toast, fmt0, fmtMXN } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import LeadKanban from '../../components/shared/LeadKanban';
import { Activity, Target, Plus, X, Sparkle, MessageCircle } from '../../components/icons';
import { BarList, FunnelChart } from '../../components/developer/ChartPrimitives';
import { usePresentationMode } from '../../hooks/usePresentationMode';
import { anonymizeLead, piiCSS, internalOnlyCSS } from '../../lib/anonymize';

const STATUS_LABELS = {
  nuevo: 'Nuevo', contactado: 'Contactado', visita_agendada: 'Visita agendada',
  visita_realizada: 'Visita realizada', propuesta: 'Propuesta',
  cerrado_ganado: 'Cerrado ganado', cerrado_perdido: 'Cerrado perdido',
};
const STATUS_TONES = {
  nuevo: 'neutral', contactado: 'brand', visita_agendada: 'brand',
  visita_realizada: 'brand', propuesta: 'warn',
  cerrado_ganado: 'ok', cerrado_perdido: 'bad',
};
const SOURCE_LABELS = {
  web_form: 'Formulario web', caya_bot: 'Bot Caya', whatsapp: 'WhatsApp',
  feria: 'Feria', asesor_referral: 'Asesor referido', erp_webhook: 'ERP webhook', manual: 'Manual',
};
const LOST_REASON_LABELS = {
  precio: 'Precio', timing: 'Timing', financiamiento: 'Financiamiento', otro: 'Otro',
};

const TABS = [
  { k: 'pipeline',  label: 'Pipeline',  Icon: Target },
  { k: 'kanban',    label: 'Kanban universal', Icon: Sparkle },
  { k: 'analytics', label: 'Analytics', Icon: Activity },
];

export default function DesarrolladorLeads({ user, onLogout }) {
  const [tab, setTab] = useState('pipeline');
  const [toast, setToast] = useState(null);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="4.19 · LEAD PIPELINE CROSS-CHANNEL"
        title="Leads"
        sub="Tracking centralizado de prospectos por canal, estado y asignación."
      />

      <div data-testid="leads-tabs" style={{
        display: 'flex', gap: 2, borderBottom: '1px solid var(--border)',
        marginBottom: 18, flexWrap: 'wrap',
      }}>
        {TABS.map(t => {
          const active = tab === t.k;
          const Icon = t.Icon;
          return (
            <button key={t.k} onClick={() => setTab(t.k)} data-testid={`leads-tab-${t.k}`}
              style={{
                padding: '11px 18px', background: 'transparent', border: 'none',
                borderBottom: `2px solid ${active ? '#EC4899' : 'transparent'}`,
                color: active ? 'var(--cream)' : 'var(--cream-3)',
                fontFamily: 'DM Sans', fontWeight: active ? 600 : 500, fontSize: 13,
                cursor: 'pointer', marginBottom: -1,
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'pipeline'  && <PipelineTab onToast={setToast} currentUser={user} />}
      {tab === 'kanban'    && <LeadKanban scope="all_org" onToast={setToast} />}
      {tab === 'analytics' && <AnalyticsTab onToast={setToast} />}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </DeveloperLayout>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 1 — Pipeline
// ═════════════════════════════════════════════════════════════════════════════
function PipelineTab({ onToast, currentUser }) {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', source: '', project_id: '' });
  const [openLead, setOpenLead] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // B19.5 — PII anonymize for presentation mode
  const { isActive: pmActive, config: pmConfig } = usePresentationMode();

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.listLeads({ ...filters, limit: 50 });
      setData(r);
    } catch (e) { onToast({ kind: 'error', text: e.body?.detail || 'Error al cargar' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters.status, filters.source, filters.project_id]);

  const stats = useMemo(() => {
    const active = data.items.filter(x => !x.status.startsWith('cerrado')).length;
    const won = data.items.filter(x => x.status === 'cerrado_ganado').length;
    const lost = data.items.filter(x => x.status === 'cerrado_perdido').length;
    const closedTotal = won + lost;
    const winRate = closedTotal ? Math.round(100 * won / closedTotal) : null;
    return { active, won, lost, winRate, total: data.total };
  }, [data]);

  return (
    <>
      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Stat label="Total leads" v={fmt0(stats.total)} />
        <Stat label="Activos"     v={fmt0(stats.active)} />
        <Stat label="Ganados"     v={fmt0(stats.won)}  accent="#86efac" />
        <Stat label="Perdidos"    v={fmt0(stats.lost)} accent="#fca5a5" />
        <Stat label="Win rate"    v={stats.winRate == null ? '—' : `${stats.winRate}%`} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <Select value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))} tid="filter-status">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={filters.source} onChange={v => setFilters(f => ({ ...f, source: v }))} tid="filter-source">
          <option value="">Todas las fuentes</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <div style={{ flex: 1 }} />
        <button data-testid="leads-create-btn" onClick={() => setShowCreate(true)} className="btn btn-primary">
          <Plus size={12} /> Nuevo lead
        </button>
      </div>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Contacto', 'Intent', 'Fuente', 'Estado', 'Asignado', 'Budget max', 'Última act.'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando…</td></tr>
              )}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Sin leads. Crea el primero.</td></tr>
              )}
              {!loading && data.items.map(l => {
                const displayLead = (pmActive && pmConfig.anonymize_pii) ? anonymizeLead({ ...l, _id: l.id }) : l;
                return (
                <tr key={l.id} data-testid={`lead-row-${l.id}`} onClick={() => setOpenLead(l)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: 'var(--cream)' }}
                         className={pmActive && pmConfig.anonymize_pii ? piiCSS : ''}
                         data-testid={`lead-table-name-${l.id}`}>
                      {displayLead.nombre || displayLead.contact?.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--cream-3)' }}
                         className={pmActive && pmConfig.anonymize_pii ? piiCSS : ''}>
                      {displayLead.email || displayLead.contact?.email || displayLead.telefono || displayLead.contact?.phone}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {l.intent ? <Badge tone="neutral">{l.intent}</Badge> : <span style={{ color: 'var(--cream-3)' }}>—</span>}
                  </td>
                  <td style={tdStyle}>
                    <Badge tone="neutral">{SOURCE_LABELS[l.source] || l.source}</Badge>
                  </td>
                  <td style={tdStyle}>
                    <Badge tone={STATUS_TONES[l.status]}>{STATUS_LABELS[l.status] || l.status}</Badge>
                  </td>
                  <td style={tdStyle}>
                    {l.assigned_to_name
                      ? <span style={{ color: 'var(--cream-2)' }}>{l.assigned_to_name}</span>
                      : <span style={{ color: 'var(--cream-3)', fontStyle: 'italic' }}>Sin asignar</span>}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', fontSize: 11.5 }}>
                    {l.budget_range?.max ? fmtMXN(l.budget_range.max) : '—'}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)' }}>
                    {new Date(l.last_activity_at).toLocaleDateString('es-MX')}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {openLead && <LeadDrawer lead={openLead} onClose={() => setOpenLead(null)} onReload={load} onToast={onToast} />}
      {showCreate && <CreateLeadModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} onToast={onToast} />}
    </>
  );
}

function LeadDrawer({ lead, onClose, onReload, onToast }) {
  const [status, setStatus] = useState(lead.status);
  const [lostReason, setLostReason] = useState(lead.lost_reason || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(lead.notes || []);

  // B19.5 — Presentation mode PII anonymize
  const { isActive: pmActive, config: pmConfig } = usePresentationMode();
  const displayLead = (pmActive && pmConfig.anonymize_pii) ? anonymizeLead({ ...lead, _id: lead.id }) : lead;

  const isClosedLost = status === 'cerrado_perdido';

  const saveStatus = async () => {
    setSaving(true);
    try {
      const body = { status };
      if (status === 'cerrado_perdido') body.lost_reason = lostReason || 'otro';
      await api.patchLead(lead.id, body);
      onToast({ kind: 'success', text: `Estado actualizado a ${STATUS_LABELS[status]}` });
      onReload();
    } catch (e) { onToast({ kind: 'error', text: e.body?.detail || 'Error' }); }
    finally { setSaving(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    try {
      const r = await api.appendLeadNote(lead.id, note);
      setNotes(prev => [r.entry, ...prev]);
      setNote('');
      onToast({ kind: 'success', text: 'Nota agregada' });
    } catch (e) { onToast({ kind: 'error', text: e.body?.detail || 'Error' }); }
  };

  return (
    <div data-testid="lead-drawer" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 710, background: 'rgba(8,10,18,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0D1118', borderLeft: '1px solid var(--border)',
        width: 'min(480px, 100%)', height: '100%', overflowY: 'auto', padding: 22,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="eyebrow">LEAD DETALLE</div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: '4px 0 2px', letterSpacing: '-0.02em' }}>
              <span className={pmActive && pmConfig.anonymize_pii ? piiCSS : ''}>
                {displayLead.nombre || displayLead.contact?.name}
              </span>
            </h3>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              <span className={pmActive && pmConfig.anonymize_pii ? piiCSS : ''}>
                {displayLead.email || lead.contact?.email}
              </span>
              {' · '}
              <span className={pmActive && pmConfig.anonymize_pii ? piiCSS : ''}>
                {displayLead.telefono || lead.contact?.phone || '—'}
              </span>
              {' · '}{SOURCE_LABELS[lead.source]}
            </div>
          </div>
          <button onClick={onClose} data-testid="lead-drawer-close" style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Status changer */}
        <div style={sectionStyle}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>ESTADO</div>
          <Select value={status} onChange={setStatus} tid="lead-status-select" width="100%">
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {isClosedLost && (
            <div style={{ marginTop: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 6, fontSize: 9 }}>RAZÓN PÉRDIDA</div>
              <Select value={lostReason} onChange={setLostReason} tid="lead-lost-reason" width="100%">
                <option value="">Selecciona razón…</option>
                {Object.entries(LOST_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          )}
          <button
            data-testid="lead-save-status"
            onClick={saveStatus}
            disabled={saving || (isClosedLost && !lostReason)}
            style={{
              width: '100%', padding: '9px', borderRadius: 10, marginTop: 10,
              background: (saving || (isClosedLost && !lostReason)) ? 'rgba(148,163,184,0.2)' : 'var(--grad)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
              cursor: (saving || (isClosedLost && !lostReason)) ? 'not-allowed' : 'pointer',
            }}>
            {saving ? 'Guardando…' : 'Guardar estado'}
          </button>
        </div>

        {/* Budget + intent */}
        <div style={sectionStyle}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>RESUMEN</div>
          <Row label="Intent" value={lead.intent || '—'} />
          <Row label="Proyecto" value={lead.project_id || '—'} />
          <Row label="Budget max" value={lead.budget_range?.max ? fmtMXN(lead.budget_range.max) : '—'} />
          <Row label="Asignado" value={lead.assigned_to_name || 'Sin asignar'} />
          <Row label="Creado" value={new Date(lead.created_at).toLocaleString('es-MX')} />
        </div>

        {/* Notes — internal-only in presentation mode */}
        <div style={sectionStyle} className={pmActive && pmConfig.hide_internal_notes ? internalOnlyCSS : ''}
             data-testid="lead-notes-section">
          <div className="eyebrow" style={{ marginBottom: 8 }}>BITÁCORA · {notes.length} notas</div>
          <textarea
            data-testid="lead-note-input"
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Agregar nota…"
            style={{
              width: '100%', padding: 10, background: 'rgba(13,17,24,0.6)',
              border: '1px solid var(--border)', borderRadius: 10, color: 'var(--cream)',
              fontFamily: 'DM Sans', fontSize: 13, resize: 'vertical', marginBottom: 8,
            }}
          />
          <button
            data-testid="lead-note-save"
            onClick={addNote} disabled={!note.trim()}
            style={{
              padding: '7px 14px', borderRadius: 9999,
              background: !note.trim() ? 'rgba(148,163,184,0.2)' : 'var(--grad)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600,
              cursor: !note.trim() ? 'not-allowed' : 'pointer',
            }}>
            Publicar nota
          </button>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.map(n => (
              <div key={n.id} data-testid={`lead-note-${n.id}`} style={{
                padding: 10, borderRadius: 10,
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream)', fontWeight: 600 }}>
                    {n.by_name || 'Usuario'}
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)' }}>
                    {new Date(n.ts).toLocaleString('es-MX')}
                  </div>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                  {n.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateLeadModal({ onClose, onCreated, onToast }) {
  const [form, setForm] = useState({
    source: 'manual', contact: { name: '', email: '', phone: '', preferred_channel: '' },
    intent: 'comprar', project_id: '', budget_range: { min: '', max: '', currency: 'MXN' },
  });
  const [saving, setSaving] = useState(false);
  const canSave = form.contact.name && (form.contact.email || form.contact.phone);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const body = { ...form };
      body.budget_range = (body.budget_range.min || body.budget_range.max)
        ? { min: +body.budget_range.min || 0, max: +body.budget_range.max || 0, currency: 'MXN' }
        : null;
      if (!body.project_id) delete body.project_id;
      await api.createLead(body);
      onToast({ kind: 'success', text: 'Lead creado' });
      onCreated();
    } catch (e) { onToast({ kind: 'error', text: e.body?.detail || 'Error al crear lead' }); setSaving(false); }
  };

  return (
    <div data-testid="create-lead-modal" onClick={onClose} style={modalStyle}>
      <div onClick={e => e.stopPropagation()} style={modalContentStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="eyebrow">NUEVO LEAD</div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '4px 0 0' }}>
              Capturar prospecto
            </h3>
          </div>
          <button onClick={onClose} data-testid="create-lead-close" style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Labeled label="Nombre *">
            <input required data-testid="create-lead-name" value={form.contact.name}
              onChange={e => setForm({ ...form, contact: { ...form.contact, name: e.target.value } })}
              style={inputStyle} />
          </Labeled>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Labeled label="Email">
              <input type="email" data-testid="create-lead-email" value={form.contact.email}
                onChange={e => setForm({ ...form, contact: { ...form.contact, email: e.target.value } })}
                style={inputStyle} />
            </Labeled>
            <Labeled label="Teléfono">
              <input data-testid="create-lead-phone" value={form.contact.phone}
                onChange={e => setForm({ ...form, contact: { ...form.contact, phone: e.target.value } })}
                style={inputStyle} />
            </Labeled>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Labeled label="Fuente">
              <Select value={form.source} onChange={v => setForm({ ...form, source: v })} tid="create-lead-source" width="100%">
                {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Labeled>
            <Labeled label="Intent">
              <Select value={form.intent} onChange={v => setForm({ ...form, intent: v })} tid="create-lead-intent" width="100%">
                <option value="comprar">Comprar</option>
                <option value="invertir">Invertir</option>
                <option value="visitar">Visitar</option>
                <option value="info">Info</option>
              </Select>
            </Labeled>
          </div>
          <Labeled label="Proyecto (id opcional)">
            <input data-testid="create-lead-project" value={form.project_id}
              onChange={e => setForm({ ...form, project_id: e.target.value })}
              placeholder="altavista-polanco"
              style={inputStyle} />
          </Labeled>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Labeled label="Budget mín (MXN)">
              <input type="number" data-testid="create-lead-bmin" value={form.budget_range.min}
                onChange={e => setForm({ ...form, budget_range: { ...form.budget_range, min: e.target.value } })}
                style={inputStyle} />
            </Labeled>
            <Labeled label="Budget máx (MXN)">
              <input type="number" data-testid="create-lead-bmax" value={form.budget_range.max}
                onChange={e => setForm({ ...form, budget_range: { ...form.budget_range, max: e.target.value } })}
                style={inputStyle} />
            </Labeled>
          </div>
          <button
            data-testid="create-lead-submit"
            type="submit"
            disabled={!canSave || saving}
            style={{
              width: '100%', padding: '10px', borderRadius: 10, marginTop: 4,
              background: (!canSave || saving) ? 'rgba(148,163,184,0.2)' : 'var(--grad)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
              cursor: (!canSave || saving) ? 'not-allowed' : 'pointer',
            }}>
            {saving ? 'Creando…' : 'Crear lead'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 2 — Analytics
// ═════════════════════════════════════════════════════════════════════════════
function AnalyticsTab() {
  const [data, setData] = useState(null);
  useEffect(() => { api.getLeadsAnalytics().then(setData).catch(() => setData({ error: true })); }, []);

  if (!data) return <Card style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando…</Card>;
  if (data.error) return <Card style={{ padding: 40, textAlign: 'center', color: '#fca5a5' }}>Error cargando analytics</Card>;
  if (data.total === 0) return (
    <Card style={{ padding: 60, textAlign: 'center' }}>
      <Sparkle size={18} color="var(--cream-3)" />
      <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
        Sin leads aún. Crea el primero en la pestaña Pipeline para ver analytics.
      </div>
    </Card>
  );

  const funnelSteps = data.funnel.filter(f => f.count > 0 || ['nuevo','contactado','propuesta','cerrado_ganado'].includes(f.k)).map((f, i, arr) => ({
    k: f.k, label: f.label, count: f.count,
    conversion_from_prev: i === 0 ? 100 : (arr[i-1].count ? Math.round(100 * f.count / arr[i-1].count) : 0),
    dropoff_pct: i === 0 ? 0 : (arr[i-1].count ? Math.round(100 * (arr[i-1].count - f.count) / arr[i-1].count) : 0),
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }} className="analytics-grid">
      {/* Funnel */}
      <Card data-testid="leads-funnel">
        <div className="eyebrow">FUNNEL · todos los estados</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 14px' }}>
          Conversión por etapa
        </h3>
        <FunnelChart steps={funnelSteps} />
      </Card>

      {/* Win rate + TTC */}
      <Card data-testid="leads-win-rate">
        <div className="eyebrow">MÉTRICAS CLAVE</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 14px' }}>
          Desempeño global
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BigStat label="Win rate"        v={data.win_rate != null ? `${data.win_rate}%` : '—'} accent="#86efac" />
          <BigStat label="Avg time-to-close" v={data.avg_time_to_close_days != null ? `${data.avg_time_to_close_days}d` : '—'} />
          <BigStat label="Total leads"     v={fmt0(data.total)} />
          <BigStat label="Cerrados"        v={fmt0(data.lost_reasons.reduce((a, r) => a + r.count, 0) + (data.funnel.find(f => f.k === 'cerrado_ganado')?.count || 0))} />
        </div>
      </Card>

      {/* Source breakdown */}
      <Card data-testid="leads-source">
        <div className="eyebrow">FUENTES · distribución %</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 14px' }}>
          Origen de leads
        </h3>
        <BarList
          items={data.source_breakdown.map(s => ({
            label: `${s.label} · ${s.pct}%`, value: s.count, color: '#EC4899',
          }))}
          format={v => `${v}`}
        />
      </Card>

      {/* Per-asesor */}
      <Card data-testid="leads-per-assignee" style={{ gridColumn: '1 / -1' }}>
        <div className="eyebrow">DESEMPEÑO POR ASESOR / COMERCIAL</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 14px' }}>
          Asignaciones activas + cierres
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Asignado', 'Activos', 'Ganados', 'Perdidos', 'Win rate'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.per_assignee.map(p => (
                <tr key={p.user_id} data-testid={`assignee-row-${p.user_id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}><span style={{ color: 'var(--cream)', fontWeight: 600 }}>{p.name}</span></td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace' }}>{p.active}</td>
                  <td style={{ ...tdStyle, color: '#86efac', fontFamily: 'DM Mono, monospace' }}>{p.won}</td>
                  <td style={{ ...tdStyle, color: '#fca5a5', fontFamily: 'DM Mono, monospace' }}>{p.lost}</td>
                  <td style={tdStyle}>
                    {p.win_rate != null ? <Badge tone={p.win_rate >= 50 ? 'ok' : p.win_rate >= 25 ? 'warn' : 'bad'}>{p.win_rate}%</Badge> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <style>{`@media (max-width: 960px) { .analytics-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Common bits
// ═════════════════════════════════════════════════════════════════════════════
function Stat({ label, v, accent }) {
  return (
    <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div className="eyebrow" style={{ marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: accent || 'var(--cream)' }}>{v}</div>
    </div>
  );
}

function BigStat({ label, v, accent }) {
  return (
    <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: accent || 'var(--cream)' }}>{v}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontFamily: 'DM Sans', fontSize: 12.5 }}>
      <span style={{ color: 'var(--cream-3)' }}>{label}</span>
      <span style={{ color: 'var(--cream)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Labeled({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({ value, onChange, tid, children, width }) {
  return (
    <select data-testid={tid} value={value} onChange={e => onChange(e.target.value)}
      style={{
        width: width || 'auto', padding: '8px 10px',
        background: 'rgba(13,17,24,0.6)', border: '1px solid var(--border)',
        borderRadius: 9, color: 'var(--cream)',
        fontFamily: 'DM Sans', fontSize: 12.5, cursor: 'pointer',
      }}>
      {children}
    </select>
  );
}

const thStyle = { textAlign: 'left', padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 500, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const tdStyle = { padding: '12px 14px', color: 'var(--cream-2)' };
const sectionStyle = { padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12 };
const inputStyle = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(13,17,24,0.6)', border: '1px solid var(--border)',
  borderRadius: 10, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
};
const modalStyle = {
  position: 'fixed', inset: 0, zIndex: 710, background: 'rgba(8,10,18,0.7)',
  backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
};
const modalContentStyle = {
  background: '#0D1118', border: '1px solid var(--border)',
  borderRadius: 16, padding: 22, maxWidth: 520, width: '100%', maxHeight: '92vh', overflowY: 'auto',
};

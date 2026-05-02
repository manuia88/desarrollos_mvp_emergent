// /desarrollador/desarrollos/:slug/crm — Phase 4.23 CRM Kanban + Project brokers
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { Card, Badge, Toast, fmtMXN } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import { Target, Users, Plus, X, ArrowRight } from '../../components/icons';

const SOURCE_LABELS = {
  web_form: 'Web', caya_bot: 'Caya', whatsapp: 'WhatsApp', feria: 'Feria',
  asesor_referral: 'Asesor', erp_webhook: 'ERP', manual: 'Manual',
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

const TABS = [
  { k: 'kanban',  label: 'Pipeline Kanban', Icon: Target },
  { k: 'brokers', label: 'Brokers asignados', Icon: Users },
];

export default function DesarrolladorCRM({ user, onLogout }) {
  const { slug } = useParams();
  const [tab, setTab] = useState('kanban');
  const [toast, setToast] = useState(null);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          <Link to="/desarrollador/inventario" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>Inventario</Link>
          {' / '}
          <Link to={`/desarrollador/desarrollos/${slug}/legajo`} style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>{slug}</Link>
          {' / CRM'}
        </div>
        <h1 data-testid="crm-h1" style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
          color: 'var(--cream)', letterSpacing: '-0.025em', margin: '4px 0 6px',
        }}>
          CRM del proyecto
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 720, lineHeight: 1.55 }}>
          Pipeline kanban de leads y control de brokers/asesores autorizados a vender este proyecto.
        </p>
      </div>

      <div data-testid="crm-tabs" style={{
        display: 'flex', gap: 2, borderBottom: '1px solid var(--border)',
        marginBottom: 18, flexWrap: 'wrap',
      }}>
        {TABS.map(t => {
          const active = tab === t.k;
          const Icon = t.Icon;
          return (
            <button key={t.k} onClick={() => setTab(t.k)} data-testid={`crm-tab-${t.k}`}
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

      {tab === 'kanban'  && <KanbanTab projectId={slug} onToast={setToast} />}
      {tab === 'brokers' && <BrokersTab projectId={slug} user={user} onToast={setToast} />}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </DeveloperLayout>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 1 — Kanban Pipeline (HTML5 drag-drop)
// ═════════════════════════════════════════════════════════════════════════════
function KanbanTab({ projectId, onToast }) {
  const [data, setData] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const load = async () => {
    try {
      const r = await api.getLeadsKanban(projectId);
      setData(r);
    } catch (e) { onToast({ kind: 'error', text: e.body?.detail || 'Error al cargar kanban' }); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const handleDrop = async (colKey, e) => {
    e.preventDefault();
    setDragOver(null);
    const leadId = e.dataTransfer.getData('text/lead-id');
    const fromCol = e.dataTransfer.getData('text/from-col');
    if (!leadId || fromCol === colKey) return;
    const target = COL_TO_DEFAULT_STATUS[colKey];
    try {
      await api.moveLeadColumn(leadId, target);
      onToast({ kind: 'success', text: `Lead movido a "${target}"` });
      load();
    } catch (e2) { onToast({ kind: 'error', text: e2.body?.detail || 'Error al mover' }); }
  };

  if (!data) return <Card style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando…</Card>;

  return (
    <div data-testid="crm-kanban-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(220px, 1fr))', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
      {data.columns.map(col => {
        const color = COL_COLOR[col.key] || COL_COLOR.nuevo;
        const isOver = dragOver === col.key;
        return (
          <div key={col.key}
            data-testid={`crm-col-${col.key}`}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', borderBottom: `1px dashed ${color.bd}`, paddingBottom: 8, marginBottom: 2 }}>
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
              <KanbanCard key={card.id} card={card} colKey={col.key} color={color} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ card, colKey, color }) {
  const [hover, setHover] = useState(false);
  const initials = (card.contact_name || 'L').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/lead-id', card.id);
        e.dataTransfer.setData('text/from-col', colKey);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-testid={`crm-card-${card.id}`}
      style={{
        padding: 10, borderRadius: 10,
        background: hover ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${hover ? color.bd : 'var(--border)'}`,
        cursor: 'grab',
        transition: 'background 0.12s, border-color 0.12s',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 9999,
          background: color.bg, border: `1px solid ${color.bd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 11, color: color.fg, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.contact_name}
          </div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--cream-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.contact_email || card.contact_phone || '—'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        <Badge tone="neutral">{SOURCE_LABELS[card.source] || card.source}</Badge>
        {card.intent && <Badge tone="brand">{card.intent}</Badge>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--cream-3)' }}>
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

// ═════════════════════════════════════════════════════════════════════════════
// Tab 2 — Brokers
// ═════════════════════════════════════════════════════════════════════════════
const LEVEL_LABELS = {
  view_only: 'Solo lectura',
  sell: 'Venta',
  master_broker: 'Master broker',
};

function BrokersTab({ projectId, user, onToast }) {
  const [items, setItems] = useState([]);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const canAssign = user?.role === 'developer_admin' || user?.role === 'superadmin';

  const load = async () => {
    try {
      const r = await api.listProjectBrokers(projectId, includeRevoked);
      setItems(r.items);
    } catch (e) { onToast({ kind: 'error', text: e.body?.detail || 'Error' }); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId, includeRevoked]);

  const loadCandidates = async () => {
    // Fetch internal users in same org + advisors from any tenant (best-effort).
    try {
      const intl = await api.listInternalUsers();  // from B1
      setCandidates(intl || []);
    } catch {
      setCandidates([]);
    }
  };

  const handleRevoke = async (rowId) => {
    if (!window.confirm('¿Revocar acceso de este broker? El audit log se conserva.')) return;
    try {
      await api.revokeProjectBroker(projectId, rowId);
      onToast({ kind: 'success', text: 'Broker revocado' });
      load();
    } catch (e) { onToast({ kind: 'error', text: e.body?.detail || 'Error' }); }
  };

  return (
    <>
      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow">BROKERS AUTORIZADOS</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                {items.filter(i => i.status !== 'revoked').length} activos
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', marginLeft: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={includeRevoked} onChange={e => setIncludeRevoked(e.target.checked)} data-testid="broker-show-revoked" />
              Mostrar revocados
            </label>
          </div>
          {canAssign && (
            <button data-testid="broker-assign-btn" onClick={() => { setShowAdd(true); loadCandidates(); }} className="btn btn-primary">
              <Plus size={12} /> Asignar broker
            </button>
          )}
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Broker', 'Origen', 'Acceso', '% Comisión', 'Estado', 'Asignado', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Sin brokers asignados.</td></tr>
              )}
              {items.map(b => (
                <tr key={b.id} data-testid={`broker-row-${b.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: 'var(--cream)' }}>{b.broker_info?.name || b.broker_user_id}</div>
                    <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{b.broker_info?.email}</div>
                  </td>
                  <td style={tdStyle}>
                    <Badge tone="neutral">
                      {b.broker_info?.role === 'advisor' ? 'Asesor externo' : b.broker_info?.internal_role || 'Interno'}
                    </Badge>
                  </td>
                  <td style={tdStyle}>
                    <Badge tone={b.access_level === 'master_broker' ? 'ok' : b.access_level === 'sell' ? 'brand' : 'neutral'}>
                      {LEVEL_LABELS[b.access_level] || b.access_level}
                    </Badge>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', color: 'var(--cream)', fontWeight: 600 }}>
                    {b.commission_pct}%
                  </td>
                  <td style={tdStyle}>
                    <Badge tone={b.status === 'active' ? 'ok' : b.status === 'revoked' ? 'bad' : 'warn'}>
                      {b.status}
                    </Badge>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)' }}>
                    {new Date(b.assigned_at).toLocaleDateString('es-MX')}
                  </td>
                  <td style={tdStyle}>
                    {canAssign && b.status !== 'revoked' && (
                      <button data-testid={`broker-revoke-${b.id}`} onClick={() => handleRevoke(b.id)}
                        style={{
                          padding: '5px 10px', borderRadius: 9999,
                          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.32)',
                          color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                        }}>
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showAdd && (
        <AddBrokerModal
          projectId={projectId}
          candidates={candidates}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); }}
          onToast={onToast}
        />
      )}
    </>
  );
}

function AddBrokerModal({ projectId, candidates, onClose, onCreated, onToast }) {
  const [form, setForm] = useState({ broker_user_id: '', access_level: 'sell', commission_pct: 3 });
  const [saving, setSaving] = useState(false);

  const availableCandidates = useMemo(() => (
    (candidates || []).filter(c => c.status === 'active' && c.user_id) // only active internal users with linked user_id
  ), [candidates]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.broker_user_id) return;
    setSaving(true);
    try {
      await api.assignProjectBroker(projectId, {
        broker_user_id: form.broker_user_id,
        access_level: form.access_level,
        commission_pct: +form.commission_pct,
      });
      onToast({ kind: 'success', text: 'Broker asignado' });
      onCreated();
    } catch (e) { onToast({ kind: 'error', text: e.body?.detail || 'Error al asignar' }); setSaving(false); }
  };

  return (
    <div data-testid="broker-add-modal" onClick={onClose} style={modalStyle}>
      <div onClick={e => e.stopPropagation()} style={modalContentStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="eyebrow">ASIGNAR BROKER</div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '4px 0 0' }}>
              Nueva autorización
            </h3>
          </div>
          <button onClick={onClose} data-testid="broker-add-close" style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Labeled label="Broker interno">
            <select
              data-testid="broker-select"
              value={form.broker_user_id}
              onChange={e => setForm({ ...form, broker_user_id: e.target.value })}
              required
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Selecciona…</option>
              {availableCandidates.map(c => (
                <option key={c.id} value={c.user_id}>{c.name} · {c.email} · {c.role}</option>
              ))}
            </select>
            <div style={{ marginTop: 5, fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>
              Solo miembros activos de tu organización pueden ser asignados como brokers.
            </div>
          </Labeled>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Labeled label="Nivel de acceso">
              <select data-testid="broker-level" value={form.access_level} onChange={e => setForm({ ...form, access_level: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="view_only">Solo lectura</option>
                <option value="sell">Venta</option>
                <option value="master_broker">Master broker</option>
              </select>
            </Labeled>
            <Labeled label="Comisión %">
              <input
                type="number" step="0.1" min="0" max="20"
                data-testid="broker-commission" value={form.commission_pct}
                onChange={e => setForm({ ...form, commission_pct: e.target.value })}
                style={inputStyle}
              />
            </Labeled>
          </div>
          <button
            data-testid="broker-submit"
            type="submit"
            disabled={!form.broker_user_id || saving}
            style={{
              width: '100%', padding: '10px', borderRadius: 10, marginTop: 4,
              background: (!form.broker_user_id || saving) ? 'rgba(148,163,184,0.2)' : 'var(--grad)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
              cursor: (!form.broker_user_id || saving) ? 'not-allowed' : 'pointer',
            }}>
            {saving ? 'Asignando…' : 'Asignar broker'}
          </button>
        </form>
      </div>
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

const thStyle = { textAlign: 'left', padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 500, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const tdStyle = { padding: '12px 14px', color: 'var(--cream-2)' };
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
  borderRadius: 16, padding: 22, maxWidth: 500, width: '100%', maxHeight: '92vh', overflowY: 'auto',
};

// DesarrolladorCitas — Portal desarrollador: gestión de citas
import React, { useState, useEffect, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import NewCitaModal from '../../components/developer/NewCitaModal';
import { getDevCitas, patchCita, approveLeadReview, rejectLeadReview } from '../../api/developer';
import { CalendarCheck, Plus, Clock, Phone, Video, X, CheckCircle, AlertCircle } from '../../components/icons';

const STATUS_COLORS = {
  agendada:     { bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.4)', text: '#818CF8' },
  confirmada:   { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.4)', text: '#4ADE80' },
  realizada:    { bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.3)', text: '#86EFAC' },
  cancelada:    { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', text: '#F87171' },
  no_show:      { bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.35)', text: '#FCD34D' },
  reagendada:   { bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.35)', text: '#F472B6' },
  under_review: { bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.35)', text: '#FCD34D' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: 'rgba(255,255,255,0.06)', border: 'var(--border)', text: 'var(--cream-3)' };
  const labels = { agendada: 'Agendada', confirmada: 'Confirmada', realizada: 'Realizada', cancelada: 'Cancelada', no_show: 'No Show', reagendada: 'Reagendada', under_review: 'En revisión' };
  return (
    <span data-testid={`status-badge-${status}`} style={{
      padding: '3px 9px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 600,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text, letterSpacing: '0.04em',
    }}>
      {labels[status] || status}
    </span>
  );
}

function fmtDatetime(dt) {
  if (!dt) return '—';
  try {
    const d = new Date(dt);
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${d.getDate()} ${months[d.getMonth()]} · ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  } catch { return dt; }
}

function CitaDrawer({ apt, user, onClose, onAction }) {
  const [status, setStatus] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [newDatetime, setNewDatetime] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [err, setErr] = useState('');

  const lead = apt.lead || {};
  const contact = lead.contact || {};
  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';
  const isUnderReview = apt.status === 'under_review' || lead.status === 'under_review';

  const inputStyle = { width: '100%', padding: '8px 11px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' };

  const handleSave = async () => {
    if (!status) return;
    if (status === 'cancelada' && !cancelReason) { setErr('cancel_reason requerido'); return; }
    if (status === 'reagendada' && (!rescheduleReason || !newDatetime)) { setErr('Motivo y nueva fecha requeridos'); return; }
    setSaving(true); setErr('');
    try {
      const body = { status };
      if (cancelReason) body.cancel_reason = cancelReason;
      if (rescheduleReason) body.reschedule_reason = rescheduleReason;
      if (newDatetime) body.datetime = new Date(newDatetime).toISOString();
      await patchCita(apt.id, body);
      onAction(); onClose();
    } catch (e) { setErr(e.message || 'Error'); } finally { setSaving(false); }
  };

  const handleReview = async (action) => {
    setReviewing(true); setErr('');
    try {
      if (action === 'approve') await approveLeadReview(apt.lead_id);
      else await rejectLeadReview(apt.lead_id);
      onAction(); onClose();
    } catch (e) { setErr(e.message || 'Error'); } finally { setReviewing(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 420, height: '100%', background: '#0D1118', borderLeft: '1px solid var(--border)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()} data-testid="cita-drawer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: 0 }}>Detalle de cita</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <StatusBadge status={apt.status} />
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)' }} data-testid="drawer-contact-name">{contact.name || 'Sin nombre'}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', display: 'flex', gap: 14 }}>
            {contact.phone && <span data-testid="drawer-contact-phone">{contact.phone}</span>}
            {contact.email && <span>{contact.email}</span>}
          </div>
          <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Clock size={12} /> {fmtDatetime(apt.datetime)}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', display: 'flex', alignItems: 'center', gap: 7 }}>
              {apt.modalidad === 'videollamada' ? <Video size={11} /> : <Phone size={11} />}
              {apt.modalidad === 'videollamada' ? 'Videollamada' : 'Presencial'}
            </div>
          </div>
          {lead.payment_methods?.length > 0 && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              Pago: {lead.payment_methods.join(', ')}
            </div>
          )}
        </div>

        {/* Under-review actions (admin only) */}
        {isAdmin && isUnderReview && apt.lead_id && (
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#FCD34D', marginBottom: 10, fontWeight: 600 }}>Lead en revisión</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleReview('approve')} disabled={reviewing} data-testid="approve-review-btn"
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.4)', color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                Aprobar
              </button>
              <button onClick={() => handleReview('reject')} disabled={reviewing} data-testid="reject-review-btn"
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                Rechazar (dup)
              </button>
            </div>
          </div>
        )}

        {/* Status actions */}
        <div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Cambiar estado cita</div>
          <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle} data-testid="cita-status-select">
            <option value="">— Seleccionar —</option>
            <option value="confirmada">Confirmar</option>
            <option value="realizada">Marcar realizada</option>
            <option value="reagendada">Reagendar</option>
            <option value="cancelada">Cancelar</option>
            <option value="no_show">No se presentó</option>
          </select>
          {status === 'cancelada' && (
            <input style={{ ...inputStyle, marginTop: 8 }} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Motivo de cancelación" data-testid="cancel-reason-input" />
          )}
          {status === 'reagendada' && (
            <>
              <input style={{ ...inputStyle, marginTop: 8 }} type="datetime-local" value={newDatetime} onChange={e => setNewDatetime(e.target.value)} data-testid="reschedule-dt-input" />
              <input style={{ ...inputStyle, marginTop: 8 }} value={rescheduleReason} onChange={e => setRescheduleReason(e.target.value)} placeholder="Motivo de reagendamiento" />
            </>
          )}
          {err && <div style={{ fontSize: 11, color: '#F87171', marginTop: 6 }}>{err}</div>}
          {status && (
            <button onClick={handleSave} disabled={saving} data-testid="save-cita-status-btn"
              style={{ marginTop: 10, width: '100%', padding: '10px 0', borderRadius: 9999, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DesarrolladorCitas({ user, onLogout }) {
  const [citas, setCitas] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedApt, setSelectedApt] = useState(null);
  const [filters, setFilters] = useState({ status: '', project_id: '', from: '', to: '' });
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: 30 };
    if (filters.status) params.status = filters.status;
    if (filters.project_id) params.project_id = filters.project_id;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    getDevCitas(params)
      .then(r => { setCitas(r.items || []); setTotal(r.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const underReviewCount = citas.filter(c => c.status === 'under_review' || c.lead?.status === 'under_review').length;

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div data-testid="dev-citas-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>
              Citas
              {underReviewCount > 0 && (
                <span style={{ marginLeft: 10, padding: '3px 9px', borderRadius: 9999, fontSize: 13, background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: '#FCD34D' }}>
                  {underReviewCount} en revisión
                </span>
              )}
            </h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: '4px 0 0' }}>Total: {total} citas registradas</p>
          </div>
          <button onClick={() => setShowModal(true)} data-testid="nueva-cita-dev-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 9999, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Plus size={14} /> Nueva cita
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            style={{ padding: '7px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}
            data-testid="dev-citas-filter-status">
            <option value="">Todos los estados</option>
            <option value="agendada">Agendada</option>
            <option value="confirmada">Confirmada</option>
            <option value="realizada">Realizada</option>
            <option value="cancelada">Cancelada</option>
            <option value="under_review">En revisión</option>
          </select>
          <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
            style={{ padding: '7px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}
            data-testid="dev-citas-filter-from" />
          <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            style={{ padding: '7px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}
            data-testid="dev-citas-filter-to" />
          {(filters.status || filters.from || filters.to) && (
            <button onClick={() => setFilters({ status: '', project_id: '', from: '', to: '' })}
              style={{ padding: '7px 11px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
              Limpiar
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando...</div>
        ) : citas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            <CalendarCheck size={36} color="var(--cream-3)" style={{ marginBottom: 12, opacity: 0.5 }} />
            <div>Sin citas registradas. Crea la primera.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {citas.map(apt => {
              const contact = apt.lead?.contact || {};
              const isReview = apt.status === 'under_review' || apt.lead?.status === 'under_review';
              return (
                <div key={apt.id} data-testid={`dev-cita-row-${apt.id}`}
                  onClick={() => setSelectedApt(apt)}
                  style={{
                    padding: '13px 18px', borderRadius: 12, border: `1px solid ${isReview ? 'rgba(251,191,36,0.3)' : 'var(--border)'}`,
                    background: isReview ? 'rgba(251,191,36,0.05)' : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = isReview ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.07)'}
                  onMouseLeave={e => e.currentTarget.style.background = isReview ? 'rgba(251,191,36,0.05)' : 'rgba(255,255,255,0.04)'}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: isReview ? 'rgba(251,191,36,0.12)' : 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isReview ? <AlertCircle size={15} color="#FCD34D" /> : apt.modalidad === 'videollamada' ? <Video size={15} color="#818CF8" /> : <Phone size={15} color="#818CF8" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 2 }}>
                      {contact.name || 'Sin nombre'}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span><Clock size={10} style={{ marginRight: 3 }} />{fmtDatetime(apt.datetime)}</span>
                      {contact.phone && <span>{contact.phone}</span>}
                      {apt.project_id && <span style={{ color: 'var(--cream-2)' }}>{apt.project_id}</span>}
                    </div>
                  </div>
                  <StatusBadge status={apt.status} />
                </div>
              );
            })}
          </div>
        )}

        {showModal && (
          <NewCitaModal user={user} projects={[]} onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); load(); }} />
        )}
        {selectedApt && (
          <CitaDrawer apt={selectedApt} user={user} onClose={() => setSelectedApt(null)} onAction={load} />
        )}
      </div>
    </DeveloperLayout>
  );
}

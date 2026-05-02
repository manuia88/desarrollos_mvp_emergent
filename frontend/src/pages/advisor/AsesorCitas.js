// AsesorCitas — Página central de citas del asesor
import React, { useState, useEffect, useCallback } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import NewCitaModal from '../../components/developer/NewCitaModal';
import { getAsesorCitas, patchCita } from '../../api/developer';
import { CalendarCheck, Plus, Clock, CheckCircle, X, Phone, Video, AlertCircle, ExternalLink } from '../../components/icons';

const STATUS_COLORS = {
  agendada:    { bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.4)',  text: '#818CF8' },
  confirmada:  { bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.4)',  text: '#4ADE80' },
  realizada:   { bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.3)',  text: '#86EFAC' },
  cancelada:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)', text: '#F87171' },
  no_show:     { bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.35)', text: '#FCD34D' },
  reagendada:  { bg: 'rgba(236,72,153,0.12)',  border: 'rgba(236,72,153,0.35)', text: '#F472B6' },
  under_review:{ bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.35)', text: '#FCD34D' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: 'rgba(255,255,255,0.06)', border: 'var(--border)', text: 'var(--cream-3)' };
  const labels = { agendada: 'Agendada', confirmada: 'Confirmada', realizada: 'Realizada', cancelada: 'Cancelada', no_show: 'No Show', reagendada: 'Reagendada', under_review: 'En revisión' };
  return (
    <span style={{
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

function CitaDrawer({ apt, onClose, onAction }) {
  const [status, setStatus] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [newDatetime, setNewDatetime] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleAction = async () => {
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
      onAction();
      onClose();
    } catch (e) {
      setErr(e.message || 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const contact = apt.lead?.contact || {};
  const inputStyle = { width: '100%', padding: '8px 11px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 400, height: '100%', background: '#0D1118', borderLeft: '1px solid var(--border)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: 0 }}>Detalle de cita</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StatusBadge status={apt.status} />
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)' }}>{contact.name || 'Sin nombre'}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', display: 'flex', gap: 14 }}>
            {contact.phone && <span>{contact.phone}</span>}
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
        </div>
        {/* Actions */}
        <div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Cambiar estado</div>
          <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
            <option value="">— Seleccionar acción —</option>
            <option value="confirmada">Confirmar</option>
            <option value="realizada">Marcar como realizada</option>
            <option value="reagendada">Reagendar</option>
            <option value="cancelada">Cancelar</option>
            <option value="no_show">No se presentó</option>
          </select>
          {status === 'cancelada' && (
            <input style={{ ...inputStyle, marginTop: 8 }} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Motivo de cancelación" data-testid="cita-cancel-reason" />
          )}
          {status === 'reagendada' && (
            <>
              <input style={{ ...inputStyle, marginTop: 8 }} type="datetime-local" value={newDatetime} onChange={e => setNewDatetime(e.target.value)} data-testid="cita-reschedule-dt" />
              <input style={{ ...inputStyle, marginTop: 8 }} value={rescheduleReason} onChange={e => setRescheduleReason(e.target.value)} placeholder="Motivo de reagendamiento" data-testid="cita-reschedule-reason" />
            </>
          )}
          {err && <div style={{ fontSize: 11, color: '#F87171', marginTop: 6 }}>{err}</div>}
          {status && (
            <button onClick={handleAction} disabled={saving} style={{
              marginTop: 10, width: '100%', padding: '10px 0', borderRadius: 9999,
              background: 'var(--grad)', border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, cursor: saving ? 'not-allowed' : 'pointer',
            }} data-testid="cita-action-save-btn">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AsesorCitas({ user, onLogout }) {
  const [tab, setTab] = useState('lista');
  const [citas, setCitas] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedApt, setSelectedApt] = useState(null);
  const [filters, setFilters] = useState({ status: '', from: '', to: '' });

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    getAsesorCitas(params)
      .then(r => { setCitas(r.items || []); setStats(r.stats || {}); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div data-testid="asesor-citas-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>Mis Citas</h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: '4px 0 0' }}>Gestiona y agenda visitas con clientes</p>
          </div>
          <button onClick={() => setShowModal(true)} data-testid="nueva-cita-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 9999, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Plus size={14} /> Nueva cita
          </button>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
          {[
            { label: 'Total este mes', value: stats.total_mes ?? '—', testid: 'stat-total-mes' },
            { label: 'Próximas 7d', value: stats.proximas_7d ?? '—', testid: 'stat-proximas' },
            { label: 'Realizadas', value: stats.realizadas ?? '—', testid: 'stat-realizadas' },
            { label: 'Canceladas', value: stats.canceladas ?? '—', testid: 'stat-canceladas' },
          ].map(s => (
            <div key={s.testid} data-testid={s.testid} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)' }}>{s.value}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {[{ k: 'lista', label: 'Lista' }, { k: 'calendario', label: 'Calendario' }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} data-testid={`citas-tab-${t.k}`}
              style={{ padding: '9px 18px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                background: tab === t.k ? 'rgba(236,72,153,0.12)' : 'transparent',
                color: tab === t.k ? '#EC4899' : 'var(--cream-3)',
                borderBottom: tab === t.k ? '2px solid #EC4899' : '2px solid transparent',
              }}>{t.label}</button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            style={{ padding: '7px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}
            data-testid="citas-filter-status">
            <option value="">Todos los estados</option>
            <option value="agendada">Agendada</option>
            <option value="confirmada">Confirmada</option>
            <option value="realizada">Realizada</option>
            <option value="cancelada">Cancelada</option>
            <option value="no_show">No Show</option>
            <option value="reagendada">Reagendada</option>
          </select>
          <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
            style={{ padding: '7px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}
            data-testid="citas-filter-from" />
          <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            style={{ padding: '7px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}
            data-testid="citas-filter-to" />
          {(filters.status || filters.from || filters.to) && (
            <button onClick={() => setFilters({ status: '', from: '', to: '' })}
              style={{ padding: '7px 11px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
              Limpiar
            </button>
          )}
        </div>

        {/* Content */}
        {tab === 'lista' ? (
          loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando citas...</div>
          ) : citas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
              <CalendarCheck size={36} color="var(--cream-3)" style={{ marginBottom: 12, opacity: 0.5 }} />
              <div>Sin citas agendadas. ¡Crea una nueva!</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {citas.map(apt => (
                <div key={apt.id} data-testid={`cita-row-${apt.id}`}
                  onClick={() => setSelectedApt(apt)}
                  style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {apt.modalidad === 'videollamada' ? <Video size={16} color="#818CF8" /> : <Phone size={16} color="#818CF8" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 2 }}>
                      {apt.lead?.contact?.name || 'Sin nombre'}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', display: 'flex', gap: 10 }}>
                      <span><Clock size={10} style={{ marginRight: 3 }} />{fmtDatetime(apt.datetime)}</span>
                      {apt.lead?.contact?.phone && <span>{apt.lead.contact.phone}</span>}
                    </div>
                  </div>
                  <StatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          )
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Vista de calendario disponible próximamente.{' '}
            <button onClick={() => setTab('lista')} style={{ background: 'none', border: 'none', color: '#818CF8', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13, textDecoration: 'underline' }}>
              Ver lista
            </button>
          </div>
        )}

        {showModal && (
          <NewCitaModal
            user={user}
            projects={[]}
            onClose={() => setShowModal(false)}
            onSuccess={() => { setShowModal(false); load(); }}
          />
        )}
        {selectedApt && (
          <CitaDrawer apt={selectedApt} onClose={() => setSelectedApt(null)} onAction={load} />
        )}
      </div>
    </AdvisorLayout>
  );
}

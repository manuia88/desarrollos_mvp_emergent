// AsesorCitas — Página central de citas del asesor
import React, { useState, useEffect, useCallback } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import NewCitaModal from '../../components/developer/NewCitaModal';
import { getAsesorCitas, patchCita } from '../../api/developer';
import { listTareas, completeTarea } from '../../api/advisor';
import { CalendarCheck, Plus, Clock, CheckCircle, X, Phone, Video, AlertCircle, ExternalLink, ClipboardList } from '../../components/icons';
import { Z } from '../../styles/zIndex';

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
  const c = STATUS_COLORS[status] || { bg: 'var(--surface-2)', border: 'var(--border)', text: 'var(--cream-3)' };
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
  const inputStyle = { width: '100%', padding: '8px 11px', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: Z.STICKY, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 400, height: '100%', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
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
          <div style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
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
  const [citas, setCitas] = useState([]);
  const [tareas, setTareas] = useState([]);           // E3.1 · agenda unificada
  const [typeFilter, setTypeFilter] = useState('all'); // all | cita | tarea
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedApt, setSelectedApt] = useState(null);
  const [filters, setFilters] = useState({ status: '', from: '', to: '' });
  // B2 fix · antes projects=[] hardcodeado → el select de proyecto salía vacío y nunca dejaba agendar.
  const [projects, setProjects] = useState([]);

  // Desarrollos reales para el select del modal de "Nueva cita".
  useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/developments?sort=recent`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d) ? d : (d?.items || [])))
      .catch(() => setProjects([]));
  }, []);

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
    // E3.1 · tareas pendientes para la agenda unificada (FAIL-OPEN).
    listTareas().then(t => setTareas(Array.isArray(t) ? t : [])).catch(() => setTareas([]));
  }, [filters]);

  // E3.1 · marca una tarea como hecha y refresca.
  const doneTarea = useCallback(async (tid) => {
    setTareas(prev => prev.filter(t => t.id !== tid));
    try { await completeTarea(tid); } catch (_) { load(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div data-testid="asesor-citas-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>Mi Agenda</h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: '4px 0 0' }}>Tus citas y tareas, en un solo lugar</p>
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
            <div key={s.testid} data-testid={s.testid} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)' }}>{s.value}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs · ASR-06 · La vista "Calendario" estaba en construcción ("próximamente"),
            se oculta su pestaña hasta que exista. Solo queda "Lista". */}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            style={{ padding: '7px 11px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}
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
            style={{ padding: '7px 11px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}
            data-testid="citas-filter-from" />
          <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            style={{ padding: '7px 11px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}
            data-testid="citas-filter-to" />
          {(filters.status || filters.from || filters.to) && (
            <button onClick={() => setFilters({ status: '', from: '', to: '' })}
              style={{ padding: '7px 11px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
              Limpiar
            </button>
          )}
        </div>

        {/* Content · ASR-06 · solo vista de lista (calendario aún no existe) */}
        {(
          loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando agenda...</div>
          ) : (() => {
            // E3.1 · agenda unificada: citas + tareas en una lista ordenada por fecha.
            const agendaItems = [
              ...(typeFilter === 'tarea' ? [] : citas.map(c => ({ kind: 'cita', ts: c.datetime, raw: c }))),
              ...(typeFilter === 'cita' ? [] : tareas.map(t => ({ kind: 'tarea', ts: t.due_at, raw: t }))),
            ].sort((a, b) => String(a.ts || '~').localeCompare(String(b.ts || '~')));
            return (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {[{ k: 'all', l: 'Todo' }, { k: 'cita', l: 'Citas' }, { k: 'tarea', l: 'Tareas' }].map(o => (
                    <button key={o.k} onClick={() => setTypeFilter(o.k)} data-testid={`agenda-type-${o.k}`}
                      style={{ padding: '6px 14px', borderRadius: 9999, border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5,
                        background: typeFilter === o.k ? 'var(--grad)' : 'transparent', color: typeFilter === o.k ? '#fff' : 'var(--cream-3)' }}>{o.l}</button>
                  ))}
                </div>
                {agendaItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
                    <CalendarCheck size={36} color="var(--cream-3)" style={{ marginBottom: 12, opacity: 0.5 }} />
                    <div>Sin citas ni tareas. ¡Crea una nueva!</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {agendaItems.map(item => item.kind === 'cita' ? (
                      <div key={`c-${item.raw.id}`} data-testid={`cita-row-${item.raw.id}`} onClick={() => setSelectedApt(item.raw)}
                        style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {item.raw.modalidad === 'videollamada' ? <Video size={16} color="#818CF8" /> : <Phone size={16} color="#818CF8" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 2 }}>{item.raw.lead?.contact?.name || item.raw.titulo || 'Cita'}</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', display: 'flex', gap: 10 }}>
                            <span style={{ color: '#818CF8', fontWeight: 700 }}>Cita</span>
                            <span><Clock size={10} style={{ marginRight: 3 }} />{fmtDatetime(item.raw.datetime)}</span>
                            {item.raw.lead?.contact?.phone && <span>{item.raw.lead.contact.phone}</span>}
                          </div>
                        </div>
                        <StatusBadge status={item.raw.status} />
                      </div>
                    ) : (
                      <div key={`t-${item.raw.id}`} data-testid={`tarea-row-${item.raw.id}`}
                        style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(226,152,46,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <ClipboardList size={16} color="#E2982E" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 2 }}>{item.raw.titulo || 'Tarea'}</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', display: 'flex', gap: 10 }}>
                            <span style={{ color: '#E2982E', fontWeight: 700 }}>Tarea</span>
                            {item.raw.due_at && <span><Clock size={10} style={{ marginRight: 3 }} />{fmtDatetime(item.raw.due_at)}</span>}
                            {item.raw.entity_label && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.raw.entity_label}</span>}
                          </div>
                        </div>
                        <button onClick={() => doneTarea(item.raw.id)} data-testid={`tarea-done-${item.raw.id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--border)', color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                          <CheckCircle size={12} /> Hecha
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()
        )}

        {showModal && (
          <NewCitaModal
            user={user}
            projects={projects}
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

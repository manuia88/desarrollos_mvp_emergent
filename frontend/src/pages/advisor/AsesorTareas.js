// /asesor/tareas — 3 columns by scope + 2-step new task wizard
import React, { useEffect, useState } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Badge, Empty, Drawer, Toast, relDate, isOverdue } from '../../components/advisor/primitives';
import * as api from '../../api/advisor';
import { Clock } from '../../components/icons';
import SortableList from '../../components/shared/SortableList';
import { reorderTareas } from '../../api/batch17';
import { useServerUndo } from '../../components/shared/UndoSnackbar';

const SCOPES = [
  { k: 'property', label: 'Propiedades', types: ['property', 'capture', 'search'] },
  { k: 'client',   label: 'Clientes',    types: ['client', 'lead'] },
  { k: 'general',  label: 'General',     types: ['general'] },
];

export default function AsesorTareas({ user, onLogout }) {
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [toast, setToast] = useState(null);
  const { showServerUndo } = useServerUndo();

  const load = async () => {
    setLoading(true);
    try { setAll(await api.listTareas()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const complete = async (id) => {
    try { await api.completeTarea(id); setToast({ kind: 'success', text: '+5 XP — Tarea completada' }); load(); } catch { setToast({ kind: 'error', text: 'Error' }); }
  };

  const handleReorder = async (orderedIds) => {
    try {
      await reorderTareas(orderedIds);
      setToast({ kind: 'success', text: 'Orden actualizado' });
      // Fetch last undo for this reorder
      try {
        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/undo/recent?limit=1`,
          { credentials: 'include' });
        if (res.ok) {
          const j = await res.json();
          const last = j.items?.[0];
          if (last && last.action === 'reorder' && last.entity_type === 'tarea') {
            showServerUndo({
              message: 'Orden de tareas actualizado',
              undoId: last.id, onRestored: load,
            });
          }
        }
      } catch {}
    } catch {
      setToast({ kind: 'error', text: 'Error al reordenar' });
    }
  };

  // Sort: overdue first, then due_at asc
  const sortCol = (arr) => arr.slice().sort((a, b) => {
    const ao = isOverdue(a.due_at), bo = isOverdue(b.due_at);
    if (ao !== bo) return ao ? -1 : 1;
    return new Date(a.due_at) - new Date(b.due_at);
  });

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CRM · TAREAS"
        title="Tareas operativas"
        sub="Organizadas por propiedades, clientes y generales. Las vencidas aparecen primero."
        actions={<button onClick={() => setShowNew(true)} data-testid="new-tarea-btn" className="btn btn-primary">+ Nueva tarea</button>}
      />

      {loading ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }} className="tareas-grid">
            {SCOPES.map(s => {
              const col = sortCol(all.filter(t => s.types.includes(t.tipo)));
              return (
                <div key={s.k} data-testid={`tareas-col-${s.k}`} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 16, padding: 'var(--d-pad-item, 14px)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="eyebrow">{s.label}</div>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream-2)' }}>{col.length}</span>
                  </div>
                  {col.length === 0 ? <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', padding: 16, textAlign: 'center' }}>Sin pendientes</div>
                    : col.map(t => (
                      <div key={t.id} data-testid={`tarea-${t.id}`} style={{
                        padding: 'var(--d-pad-item, 12px)', marginBottom: 8,
                        background: isOverdue(t.due_at) ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isOverdue(t.due_at) ? 'rgba(239,68,68,0.32)' : 'var(--border)'}`,
                        borderRadius: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13, color: 'var(--cream)', marginBottom: 4 }}>
                              {t.titulo}
                            </div>
                            {t.entity_label && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{t.entity_label}</div>}
                            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                              {isOverdue(t.due_at) ? <Badge tone="bad">Vencida {relDate(t.due_at)}</Badge> : <Badge tone="neutral"><Clock size={9} /> {relDate(t.due_at)}</Badge>}
                              <Badge tone={t.prioridad === 'alta' ? 'bad' : t.prioridad === 'baja' ? 'neutral' : 'warn'}>{t.prioridad}</Badge>
                            </div>
                          </div>
                          <button onClick={() => complete(t.id)} data-testid={`tarea-done-${t.id}`} className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}>✓</button>
                        </div>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}

      <Drawer open={showNew} onClose={() => setShowNew(false)} title="Nueva tarea" width={520}>
        <NewTaskForm onCreated={() => { setShowNew(false); setToast({ kind: 'success', text: 'Tarea creada' }); load(); }} onError={t => setToast({ kind: 'error', text: t })} />
      </Drawer>

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}

      <style>{`@media (max-width: 900px) { .tareas-grid { grid-template-columns: 1fr !important; } }`}</style>
    </AdvisorLayout>
  );
}

function NewTaskForm({ onCreated, onError }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ tipo: 'client', titulo: '', entity_label: '', due_date: '', due_time: '09:00', prioridad: 'media', notas: '' });
  const [sub, setSub] = useState(false);

  const presetsByType = {
    property: ['Contactar propietario', 'Organizar visita', 'Organizar captación', 'Pedir devolución de visita'],
    capture: ['Contactar propietario', 'Organizar captación', 'Subir fotos', 'Enviar ACM'],
    search: ['Revisar matches', 'Agendar visita', 'Contactar comprador'],
    client: ['Llamar al cliente', 'Enviar propuesta', 'Confirmar visita', 'Dar seguimiento'],
    lead: ['Calificar lead', 'Enviar info', 'Reactivar lead frío'],
    general: ['Tarea administrativa', 'Preparar reporte', 'Reunión interna'],
  };

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' };
  const lblStyle = { fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 };

  const submit = async () => {
    if (!f.titulo || !f.due_date) return;
    setSub(true);
    try {
      const due_at = new Date(`${f.due_date}T${f.due_time}:00`).toISOString();
      await api.createTarea({
        titulo: f.titulo, tipo: f.tipo, entity_label: f.entity_label || null,
        due_at, prioridad: f.prioridad, notas: f.notas,
      });
      onCreated();
    } catch { onError('No se pudo crear'); }
    finally { setSub(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {step === 1 && (
        <>
          <label><div style={lblStyle}>Tipo de tarea</div>
            <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value, titulo: '' })} className="asr-select" style={{ width: '100%' }} data-testid="task-type">
              <option value="property">Propiedad</option>
              <option value="capture">Captación</option>
              <option value="search">Búsqueda</option>
              <option value="client">Cliente</option>
              <option value="lead">Lead</option>
              <option value="general">General</option>
            </select>
          </label>
          <label><div style={lblStyle}>Entidad asociada (opcional)</div>
            <input value={f.entity_label} onChange={e => setF({ ...f, entity_label: e.target.value })} style={inputStyle} placeholder="Nombre del cliente, dirección, etc." data-testid="task-entity" />
          </label>
          <button onClick={() => setStep(2)} className="btn btn-primary" style={{ justifyContent: 'center' }} data-testid="task-next">Siguiente</button>
        </>
      )}
      {step === 2 && (
        <>
          <label><div style={lblStyle}>Título *</div>
            <select value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} className="asr-select" style={{ width: '100%', marginBottom: 8 }}>
              <option value="">— Plantillas —</option>
              {presetsByType[f.tipo].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} style={inputStyle} placeholder="O escribe personalizado…" data-testid="task-title" />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
            <label><div style={lblStyle}>Fecha *</div>
              <input type="date" value={f.due_date} onChange={e => setF({ ...f, due_date: e.target.value })} style={inputStyle} data-testid="task-date" />
            </label>
            <label><div style={lblStyle}>Hora</div>
              <input type="time" value={f.due_time} onChange={e => setF({ ...f, due_time: e.target.value })} style={inputStyle} />
            </label>
            <label><div style={lblStyle}>Prioridad</div>
              <select value={f.prioridad} onChange={e => setF({ ...f, prioridad: e.target.value })} className="asr-select" style={{ width: '100%' }}>
                <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep(1)} className="btn btn-glass" style={{ flex: 1, justifyContent: 'center' }}>← Atrás</button>
            <button onClick={submit} disabled={!f.titulo || !f.due_date || sub} className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', opacity: (!f.titulo || !f.due_date || sub) ? 0.6 : 1 }} data-testid="task-submit">
              {sub ? 'Creando…' : 'Crear tarea'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

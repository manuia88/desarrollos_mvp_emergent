/**
 * DesarrolladorCalendarioSubidas — Phase 4.15
 * /desarrollador/calendario-subidas
 * Kanban: pending → approved → published + rejected
 */
import React, { useEffect, useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Toast } from '../../components/advisor/primitives';
import MapboxPicker from '../../components/developer/MapboxPicker';
import * as api from '../../api/developer';
import { Plus, X, CheckCircle, AlertTriangle, Upload } from '../../components/icons';

const COLS = [
  { id: 'pending',   label: 'Pendiente',  color: '#f59e0b' },
  { id: 'approved',  label: 'Aprobado',   color: '#22c55e' },
  { id: 'published', label: 'Publicado',  color: '#6366F1' },
  { id: 'rejected',  label: 'Rechazado',  color: '#ef4444' },
];

const TYPE_LABELS = { foto: 'Foto', video: 'Video', plano: 'Plano', doc: 'Documento', render: 'Render' };
const TYPE_COLOR = { foto: '#EC4899', video: '#f59e0b', plano: '#6366F1', doc: '#94a3b8', render: '#a855f7' };

function ContentCard({ item, onApprove, onReject, onPublish }) {
  const [comment, setComment] = useState('');
  const [showActions, setShowActions] = useState(false);
  const isImage = item.type === 'foto' || item.type === 'render';

  return (
    <div data-testid={`content-card-${item.id}`} style={{
      background: 'rgba(255,255,255,0.035)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* Thumbnail */}
      {isImage && item.file_url && (
        <div style={{ height: 110, background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
          <img src={item.file_url} alt={item.title || item.type}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => e.target.style.display = 'none'} />
        </div>
      )}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, color: TYPE_COLOR[item.type] || '#94a3b8', background: `${TYPE_COLOR[item.type] || '#94a3b8'}1a`, border: `1px solid ${TYPE_COLOR[item.type] || '#94a3b8'}28`, borderRadius: 5, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {TYPE_LABELS[item.type] || item.type}
          </span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-4)', marginLeft: 'auto' }}>
            {new Date(item.ts).toLocaleDateString('es-MX')}
          </span>
        </div>
        <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream)', marginBottom: 3, lineBreak: 'anywhere' }}>
          {item.title || item.file_url?.split('/').pop() || 'Sin título'}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)', marginBottom: 8 }}>
          Por: {item.uploader_name || item.uploader_id?.slice(0, 12) || '—'}
        </div>
        {item.comment && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
            {item.comment}
          </div>
        )}

        {/* Actions */}
        {item.status === 'pending' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {showActions ? (
              <>
                <input type="text" placeholder="Comentario (opcional)" value={comment}
                  onChange={e => setComment(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => onApprove(item.id, comment)} data-testid={`approve-${item.id}`}
                    style={{ flex: 1, padding: '7px', borderRadius: 7, background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
                    <CheckCircle size={11} style={{ marginRight: 4 }} />Aprobar
                  </button>
                  <button onClick={() => onReject(item.id, comment)} data-testid={`reject-${item.id}`}
                    style={{ flex: 1, padding: '7px', borderRadius: 7, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
                    <X size={11} style={{ marginRight: 4 }} />Rechazar
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => setShowActions(true)}
                style={{ width: '100%', padding: '7px', borderRadius: 7, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
                Revisar
              </button>
            )}
          </div>
        )}
        {item.status === 'approved' && (
          <button onClick={() => onPublish(item.id)} data-testid={`publish-${item.id}`}
            style={{ width: '100%', padding: '7px', borderRadius: 7, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
            Publicar
          </button>
        )}
      </div>
    </div>
  );
}

export default function DesarrolladorCalendarioSubidas({ user, onLogout }) {
  const [content, setContent] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ project_id: '', type: 'foto', file_url: '', title: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapProjectId, setMapProjectId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, projs] = await Promise.all([api.listContent(), api.listProjects()]);
      setContent(items || []);
      setProjects(projs || []);
      if (projs?.length && !form.project_id) setForm(f => ({ ...f, project_id: projs[0]?.id || '' }));
    } finally { setLoading(false); }
  // eslint-disable-next-line
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = async (id, comment) => {
    try {
      await api.approveContent(id, { comment });
      setToast({ kind: 'success', text: 'Contenido aprobado' });
      load();
    } catch (e) { setToast({ kind: 'error', text: e.body?.detail || 'Error' }); }
  };
  const reject = async (id, comment) => {
    try {
      await api.rejectContent(id, { comment });
      setToast({ kind: 'success', text: 'Contenido rechazado' });
      load();
    } catch (e) { setToast({ kind: 'error', text: e.body?.detail || 'Error' }); }
  };
  const publish = async (id) => {
    try {
      await api.publishContent(id);
      setToast({ kind: 'success', text: 'Contenido publicado' });
      load();
    } catch (e) { setToast({ kind: 'error', text: e.body?.detail || 'Error' }); }
  };

  const submit = async () => {
    if (!form.project_id || !form.file_url) return;
    setSubmitting(true);
    try {
      await api.submitContent(form);
      setToast({ kind: 'success', text: 'Contenido enviado para revisión' });
      setShowUpload(false);
      setForm(f => ({ ...f, file_url: '', title: '', description: '' }));
      load();
    } catch (e) {
      setToast({ kind: 'error', text: e.body?.detail || 'Error al enviar' });
    } finally { setSubmitting(false); }
  };

  const saveLocation = async (projectId, lat, lng, zoom) => {
    await api.saveProjectLocation(projectId, { lat, lng, zoom });
    setToast({ kind: 'success', text: 'Ubicación guardada' });
    load();
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="4.15 · CONTENIDO"
        title="Calendario de Subidas"
        sub="Gestiona el flujo de aprobación de fotos, videos, planos y documentos."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowMap(true)} data-testid="show-map-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)', borderRadius: 9999, color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer' }}>
              Mapa proyectos
            </button>
            <button onClick={() => setShowUpload(true)} data-testid="add-content-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: 'var(--grad)', border: 'none', borderRadius: 9999, color: '#fff', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Plus size={13} /> Subir contenido
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
        {COLS.map(col => {
          const count = content.filter(c => c.status === col.id).length;
          return (
            <div key={col.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${col.color}28`, borderRadius: 10, padding: '10px 18px' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: col.color }}>{count}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{col.label}</div>
            </div>
          );
        })}
      </div>

      {/* Kanban */}
      {loading ? (
        <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
      ) : (
        <div data-testid="content-kanban" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }} className="kanban-grid">
          {COLS.map(col => {
            const cards = content.filter(c => c.status === col.id);
            return (
              <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                  <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--cream-2)' }}>{col.label}</div>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-4)', background: 'rgba(255,255,255,0.06)', borderRadius: 9999, padding: '1px 7px', marginLeft: 'auto' }}>
                    {cards.length}
                  </span>
                </div>
                {cards.length === 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', borderRadius: 12, padding: '24px 14px', textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-4)' }}>
                    Sin elementos
                  </div>
                )}
                {cards.map(item => (
                  <ContentCard key={item.id} item={item} onApprove={approve} onReject={reject} onPublish={publish} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div onClick={() => setShowUpload(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,8,15,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} data-testid="upload-modal" style={{ width: '100%', maxWidth: 480, background: '#0D1118', border: '1px solid var(--border)', borderRadius: 18, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>Subir contenido</div>
              <button onClick={() => setShowUpload(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cream-3)' }}><X size={16} /></button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={lblS}>Proyecto</div>
              <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                data-testid="upload-project" style={inputS}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={lblS}>Tipo</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <button key={k} onClick={() => setForm(f => ({ ...f, type: k }))} data-testid={`type-${k}`}
                    style={{ padding: '6px 12px', borderRadius: 7, fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer', background: form.type === k ? `${TYPE_COLOR[k]}20` : 'rgba(255,255,255,0.04)', border: `1px solid ${form.type === k ? TYPE_COLOR[k] + '44' : 'var(--border)'}`, color: form.type === k ? TYPE_COLOR[k] : 'var(--cream-3)' }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={lblS}>URL del archivo</div>
              <input type="url" placeholder="https://..." value={form.file_url} onChange={e => setForm(f => ({ ...f, file_url: e.target.value }))}
                data-testid="upload-url" style={inputS} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={lblS}>Título</div>
              <input type="text" placeholder="Ej: Fachada principal — Torre A" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                data-testid="upload-title" style={inputS} />
            </div>
            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#fcd34d', lineHeight: 1.5 }}>
                El contenido irá a la cola "Pendiente" hasta que un director comercial lo apruebe.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowUpload(false)} style={{ flex: 1, padding: '10px', borderRadius: 9, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submit} disabled={submitting || !form.file_url || !form.project_id} data-testid="confirm-upload-btn"
                style={{ flex: 2, padding: '10px', borderRadius: 9, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Enviando...' : <><Upload size={13} style={{ marginRight: 5 }} />Enviar para revisión</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map modal */}
      {showMap && (
        <div onClick={() => setShowMap(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,8,15,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} data-testid="map-modal" style={{ width: '100%', maxWidth: 700, background: '#0D1118', border: '1px solid var(--border)', borderRadius: 18, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>Ubicación de proyectos</div>
              <button onClick={() => setShowMap(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cream-3)' }}><X size={16} /></button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={lblS}>Proyecto</div>
              <select value={mapProjectId || projects[0]?.id || ''} onChange={e => setMapProjectId(e.target.value)} style={inputS}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {(mapProjectId || projects[0]?.id) && (() => {
              const pid = mapProjectId || projects[0]?.id;
              const proj = projects.find(p => p.id === pid);
              const meta = proj?.location_meta;
              return (
                <MapboxPicker
                  lat={meta?.lat || proj?.center?.[0]}
                  lng={meta?.lng || proj?.center?.[1]}
                  zoom={meta?.zoom || 14}
                  onSave={(lat, lng, zoom) => saveLocation(pid, lat, lng, zoom)}
                  height={380}
                />
              );
            })()}
          </div>
        </div>
      )}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
      <style>{`@media (max-width: 1100px) { .kanban-grid { grid-template-columns: repeat(2,1fr) !important; } } @media (max-width: 640px) { .kanban-grid { grid-template-columns: 1fr !important; } }`}</style>
    </DeveloperLayout>
  );
}

const lblS = { fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 };
const inputS = { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

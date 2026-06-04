// AvanceObraTab — Avance de obra (tema claro). Hero con stepper horizontal de hitos
// + Registro de avance (timeline fecha · % · comentario + foto) + avance por unidad.
import React, { useEffect, useState, useRef } from 'react';
import { Card } from '../advisor/primitives';
import * as api from '../../api/developer';
import { CheckCircle, Camera, Upload, X, Plus } from '../icons';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

// Acento por etapa (tema claro): color saturado para hito hecho/activo, tinte para pendiente.
const STAGE_ACCENT = {
  cimentacion:   '#6366F1', // indigo
  estructura:    '#0EA5E9', // azul
  instalaciones: '#C77F12', // ámbar
  acabados:      '#7C3AED', // violeta
  entrega:       '#15803d', // verde
};
const accentFor = (key) => STAGE_ACCENT[key] || 'var(--theme)';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fmtMonthYear = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const fmtDay = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
};

export default function AvanceObraTab({ devId, readOnly = false }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);    // stage_key en edición
  const [pct, setPct] = useState(0);
  const [toast, setToast] = useState(null);
  const [comment, setComment] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  const handlePhotoFile = async (files) => {
    const file = files && files[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('files', file);
      fd.append('asset_type', 'foto_avance');
      const r = await fetch(`${API}/api/desarrollador/developments/${devId}/assets/upload`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      const dataR = await r.json();
      const created = (dataR.created && dataR.created[0]) || null;
      const rel = created && (created.public_url || created.url);
      if (rel) {
        setPhotoUrl(rel.startsWith('http') ? rel : `${API}${rel}`);
        setToast({ type: 'ok', msg: 'Foto lista. Escribe el comentario y publica.' });
      } else {
        setToast({ type: 'error', msg: 'No se pudo subir la foto (revisa que sea jpg/png).' });
      }
    } catch (e) {
      setToast({ type: 'error', msg: 'Error al subir la foto' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const load = async () => {
    try {
      const r = await api.getConstructionProgress(devId);
      setData(r);
    } catch (e) { setToast({ type: 'error', msg: e.body?.detail || 'Error al cargar' }); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (devId) load(); }, [devId]);

  const saveStage = async (stageKey) => {
    try {
      await api.updateConstructionStage(devId, { stage_key: stageKey, percent: pct });
      setToast({ type: 'ok', msg: `Etapa actualizada a ${pct}%` });
      setEditing(null);
      load();
    } catch (e) { setToast({ type: 'error', msg: e.body?.detail || 'Error al guardar' }); }
  };

  const submitComment = async () => {
    if (!comment.trim()) return;
    setSubmittingComment(true);
    try {
      await api.addConstructionComment(devId, { text: comment, photo_url: photoUrl || null });
      setComment(''); setPhotoUrl('');
      setToast({ type: 'ok', msg: 'Registro publicado' });
      load();
    } catch (e) { setToast({ type: 'error', msg: e.body?.detail || 'Error' }); }
    finally { setSubmittingComment(false); }
  };

  const saveUnit = async (unitId, percent, stage) => {
    try {
      await api.updateUnitProgress(devId, { unit_id: unitId, percent_complete: percent, current_stage: stage });
      setToast({ type: 'ok', msg: `Unidad actualizada: ${percent}%` });
      load();
    } catch (e) { setToast({ type: 'error', msg: e.body?.detail || 'Error al actualizar unidad' }); }
  };

  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando avance de obra…</div>;

  const stages = data.stages || [];
  const overall = data.overall_percent || 0;
  const currentKey = data.current_stage;
  const currentStage = stages.find(s => s.key === currentKey);
  const lastUpdate = fmtMonthYear(data.updated_at);
  const comments = data.comments || [];

  // Estado de calendario sencillo y honesto (sin inventar fechas).
  const statusText = overall >= 100 ? 'Obra terminada'
    : overall === 0 ? 'Por iniciar'
      : `En ${(currentStage?.label || (currentKey || '').replace(/_/g, ' ')).toLowerCase()}`;

  return (
    <div data-testid="avance-obra-tab" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── HERO: avance + stepper horizontal de hitos ───────────────────────── */}
      <Card style={{ padding: 20, background: 'linear-gradient(140deg, rgba(var(--theme-rgb),0.07), transparent 70%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 52, color: 'var(--cream)', letterSpacing: '-0.03em', lineHeight: 1 }}>{overall}%</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', fontWeight: 600 }}>completado</span>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 8, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.25)', borderRadius: 9999, padding: '4px 12px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: accentFor(currentKey) }} />
              <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', fontWeight: 600 }}>{statusText}</span>
            </div>
          </div>
          {lastUpdate && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>Última actualización</div>
              <div style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--cream)', textTransform: 'capitalize', marginTop: 2 }}>{lastUpdate}</div>
            </div>
          )}
        </div>

        {/* Stepper horizontal */}
        <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ display: 'flex', minWidth: stages.length * 110 }}>
            {stages.map((s, i) => {
              const accent = accentFor(s.key);
              const done = s.percent >= 100;
              const isCurrent = s.key === currentKey && !done;
              const isEditing = editing === s.key;
              const lineLeftDone = i === 0 ? true : (stages[i - 1].percent >= 100);
              return (
                <div key={s.key} style={{ flex: 1, minWidth: 100, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* línea conectora (izquierda del nodo) */}
                  {i > 0 && (
                    <div style={{ position: 'absolute', top: 17, right: '50%', width: '100%', height: 3, background: lineLeftDone ? accentFor(stages[i - 1].key) : 'rgba(var(--cream-rgb),0.12)', borderRadius: 2 }} />
                  )}
                  {/* nodo */}
                  <button
                    data-testid={`avance-node-${s.key}`}
                    onClick={() => { if (readOnly) return; setEditing(isEditing ? null : s.key); setPct(s.percent); }}
                    title={readOnly ? s.label : `Actualizar ${s.label}`}
                    style={{
                      position: 'relative', zIndex: 1, width: 36, height: 36, borderRadius: '50%', cursor: readOnly ? 'default' : 'pointer',
                      background: done ? accent : '#fff',
                      border: `2.5px solid ${(done || isCurrent) ? accent : 'rgba(var(--cream-rgb),0.22)'}`,
                      boxShadow: isCurrent ? `0 0 0 4px ${accent}22` : (isEditing ? `0 0 0 4px ${accent}33` : 'none'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      transition: 'all 0.18s',
                    }}>
                    {done
                      ? <CheckCircle size={17} style={{ color: '#fff' }} />
                      : <span style={{ width: 9, height: 9, borderRadius: '50%', background: isCurrent ? accent : 'rgba(var(--cream-rgb),0.3)' }} />}
                  </button>
                  {/* etiqueta + % */}
                  <div style={{ marginTop: 8, textAlign: 'center', padding: '0 4px' }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: isCurrent || done ? 700 : 500, color: isCurrent || done ? 'var(--cream)' : 'var(--cream-3)', lineHeight: 1.2 }}>{s.label}</div>
                    <div style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 800, color: done || isCurrent ? accent : 'var(--cream-3)', marginTop: 2 }}>{s.percent}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor inline de la etapa seleccionada */}
        {editing && !readOnly && (() => {
          const s = stages.find(x => x.key === editing);
          const accent = accentFor(editing);
          return (
            <div style={{ marginTop: 16, padding: 14, background: '#fff', border: `1px solid ${accent}44`, borderRadius: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{s?.label}:</span>
              <input type="range" min={0} max={100} step={5} value={pct} onChange={e => setPct(+e.target.value)}
                data-testid={`avance-range-${editing}`}
                style={{ flex: 1, minWidth: 160, accentColor: accent, colorScheme: 'light' }} />
              <input data-testid={`avance-pct-${editing}`} type="number" min={0} max={100} step={1} value={pct} onChange={e => setPct(Math.max(0, Math.min(100, +e.target.value)))}
                style={{ width: 70, padding: '7px 9px', background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 13, textAlign: 'center' }} />
              <span style={{ color: 'var(--cream-3)', fontSize: 13 }}>%</span>
              <button data-testid={`avance-save-${editing}`} onClick={() => saveStage(editing)}
                style={{ padding: '8px 18px', borderRadius: 9999, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Guardar
              </button>
              <button onClick={() => setEditing(null)}
                style={{ padding: '8px 12px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(var(--cream-rgb),0.22)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12.5, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          );
        })()}
        {!readOnly && !editing && (
          <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
            Toca un hito para actualizar su avance.
          </div>
        )}
      </Card>

      {/* ── REGISTRO DE AVANCE (timeline fecha · % · comentario) ──────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 17, fontWeight: 800, color: 'var(--cream)' }}>Registro de avance</h3>
          <span style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>{comments.length} {comments.length === 1 ? 'entrada' : 'entradas'}</span>
        </div>

        {/* Composer */}
        {!readOnly && (
          <Card style={{ marginBottom: 16, padding: 14 }}>
            <textarea
              data-testid="avance-comment-input"
              value={comment} onChange={e => setComment(e.target.value)}
              placeholder="Nueva entrada del residente de obra (qué se avanzó, en qué nivel…)"
              rows={2} maxLength={800}
              style={{ width: '100%', padding: 11, background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.2)', borderRadius: 10, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button data-testid="avance-photo-upload" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9999, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid rgba(var(--cream-rgb),0.2)', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, cursor: uploadingPhoto ? 'wait' : 'pointer' }}>
                {uploadingPhoto ? <><Camera size={14} /> Subiendo…</> : <><Upload size={14} /> Subir foto</>}
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { handlePhotoFile(e.target.files); e.target.value = ''; }} />
              {photoUrl && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <img src={photoUrl} alt="foto" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(var(--cream-rgb),0.2)' }} />
                  <button onClick={() => setPhotoUrl('')} title="Quitar foto" style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', display: 'inline-flex' }}><X size={13} /></button>
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button data-testid="avance-comment-save" onClick={submitComment} disabled={!comment.trim() || submittingComment}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9999, background: (!comment.trim() || submittingComment) ? 'rgba(148,163,184,0.25)' : 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, cursor: (!comment.trim() || submittingComment) ? 'not-allowed' : 'pointer' }}>
                <Plus size={14} /> {submittingComment ? 'Publicando…' : 'Publicar avance'}
              </button>
            </div>
          </Card>
        )}

        {/* Timeline */}
        {comments.length === 0 ? (
          <Card style={{ padding: 24, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Aún no hay registros. Publica el primer avance de obra.
          </Card>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 6 }}>
            {comments.map((c, i) => {
              const accent = accentFor(c.stage_key);
              const last = i === comments.length - 1;
              return (
                <div key={c.id} data-testid={`avance-comment-${c.id}`} style={{ position: 'relative', paddingLeft: 30, paddingBottom: last ? 0 : 18 }}>
                  {/* línea vertical */}
                  {!last && <div style={{ position: 'absolute', left: 9, top: 22, bottom: 0, width: 2, background: 'rgba(var(--cream-rgb),0.12)' }} />}
                  {/* punto */}
                  <div style={{ position: 'absolute', left: 2, top: 4, width: 16, height: 16, borderRadius: '50%', background: '#fff', border: `3px solid ${accent}`, boxSizing: 'border-box' }} />
                  <Card style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: accent }}>{c.overall_percent != null ? `${c.overall_percent}%` : ''}</span>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{fmtDay(c.ts)}</span>
                      {c.stage_key && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: accent, background: `${accent}18`, border: `1px solid ${accent}40`, borderRadius: 9999, padding: '2px 9px', textTransform: 'capitalize' }}>
                          {(c.stage_key || '').replace(/_/g, ' ')}
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{c.author_name || 'Residente'}</span>
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.55 }}>{c.text}</div>
                    {c.photo_url && (
                      <div style={{ marginTop: 10 }}>
                        <img src={c.photo_url} alt="Foto avance" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid rgba(var(--cream-rgb),0.18)' }} onError={(e) => { e.target.style.display = 'none'; }} />
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── AVANCE POR UNIDAD ─────────────────────────────────────────────────── */}
      {data.units && data.units.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>AVANCE POR UNIDAD · {data.units.length} unidades</div>
          <Card style={{ padding: 0, overflow: 'hidden' }} data-testid="avance-units-table">
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'rgba(var(--cream-rgb),0.06)', backdropFilter: 'blur(6px)', zIndex: Z.BASE }}>
                  <tr style={{ borderBottom: '1px solid rgba(var(--cream-rgb),0.12)' }}>
                    {['Unidad', 'Prototipo', 'Etapa actual', '% Avance', 'Última act.', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--cream-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.units.map(u => <UnitRow key={u.unit_id} u={u} onSave={saveUnit} readOnly={readOnly} />)}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: Z.STICKY,
          padding: '12px 18px', borderRadius: 14,
          background: toast.type === 'ok' ? '#15803d' : '#b91c1c',
          color: '#fff', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, maxWidth: 360,
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }} data-testid="avance-toast">
          {toast.msg}
        </div>
      )}
    </div>
  );
}


const STAGE_OPTIONS = [
  { key: 'cimentacion', label: 'Cimentación' },
  { key: 'estructura', label: 'Estructura' },
  { key: 'instalaciones', label: 'Instalaciones' },
  { key: 'acabados', label: 'Acabados' },
  { key: 'entrega', label: 'Entrega' },
];

function UnitRow({ u, onSave, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState(u.percent_complete);
  const [stage, setStage] = useState(u.current_stage || 'cimentacion');
  const [saving, setSaving] = useState(false);
  const accent = accentFor(u.current_stage);

  const save = async () => {
    setSaving(true);
    await onSave(u.unit_id, pct, stage);
    setSaving(false);
    setEditing(false);
  };

  const cellSel = { background: '#fff', color: 'var(--cream)' };

  return (
    <tr data-testid={`unit-row-${u.unit_id}`} style={{ borderBottom: '1px solid rgba(var(--cream-rgb),0.08)' }}>
      <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, monospace', color: 'var(--cream)', fontWeight: 700 }}>{u.unit_number}</td>
      <td style={{ padding: '10px 14px', color: 'var(--cream-2)' }}>{u.prototype || '—'}</td>
      <td style={{ padding: '10px 14px' }}>
        {editing ? (
          <select data-testid={`unit-stage-${u.unit_id}`} value={stage} onChange={e => setStage(e.target.value)}
            style={{ padding: '4px 8px', background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 6, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12 }}>
            {STAGE_OPTIONS.map(s => <option key={s.key} value={s.key} style={cellSel}>{s.label}</option>)}
          </select>
        ) : (
          <span style={{ padding: '3px 10px', borderRadius: 9999, background: `${accent}18`, border: `1px solid ${accent}40`, color: accent, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700 }}>
            {STAGE_OPTIONS.find(s => s.key === u.current_stage)?.label || u.current_stage}
          </span>
        )}
      </td>
      <td style={{ padding: '10px 14px', minWidth: 120 }}>
        {editing ? (
          <input data-testid={`unit-pct-${u.unit_id}`} type="number" min={0} max={100} step={1} value={pct} onChange={e => setPct(+e.target.value)}
            style={{ width: 80, padding: '4px 8px', background: '#fff', border: '1px solid rgba(var(--cream-rgb),0.26)', borderRadius: 6, color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 12 }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: 'rgba(var(--cream-rgb),0.08)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${u.percent_complete}%`, height: '100%', background: accent, borderRadius: 999 }} />
            </div>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: accent, fontWeight: 700 }}>{u.percent_complete}%</span>
          </div>
        )}
      </td>
      <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)' }}>
        {u.updated_at ? new Date(u.updated_at).toLocaleDateString('es-MX') : '—'}
      </td>
      <td style={{ padding: '10px 14px' }}>
        {!readOnly && !editing && (
          <button data-testid={`unit-edit-${u.unit_id}`} onClick={() => { setPct(u.percent_complete); setStage(u.current_stage || 'cimentacion'); setEditing(true); }}
            style={{ padding: '5px 10px', borderRadius: 9999, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid rgba(var(--cream-rgb),0.2)', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}>
            Actualizar
          </button>
        )}
        {editing && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button data-testid={`unit-save-${u.unit_id}`} onClick={save} disabled={saving}
              style={{ padding: '5px 10px', borderRadius: 9999, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? '…' : 'Guardar'}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ padding: '5px 8px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(var(--cream-rgb),0.2)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 10.5, cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

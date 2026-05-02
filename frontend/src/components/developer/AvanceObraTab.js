// AvanceObraTab — Phase 4.25 · Construction progress timeline for /desarrollador/desarrollos/:slug/legajo
import React, { useEffect, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import * as api from '../../api/developer';
import { CheckCircle, Clock, MessageCircle, Image, Camera, Sparkle } from '../icons';

const STAGE_COLORS = {
  cimentacion:   { bg: 'rgba(99,102,241,0.14)', bd: 'rgba(99,102,241,0.35)', fg: '#a5b4fc' },
  estructura:    { bg: 'rgba(236,72,153,0.14)', bd: 'rgba(236,72,153,0.35)', fg: '#f9a8d4' },
  instalaciones: { bg: 'rgba(251,191,36,0.14)', bd: 'rgba(251,191,36,0.35)', fg: '#fcd34d' },
  acabados:      { bg: 'rgba(34,197,94,0.14)',  bd: 'rgba(34,197,94,0.35)',  fg: '#86efac' },
  entrega:       { bg: 'rgba(139,92,246,0.14)', bd: 'rgba(139,92,246,0.35)', fg: '#c4b5fd' },
};

export default function AvanceObraTab({ devId, readOnly = false }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);    // stage_key
  const [pct, setPct] = useState(0);
  const [toast, setToast] = useState(null);
  const [comment, setComment] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const load = async () => {
    try {
      const r = await api.getConstructionProgress(devId);
      setData(r);
    } catch (e) { setToast({ type: 'error', msg: e.body?.detail || 'Error al cargar' }); }
  };

  useEffect(() => { if (devId) load(); /* eslint-disable-next-line */ }, [devId]);

  const saveStage = async (stageKey) => {
    try {
      await api.updateConstructionStage(devId, { stage_key: stageKey, percent: pct });
      setToast({ type: 'ok', msg: `${stageKey} actualizado a ${pct}%` });
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
      setToast({ type: 'ok', msg: 'Comentario registrado' });
      load();
    } catch (e) { setToast({ type: 'error', msg: e.body?.detail || 'Error' }); }
    finally { setSubmittingComment(false); }
  };

  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando avance de obra…</div>;

  const stages = data.stages || [];
  const overall = data.overall_percent || 0;

  return (
    <div data-testid="avance-obra-tab">
      {/* Overall progress */}
      <Card style={{ marginBottom: 14, background: 'linear-gradient(140deg, rgba(236,72,153,0.08), transparent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">AVANCE CONSOLIDADO</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 48, color: 'var(--cream)', letterSpacing: '-0.03em' }}>{overall}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 16, color: 'var(--cream-3)' }}>%</div>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 4 }}>
              Etapa actual: <strong style={{ textTransform: 'capitalize', color: 'var(--cream)' }}>{(data.current_stage || '').replace(/_/g, ' ')}</strong>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 260, maxWidth: 420 }}>
            <div style={{ height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                width: `${overall}%`, height: '100%',
                background: 'var(--grad)',
                borderRadius: 999, transition: 'width 0.7s cubic-bezier(.4,0,.2,1)',
              }} />
            </div>
          </div>
        </div>
      </Card>

      {/* Timeline */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>TIMELINE POR ETAPA</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
        {stages.map((s, i) => {
          const clr = STAGE_COLORS[s.key] || STAGE_COLORS.cimentacion;
          const done = s.percent >= 100;
          const isEditing = editing === s.key;
          return (
            <Card key={s.key} data-testid={`avance-stage-${s.key}`} style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9999,
                  background: clr.bg, border: `1px solid ${clr.bd}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: clr.fg,
                }}>
                  {done ? <CheckCircle size={16} /> : <Clock size={14} />}
                </div>
                <div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
                    {i + 1}. {s.label}
                    {done && <Badge tone="ok" style={{ marginLeft: 8 }}>Completada</Badge>}
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 999, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{
                      width: `${s.percent}%`, height: '100%', background: clr.fg,
                      transition: 'width 0.5s',
                    }} />
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 4 }}>
                    {s.updated_at ? `Actualizada: ${new Date(s.updated_at).toLocaleDateString('es-MX')}` : 'Sin actualizaciones'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: clr.fg, minWidth: 60, textAlign: 'right' }}>
                    {s.percent}%
                  </div>
                  {!readOnly && !isEditing && (
                    <button
                      data-testid={`avance-edit-${s.key}`}
                      onClick={() => { setEditing(s.key); setPct(s.percent); }}
                      style={{
                        padding: '6px 12px', borderRadius: 9999,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                        color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>
                      Actualizar
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div style={{ marginTop: 14, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    data-testid={`avance-pct-${s.key}`}
                    type="number" min={0} max={100} step={1}
                    value={pct} onChange={e => setPct(+e.target.value)}
                    style={{
                      width: 100, padding: '8px 10px',
                      background: 'rgba(13,17,24,0.6)', border: '1px solid var(--border)',
                      borderRadius: 8, color: 'var(--cream)',
                      fontFamily: 'DM Mono, monospace', fontSize: 13,
                    }}
                  />
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>%</span>
                  <button
                    data-testid={`avance-save-${s.key}`}
                    onClick={() => saveStage(s.key)}
                    style={{
                      padding: '8px 16px', borderRadius: 9999,
                      background: 'var(--grad)', border: 'none', color: '#fff',
                      fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                    Guardar
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    style={{
                      padding: '8px 12px', borderRadius: 9999,
                      background: 'transparent', border: '1px solid var(--border)',
                      color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
                    }}>
                    Cancelar
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Comments / Reports */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>BITÁCORA · comentarios y fotos</div>
      {!readOnly && (
        <Card style={{ marginBottom: 12 }}>
          <textarea
            data-testid="avance-comment-input"
            value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Comentario del residente de obra (máx 800 chars)…"
            rows={3} maxLength={800}
            style={{
              width: '100%', padding: 10, background: 'rgba(13,17,24,0.6)',
              border: '1px solid var(--border)', borderRadius: 10, color: 'var(--cream)',
              fontFamily: 'DM Sans', fontSize: 13, resize: 'vertical', marginBottom: 8,
            }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              data-testid="avance-photo-url"
              type="url" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)}
              placeholder="URL de foto (opcional)"
              style={{
                flex: 1, minWidth: 240, padding: '8px 10px',
                background: 'rgba(13,17,24,0.6)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 12,
              }}
            />
            <button
              data-testid="avance-comment-save"
              onClick={submitComment}
              disabled={!comment.trim() || submittingComment}
              style={{
                padding: '9px 16px', borderRadius: 9999,
                background: (!comment.trim() || submittingComment) ? 'rgba(148,163,184,0.25)' : 'var(--grad)',
                border: 'none', color: '#fff',
                fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
                cursor: (!comment.trim() || submittingComment) ? 'not-allowed' : 'pointer',
              }}>
              {submittingComment ? 'Guardando…' : 'Publicar'}
            </button>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(data.comments || []).length === 0 && (
          <Card style={{ padding: 24, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Sin comentarios aún.
          </Card>
        )}
        {(data.comments || []).map(c => (
          <Card key={c.id} data-testid={`avance-comment-${c.id}`} style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
              <div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', fontWeight: 600 }}>
                  {c.author_name || 'Residente'}
                </div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', marginTop: 2 }}>
                  {new Date(c.ts).toLocaleString('es-MX')}
                </div>
              </div>
              {c.stage_key && <Badge tone="brand">{c.stage_key}</Badge>}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.55, marginTop: 6 }}>
              {c.text}
            </div>
            {c.photo_url && (
              <div style={{ marginTop: 10 }}>
                <img
                  src={c.photo_url} alt="Foto avance"
                  style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
          </Card>
        ))}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 620,
          padding: '12px 18px', borderRadius: 14,
          background: toast.type === 'ok' ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.16)',
          border: `1px solid ${toast.type === 'ok' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.type === 'ok' ? '#86efac' : '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500, maxWidth: 360,
        }} data-testid="avance-toast">
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// W5.16-C Sub-C · VideoQueueList · tabla de tareas + polling 5s + acciones
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listTasks, deleteTask } from '../../api/studioVideo';
import VideoRatioPreview from './VideoRatioPreview';

const CREAM = 'var(--cream)';
const INDIGO = '#6366F1';
const MUTED = 'var(--cream-2)';
const MUTED_2 = 'var(--cream-3)';
const CARD_BG = 'var(--surface)';
const BORDER = '1px solid var(--border)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const POLL_MS = 5000;

const STATUS_STYLE = {
  queued: { bg: 'var(--cream-3)', color: CREAM, border: '1px solid var(--border)' },
  processing: { bg: GRAD, color: '#FFF', border: '1px solid transparent' },
  completed: { bg: 'rgba(34,197,94,0.14)', color: '#86EFAC', border: '1px solid rgba(34,197,94,0.40)' },
  failed: { bg: 'rgba(236,72,153,0.12)', color: '#F9A8D4', border: '1px solid rgba(236,72,153,0.40)' },
};

function truncate(text, n = 60) {
  if (!text) return '—';
  const s = String(text);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return String(iso); }
}

export default function VideoQueueList({ refreshKey, onRegenerate }) {
  const { t } = useTranslation('common');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewTask, setViewTask] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchTasks = useCallback(async () => {
    const r = await listTasks(20);
    if (!mountedRef.current) return r;
    setTasks(Array.isArray(r?.tasks) ? r.tasks : []);
    setLoading(false);
    return r;
  }, []);

  // Init fetch + polling control
  useEffect(() => {
    mountedRef.current = true;
    fetchTasks();
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTasks, refreshKey]);

  // Polling cada 5s si hay tareas pending/processing
  useEffect(() => {
    const hasPending = tasks.some((tt) => ['queued', 'processing'].includes(String(tt.status)));
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (hasPending) {
      intervalRef.current = setInterval(fetchTasks, POLL_MS);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tasks, fetchTasks]);

  const onDelete = async () => {
    if (!confirmDelete) return;
    await deleteTask(confirmDelete);
    setConfirmDelete(null);
    fetchTasks();
  };

  const onRegenerateClick = (task) => {
    if (typeof onRegenerate === 'function') onRegenerate(task);
  };

  return (
    <section
      data-testid="video-queue-list"
      style={{
        background: CARD_BG, border: BORDER, borderRadius: 20,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        fontFamily: 'DM Sans, sans-serif', color: CREAM, overflow: 'hidden',
      }}
    >
      <header style={{
        padding: '14px 18px', borderBottom: BORDER,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 16, color: CREAM, letterSpacing: '-0.01em' }}>
          {t('studioVideo.queue.title', 'Mis videos generados')}
        </h2>
        <span style={{ fontSize: 11, color: MUTED_2 }}>{tasks.length} / 20</span>
      </header>

      {loading && (
        <div data-testid="vql-loading" style={{ padding: 14 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{
              height: 56, borderRadius: 12, margin: '6px 0',
              background: 'linear-gradient(90deg, var(--surface-2), var(--surface-2), var(--surface-2))',
              backgroundSize: '200% 100%', animation: 'vqlShimmer 1.4s linear infinite',
            }} />
          ))}
          <style>{`@keyframes vqlShimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }`}</style>
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div data-testid="vql-empty" style={{ padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ letterSpacing: '0.22em', fontSize: 11, color: INDIGO, textTransform: 'uppercase', marginBottom: 10 }}>
            {t('studioVideo.queue.emptyEyebrow', 'Sin videos aun')}
          </div>
          <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>
            {t('studioVideo.queue.empty', 'Aun no has generado videos · Crea tu primer reel.')}
          </p>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div role="table" data-testid="vql-table">
          <div role="row" style={{
            display: 'grid',
            gridTemplateColumns: '64px 1fr 100px 120px 110px 130px 180px',
            gap: 10, padding: '10px 18px',
            background: 'var(--surface-2)',
            borderBottom: BORDER,
            color: MUTED_2,
            fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700,
          }}>
            <span>{t('studioVideo.queue.col_thumb', 'Thumb')}</span>
            <span>{t('studioVideo.queue.col_script', 'Script')}</span>
            <span>{t('studioVideo.queue.col_provider', 'Provider')}</span>
            <span>{t('studioVideo.queue.col_ratios', 'Ratios')}</span>
            <span>{t('studioVideo.queue.col_status', 'Status')}</span>
            <span>{t('studioVideo.queue.col_date', 'Fecha')}</span>
            <span style={{ textAlign: 'right' }}>{t('studioVideo.queue.col_actions', 'Acciones')}</span>
          </div>

          {tasks.map((task) => {
            const status = String(task.status || 'queued').toLowerCase();
            const sStyle = STATUS_STYLE[status] || STATUS_STYLE.queued;
            const ratiosObj = task.ratios || {};
            const ratioKeys = Object.keys(ratiosObj);
            return (
              <div
                key={task.task_id}
                role="row"
                data-testid={`vql-row-${task.task_id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr 100px 120px 110px 130px 180px',
                  gap: 10, padding: '12px 18px',
                  alignItems: 'center', borderBottom: BORDER,
                }}
              >
                <span style={{
                  width: 56, height: 40, borderRadius: 8,
                  background: task.thumbnail_url
                    ? `url(${task.thumbnail_url}) center/cover`
                    : 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.18))',
                  border: BORDER,
                }} />
                <span style={{ fontSize: 13, color: CREAM, lineHeight: 1.35 }}>{truncate(task.script, 60)}</span>
                <span style={{ fontSize: 12, color: MUTED, textTransform: 'capitalize' }}>{task.provider || 'auto'}</span>
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {ratioKeys.length === 0 ? <span style={{ fontSize: 11, color: MUTED_2 }}>—</span> : ratioKeys.map((rk) => (
                    <span key={rk} style={{
                      padding: '2px 7px', borderRadius: 9999,
                      background: 'rgba(99,102,241,0.10)', color: '#C7D2FE',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                      border: `1px solid ${INDIGO}33`,
                    }}>{rk}</span>
                  ))}
                </span>
                <span>
                  <span
                    data-testid={`vql-row-status-${status}`}
                    style={{
                      padding: '3px 10px', borderRadius: 9999,
                      background: sStyle.bg, color: sStyle.color, border: sStyle.border,
                      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}
                  >{t(`studioVideo.status.${status}`, status)}</span>
                </span>
                <span style={{ fontSize: 11.5, color: MUTED_2 }}>{fmtDate(task.created_at || task.updated_at)}</span>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    data-testid={`vql-row-view-${task.task_id}`}
                    onClick={() => setViewTask(task)}
                    disabled={status !== 'completed'}
                    style={{
                      padding: '6px 12px', borderRadius: 9999,
                      background: 'rgba(99,102,241,0.10)', color: '#C7D2FE',
                      border: `1px solid ${INDIGO}33`,
                      fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 700,
                      cursor: status === 'completed' ? 'pointer' : 'not-allowed',
                      opacity: status === 'completed' ? 1 : 0.5,
                    }}
                  >{t('studioVideo.queue.btn_view', 'Ver')}</button>
                  <button
                    type="button"
                    data-testid={`vql-row-regenerate-${task.task_id}`}
                    onClick={() => onRegenerateClick(task)}
                    style={{
                      padding: '6px 12px', borderRadius: 9999,
                      background: 'transparent', color: CREAM,
                      border: '1px solid var(--border)',
                      fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >{t('studioVideo.queue.btn_regenerate', 'Re-generar')}</button>
                  <button
                    type="button"
                    data-testid={`vql-row-delete-${task.task_id}`}
                    onClick={() => setConfirmDelete(task.task_id)}
                    style={{
                      padding: '6px 12px', borderRadius: 9999,
                      background: 'transparent', color: '#F9A8D4',
                      border: '1px solid rgba(236,72,153,0.30)',
                      fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >{t('studioVideo.queue.btn_delete', 'Eliminar')}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View modal */}
      {viewTask && (
        <div
          data-testid="vql-view-modal"
          role="dialog"
          onClick={() => setViewTask(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'var(--surface)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: '100%' }}>
            <VideoRatioPreview
              task_id={viewTask.task_id}
              ratios={viewTask.ratios || {}}
              is_stub={!!viewTask.is_stub}
              scriptHint={viewTask.script}
            />
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div
          data-testid="vql-confirm-delete-modal"
          role="dialog"
          onClick={() => setConfirmDelete(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'var(--surface)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: CARD_BG, border: BORDER, borderRadius: 20, padding: 24,
              maxWidth: 380, width: '100%', textAlign: 'center',
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18, color: CREAM }}>
              {t('studioVideo.queue.confirmDeleteTitle', 'Eliminar este video?')}
            </h3>
            <p style={{ margin: '0 0 18px', color: MUTED, fontSize: 13 }}>
              {t('studioVideo.queue.confirmDeleteBody', 'Esta accion no se puede deshacer.')}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: '8px 18px', borderRadius: 9999,
                  background: 'transparent', color: CREAM,
                  border: '1px solid var(--border)',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >{t('studioVideo.cancel', 'Cancelar')}</button>
              <button
                type="button"
                data-testid="vql-confirm-delete-yes-btn"
                onClick={onDelete}
                style={{
                  padding: '8px 18px', borderRadius: 9999, border: 'none',
                  background: 'linear-gradient(90deg, #EC4899, #6366F1)',
                  color: '#FFF',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: `transform 280ms ${EASE}`,
                }}
              >{t('studioVideo.queue.btn_delete', 'Eliminar')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

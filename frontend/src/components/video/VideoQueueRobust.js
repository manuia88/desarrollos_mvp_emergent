// W5.22 Z.4 · VideoQueueRobust · cola mejorada vs W5.16-C básica.
// Filtros (days · provider · status · ratio) + sort · status badges con retry/fallback ·
// acciones por row (Ver · Re-generar · Export · Delete · Share WA) · polling 5s.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw, Eye, FileDown, Trash2, Share2, Loader2, AlertCircle, CheckCircle2, Clock,
} from 'lucide-react';
import {
  getStandaloneHistory, deleteStandaloneVideo, shareStandaloneWhatsApp,
} from '../../api/videoStandalone';

const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const POLL_MS = 5000;

const PROVIDERS = ['', 'luma', 'pika', 'runway', 'replicate_kling'];
const STATUSES = ['', 'queued', 'processing', 'completed', 'error'];
const RATIOS = ['', '1:1', '9:16', '16:9'];
const DAYS = [7, 30, 90, 365];

const STATUS_STYLE = {
  completed: { bg: 'rgba(34,197,94,0.16)', fg: '#22C55E', bd: 'rgba(34,197,94,0.4)', Icon: CheckCircle2 },
  processing: { bg: 'rgba(99,102,241,0.16)', fg: '#818CF8', bd: 'rgba(99,102,241,0.4)', Icon: Loader2 },
  queued: { bg: 'rgba(245,158,11,0.14)', fg: '#FBBF24', bd: 'rgba(245,158,11,0.4)', Icon: Clock },
  error: { bg: 'rgba(239,68,68,0.14)', fg: '#F87171', bd: 'rgba(239,68,68,0.4)', Icon: AlertCircle },
};

function StatusBadge({ status, retryCount, fallbackAttempts }) {
  const { t } = useTranslation('common');
  const s = STATUS_STYLE[status] || STATUS_STYLE.queued;
  const Icon = s.Icon;
  const fb = Array.isArray(fallbackAttempts) ? fallbackAttempts.length : 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
        borderRadius: 9999, background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
        fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 700,
      }}>
        <Icon size={11} className={status === 'processing' ? 'animate-spin' : undefined} />
        {t(`videoStandalone.status.${status}`, status)}
      </span>
      {retryCount > 1 && (
        <span data-testid="vqr-retry" style={{ fontSize: 10.5, color: MUTED_2, fontFamily: 'DM Sans, sans-serif' }}>
          {t('videoStandalone.retries', '{{n}} intentos', { n: retryCount })}
        </span>
      )}
      {fb > 1 && (
        <span data-testid="vqr-fallback" style={{ fontSize: 10.5, color: MUTED_2, fontFamily: 'DM Sans, sans-serif' }}>
          {t('videoStandalone.fallbacks', '{{n}} fallback', { n: fb })}
        </span>
      )}
    </span>
  );
}

const selectStyle = {
  padding: '7px 10px', borderRadius: 9999, background: 'rgba(240,235,224,0.04)',
  border: '1px solid rgba(240,235,224,0.14)', color: CREAM,
  fontFamily: 'DM Sans, sans-serif', fontSize: 12, outline: 'none', cursor: 'pointer',
};

const actionBtn = (color = CREAM) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px',
  borderRadius: 9999, background: 'transparent', color,
  border: '1px solid rgba(240,235,224,0.18)', fontFamily: 'DM Sans, sans-serif',
  fontSize: 11, fontWeight: 700, cursor: 'pointer',
});

export default function VideoQueueRobust({ refreshKey = 0, onRegenerate, onExport, onView }) {
  const { t } = useTranslation('common');
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ days: 30, provider: '', status: '', ratio: '' });
  const [sortAsc, setSortAsc] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStandaloneHistory({
        days: filters.days, provider: filters.provider || undefined,
        status: filters.status || undefined, ratio: filters.ratio || undefined,
      });
      setItems(res.items || []);
      setActive(res.active || 0);
    } catch {
      setItems([]);
      setActive(0);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Polling 5s mientras haya jobs queued/processing · stop al all done
  useEffect(() => {
    if (active > 0 && !pollRef.current) {
      pollRef.current = setInterval(load, POLL_MS);
    }
    if (active === 0 && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [active, load]);

  const handleDelete = async (videoId) => {
    await deleteStandaloneVideo(videoId);
    load();
  };

  const handleShare = async (videoId) => {
    try {
      const res = await shareStandaloneWhatsApp(videoId, '9:16');
      if (res?.wa_url) window.open(res.wa_url, '_blank', 'noopener,noreferrer');
    } catch { /* silent */ }
  };

  const sorted = [...items].sort((a, b) => {
    const da = new Date(a.created_at || 0).getTime();
    const db = new Date(b.created_at || 0).getTime();
    return sortAsc ? da - db : db - da;
  });

  return (
    <section data-testid="video-queue-robust" style={{
      background: CARD_BG, border: BORDER, borderRadius: 24, padding: 20,
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      fontFamily: 'DM Sans, sans-serif', color: CREAM, display: 'grid', gap: 14,
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em' }}>
          {t('videoStandalone.queue.title', 'Mis videos')}
        </h3>
        <button type="button" data-testid="vqr-refresh" onClick={load} style={actionBtn()}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
          {t('videoStandalone.queue.refresh', 'Actualizar')}
        </button>
      </header>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select data-testid="vqr-filter-days" value={filters.days} onChange={(e) => setFilters((f) => ({ ...f, days: Number(e.target.value) }))} style={selectStyle}>
          {DAYS.map((d) => <option key={d} value={d}>{t('videoStandalone.queue.lastDays', '{{n}}d', { n: d })}</option>)}
        </select>
        <select data-testid="vqr-filter-provider" value={filters.provider} onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value }))} style={selectStyle}>
          {PROVIDERS.map((p) => <option key={p || 'all'} value={p}>{p ? p : t('videoStandalone.queue.allProviders', 'Todos los proveedores')}</option>)}
        </select>
        <select data-testid="vqr-filter-status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} style={selectStyle}>
          {STATUSES.map((s) => <option key={s || 'all'} value={s}>{s ? t(`videoStandalone.status.${s}`, s) : t('videoStandalone.queue.allStatuses', 'Todos los estados')}</option>)}
        </select>
        <select data-testid="vqr-filter-ratio" value={filters.ratio} onChange={(e) => setFilters((f) => ({ ...f, ratio: e.target.value }))} style={selectStyle}>
          {RATIOS.map((r) => <option key={r || 'all'} value={r}>{r ? r : t('videoStandalone.queue.allRatios', 'Todos los formatos')}</option>)}
        </select>
        <button type="button" data-testid="vqr-sort" onClick={() => setSortAsc((v) => !v)} style={actionBtn()}>
          {sortAsc ? t('videoStandalone.queue.sortOld', 'Antiguos primero') : t('videoStandalone.queue.sortNew', 'Recientes primero')}
        </button>
      </div>

      {/* Lista */}
      {sorted.length === 0 ? (
        <div data-testid="vqr-empty" style={{ padding: '24px 8px', textAlign: 'center', color: MUTED_2, fontSize: 13 }}>
          {loading ? t('videoStandalone.queue.loading', 'Cargando...') : t('videoStandalone.queue.empty', 'Aún no hay videos. Genera el primero arriba.')}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {sorted.map((it) => (
            <div key={it.video_id} data-testid="vqr-row" data-video-id={it.video_id} style={{
              display: 'grid', gap: 8, padding: '12px 14px', borderRadius: 16,
              background: 'rgba(240,235,224,0.03)', border: BORDER,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusBadge status={it.status} retryCount={it.retry_count} fallbackAttempts={it.fallback_attempts} />
                <span style={{ fontSize: 11, color: MUTED_2 }}>
                  {it.provider_used || it.provider_preferred || '-'}
                  {' · '}{it.duration_sec || '-'}s
                  {it.is_stub ? ` · ${t('videoStandalone.demo', 'demo')}` : ''}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.45 }}>
                {(it.script || '').slice(0, 120)}{(it.script || '').length > 120 ? '…' : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" data-testid="vqr-view" onClick={() => onView && onView(it)} style={actionBtn()}>
                  <Eye size={12} /> {t('videoStandalone.actions.view', 'Ver')}
                </button>
                <button type="button" data-testid="vqr-regen" onClick={() => onRegenerate && onRegenerate(it)} style={actionBtn()}>
                  <RefreshCw size={12} /> {t('videoStandalone.actions.regenerate', 'Re-generar')}
                </button>
                <button
                  type="button" data-testid="vqr-export"
                  onClick={() => onExport && onExport(it)}
                  disabled={it.status !== 'completed'}
                  style={{ ...actionBtn(), opacity: it.status === 'completed' ? 1 : 0.5, cursor: it.status === 'completed' ? 'pointer' : 'not-allowed' }}>
                  <FileDown size={12} /> {t('videoStandalone.actions.export', 'Export')}
                </button>
                <button
                  type="button" data-testid="vqr-share"
                  onClick={() => handleShare(it.video_id)}
                  disabled={it.status !== 'completed' || it.is_stub}
                  style={{ ...actionBtn('#25D366'), opacity: (it.status === 'completed' && !it.is_stub) ? 1 : 0.5, cursor: (it.status === 'completed' && !it.is_stub) ? 'pointer' : 'not-allowed' }}>
                  <Share2 size={12} /> WhatsApp
                </button>
                <button type="button" data-testid="vqr-delete" onClick={() => handleDelete(it.video_id)} style={actionBtn('#F87171')}>
                  <Trash2 size={12} /> {t('videoStandalone.actions.delete', 'Eliminar')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {active > 0 && (
        <div data-testid="vqr-polling" style={{ fontSize: 11, color: MUTED_2, textAlign: 'center' }}>
          {t('videoStandalone.queue.polling', 'Actualizando estado cada 5s · {{n}} en proceso', { n: active })}
        </div>
      )}
      <div aria-hidden style={{ height: 2, borderRadius: 9999, background: GRAD, opacity: 0.5 }} />
    </section>
  );
}

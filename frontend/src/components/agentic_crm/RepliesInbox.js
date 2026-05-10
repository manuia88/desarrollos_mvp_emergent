/**
 * W4.6 Y.3C — RepliesInbox
 * Bandeja de respuestas de email clasificadas por AI · 6 categorías + 5 acciones.
 * Mounted en AsesorTareas como sección "Respuestas".
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Mail, Cpu, Database, Zap, ChevronDown, ChevronRight, Check,
  AlertCircle, Inbox, Filter, Loader2, RefreshCw,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

const LAYER_META = {
  llm:       { label: 'LLM',        color: '#6366F1', Icon: Cpu },
  cached:    { label: 'Caché',      color: '#F59E0B', Icon: Database },
  cache:     { label: 'Caché',      color: '#F59E0B', Icon: Database },
  heuristic: { label: 'Heurística', color: '#94A3B8', Icon: Zap },
};

const URGENCY_META = {
  high:   { label: 'ALTA',  color: '#EF4444' },
  medium: { label: 'MEDIA', color: '#F59E0B' },
  low:    { label: 'BAJA',  color: '#10B981' },
};

const CATEGORY_META = {
  interested:    { label: 'Interesado',  color: '#10B981' },
  objection:     { label: 'Objeción',    color: '#F59E0B' },
  question:      { label: 'Pregunta',    color: '#6366F1' },
  soft_silence:  { label: 'Tibio',       color: '#94A3B8' },
  unsubscribe:   { label: 'Unsubscribe', color: '#EF4444' },
  spam:          { label: 'Spam',        color: '#64748B' },
};

const ACTION_LABELS = {
  notify_asesor:        'Notificar asesor',
  escalate_manager:     'Escalar a manager',
  add_watchlist:        'Agregar a watchlist',
  advance_funnel_stage: 'Avanzar funnel',
  mark_spam:            'Marcar spam',
};

const FILTER_OPTS = [
  { k: 'pending',      label: 'Pendientes' },
  { k: 'action_taken', label: 'Atendidas' },
  { k: 'archived',     label: 'Archivadas' },
  { k: 'all',          label: 'Todas' },
];

const URGENCY_OPTS = [
  { k: 'all',    label: 'Todas' },
  { k: 'high',   label: 'Alta' },
  { k: 'medium', label: 'Media' },
  { k: 'low',    label: 'Baja' },
];

function Pill({ label, color, Icon, testid }) {
  return (
    <span
      data-testid={testid}
      style={{
        padding: '2px 9px', borderRadius: 9999, fontSize: 10.5,
        fontFamily: 'DM Sans', fontWeight: 700,
        background: `${color}22`, border: `1px solid ${color}44`, color,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}
    >
      {Icon ? <Icon size={10} /> : null}
      {label}
    </span>
  );
}

function PillButton({ children, onClick, variant = 'primary', disabled, testid, Icon }) {
  const styles = {
    primary: { background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', border: 'none' },
    ghost:   { background: 'transparent', color: 'var(--cream)', border: '1px solid rgba(240,235,224,0.18)' },
    success: { background: 'transparent', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' },
  };
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full"
      style={{
        ...styles[variant],
        padding: '6px 14px', borderRadius: 9999, fontFamily: 'DM Sans',
        fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'transform 120ms ease, opacity 120ms ease',
      }}
    >
      {Icon ? <Icon size={12} /> : null}
      {children}
    </button>
  );
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function ReplyRow({ reply, onMarkActionTaken, busy }) {
  const [expanded, setExpanded] = useState(false);
  const cls = reply.classification || {};
  const urg = URGENCY_META[cls.urgency] || URGENCY_META.medium;
  const cat = CATEGORY_META[cls.category] || { label: '—', color: '#94A3B8' };
  const layer = LAYER_META[reply.layer_used] || LAYER_META.heuristic;

  const isPending = reply.status === 'pending';

  return (
    <div
      data-testid={`reply-row-${reply.reply_id}`}
      style={{
        padding: 14, marginBottom: 10,
        background: isPending ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isPending ? `${urg.color}44` : 'var(--border)'}`,
        borderRadius: 14,
        transition: 'all 160ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <Pill label={cat.label} color={cat.color} testid={`reply-cat-${reply.reply_id}`} />
            <Pill label={urg.label} color={urg.color} testid={`reply-urg-${reply.reply_id}`} />
            <Pill label={layer.label} color={layer.color} Icon={layer.Icon} />
            {cls.confidence_score != null ? (
              <Pill label={`${cls.confidence_score}%`} color="#94A3B8" />
            ) : null}
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13.5, color: 'var(--cream)',
            marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {reply.from_email || '—'}
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {reply.subject || '—'}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 4 }}>
            Recibido {fmtDateTime(reply.received_at)}
          </div>
        </div>
        <button
          data-testid={`reply-toggle-${reply.reply_id}`}
          onClick={() => setExpanded(v => !v)}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 10, padding: '4px 8px' }}
          aria-label={expanded ? 'Cerrar' : 'Detalles'}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {cls.recommended_action_text ? (
            <div style={{
              padding: 10, marginBottom: 10,
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.24)',
              borderRadius: 10,
            }}>
              <div style={{
                fontSize: 9.5, color: '#A5B4FC', textTransform: 'uppercase',
                letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4,
              }}>
                Acción recomendada · {ACTION_LABELS[cls.next_best_action_type] || '—'}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)' }}>
                {cls.recommended_action_text}
              </div>
            </div>
          ) : null}

          {Array.isArray(cls.key_phrases) && cls.key_phrases.length > 0 ? (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
              {cls.key_phrases.map((kp, i) => (
                <Pill key={i} label={kp} color="#94A3B8" />
              ))}
            </div>
          ) : null}

          {reply.body_text ? (
            <div style={{
              padding: 10, background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)', borderRadius: 10,
              fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)',
              whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto',
            }}>
              {reply.body_text.slice(0, 1200)}
              {reply.body_text.length > 1200 ? '…' : ''}
            </div>
          ) : null}

          {isPending ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <PillButton
                onClick={() => onMarkActionTaken(reply.reply_id)}
                disabled={busy}
                variant="success"
                testid={`reply-mark-action-${reply.reply_id}`}
                Icon={Check}
              >
                Marcar como atendida
              </PillButton>
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--cream-3)' }}>
              {reply.status === 'action_taken'
                ? `Atendida · ${fmtDateTime(reply.action_taken_at)}`
                : `Estado: ${reply.status}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RepliesInbox({ asesorId }) {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
    if (urgencyFilter && urgencyFilter !== 'all') params.set('urgency', urgencyFilter);
    if (asesorId) params.set('asesor_id', asesorId);
    params.set('limit', '50');
    return params.toString();
  }, [statusFilter, urgencyFilter, asesorId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/agentic-crm/replies?${queryString}`);
      setReplies(Array.isArray(data.replies) ? data.replies : []);
    } catch (e) {
      setError(e.message || 'Error al cargar respuestas');
      setReplies([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { load(); }, [load]);

  const handleMarkActionTaken = async (replyId) => {
    setBusyId(replyId);
    try {
      await apiFetch(`/api/agentic-crm/replies/${replyId}/mark-action-taken`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message || 'No se pudo marcar como atendida');
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const high = replies.filter(r => (r.classification || {}).urgency === 'high').length;
    return { total: replies.length, high };
  }, [replies]);

  return (
    <div
      data-testid="replies-inbox"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
        borderRadius: 16, padding: 16, marginBottom: 16,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Inbox size={18} style={{ color: '#A5B4FC' }} />
          <div>
            <div style={{
              fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'var(--cream-3)', fontWeight: 700,
            }}>
              CRM · Respuestas clasificadas
            </div>
            <div style={{
              fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--cream)',
            }}>
              Bandeja inteligente
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Pill
            label={`${counts.total} total`}
            color="#94A3B8"
            Icon={Mail}
            testid="replies-count-total"
          />
          {counts.high > 0 ? (
            <Pill
              label={`${counts.high} ALTA`}
              color="#EF4444"
              Icon={AlertCircle}
              testid="replies-count-high"
            />
          ) : null}
          <button
            data-testid="replies-refresh"
            onClick={load}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 10, padding: '4px 8px' }}
            aria-label="Refrescar"
            disabled={loading}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Filter size={11} style={{ color: 'var(--cream-3)' }} />
          {FILTER_OPTS.map(opt => (
            <button
              key={opt.k}
              data-testid={`replies-filter-status-${opt.k}`}
              onClick={() => setStatusFilter(opt.k)}
              className="rounded-full"
              style={{
                padding: '4px 10px', borderRadius: 9999, fontSize: 11,
                fontFamily: 'DM Sans', fontWeight: 600,
                background: statusFilter === opt.k ? 'rgba(99,102,241,0.18)' : 'transparent',
                color: statusFilter === opt.k ? '#A5B4FC' : 'var(--cream-3)',
                border: `1px solid ${statusFilter === opt.k ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {URGENCY_OPTS.map(opt => (
            <button
              key={opt.k}
              data-testid={`replies-filter-urgency-${opt.k}`}
              onClick={() => setUrgencyFilter(opt.k)}
              className="rounded-full"
              style={{
                padding: '4px 10px', borderRadius: 9999, fontSize: 11,
                fontFamily: 'DM Sans', fontWeight: 600,
                background: urgencyFilter === opt.k ? 'rgba(236,72,153,0.18)' : 'transparent',
                color: urgencyFilter === opt.k ? '#F9A8D4' : 'var(--cream-3)',
                border: `1px solid ${urgencyFilter === opt.k ? 'rgba(236,72,153,0.4)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div
          data-testid="replies-error"
          style={{
            padding: 12,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.32)',
            borderRadius: 12, color: '#FCA5A5',
            fontFamily: 'DM Sans', fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading && replies.length === 0 ? (
        <div
          data-testid="replies-loading"
          style={{
            padding: 28, textAlign: 'center', color: 'var(--cream-3)',
            fontFamily: 'DM Sans', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Loader2 size={14} className="animate-spin" /> Cargando respuestas…
        </div>
      ) : null}

      {!loading && replies.length === 0 && !error ? (
        <div
          data-testid="replies-empty"
          style={{
            padding: 32, textAlign: 'center',
            fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)',
          }}
        >
          Sin respuestas en este filtro. Cuando lleguen replies a tus campañas, aparecerán aquí
          clasificadas automáticamente con AI.
        </div>
      ) : null}

      {replies.map(r => (
        <ReplyRow
          key={r.reply_id}
          reply={r}
          onMarkActionTaken={handleMarkActionTaken}
          busy={busyId === r.reply_id}
        />
      ))}
    </div>
  );
}

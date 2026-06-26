/**
 * W4.6 Y.3E — NurtureIntelligentPanel
 * 5to sub-tab en SubAgentsTabs (TenantDrawer · superadmin).
 * Stats + tabla últimas sequences + dry-run modal + toggle org.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cpu, Database, Zap, Loader2, RefreshCw, AlertCircle,
  Play, Pause, Eye, X, Settings,
} from 'lucide-react';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

const SEQ_TYPE_META = {
  'warm-fast':            { label: 'Warm fast',        color: '#EF4444' },
  'warm-medium':          { label: 'Warm medium',      color: '#F59E0B' },
  'cold-warm':            { label: 'Cold warm',        color: '#3B82F6' },
  'stalled-recovery':     { label: 'Stalled recovery', color: '#8B5CF6' },
  'interested-confirmed': { label: 'Interested',       color: '#10B981' },
};

const STATUS_META = {
  active:    { label: 'Activa',     color: '#10B981' },
  paused:    { label: 'Pausada',    color: '#F59E0B' },
  completed: { label: 'Completada', color: '#94A3B8' },
  preview:   { label: 'Preview',    color: 'var(--theme)' },
  escalated: { label: 'Escalada',   color: '#EF4444' },
};

const LAYER_META = {
  llm:       { label: 'LLM',        color: 'var(--theme)', Icon: Cpu },
  cached:    { label: 'Caché',      color: '#F59E0B', Icon: Database },
  cache:     { label: 'Caché',      color: '#F59E0B', Icon: Database },
  heuristic: { label: 'Heurística', color: '#94A3B8', Icon: Zap },
  legacy_fallback: { label: 'Legacy', color: '#64748B', Icon: Zap },
};

const CHANNEL_LABEL = {
  email: 'Email', whatsapp: 'WhatsApp', asesor_handoff: 'Handoff asesor',
};

function Pill({ label, color, Icon, testid }) {
  return (
    <span
      data-testid={testid}
      style={{
        padding: '2px 8px', borderRadius: 9999, fontSize: 10,
        fontFamily: 'DM Sans', fontWeight: 700,
        background: `${color}22`, border: `1px solid ${color}44`, color,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}
    >
      {Icon ? <Icon size={9} /> : null}
      {label}
    </span>
  );
}

function PillButton({ children, onClick, variant = 'ghost', disabled, testid, Icon }) {
  const styles = {
    primary: { background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff', border: 'none' },
    ghost:   { background: 'transparent', color: 'var(--cream)', border: '1px solid rgba(240,235,224,0.18)' },
    warn:    { background: 'transparent', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.32)' },
    success: { background: 'transparent', color: '#10B981', border: '1px solid rgba(16,185,129,0.32)' },
  };
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full"
      style={{
        ...styles[variant],
        padding: '4px 10px', borderRadius: 9999, fontFamily: 'DM Sans',
        fontSize: 10.5, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      {Icon ? <Icon size={10} /> : null}
      {children}
    </button>
  );
}

function StatCard({ label, value, sub, testid }) {
  return (
    <div
      data-testid={testid}
      style={{
        flex: 1, minWidth: 140,
        padding: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}
    >
      <div style={{
        fontSize: 9.5, color: 'var(--cream-3)',
        textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
        color: 'var(--cream)', marginTop: 2,
      }}>
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export default function NurtureIntelligentPanel({ orgId }) {
  const [stats, setStats] = useState(null);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [dryRunModal, setDryRunModal] = useState(null); // { leadId, loading, result, error }
  const [toggleModal, setToggleModal] = useState(null); // { tier, submitting }
  const [currentTier, setCurrentTier] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [statsResp, seqResp, settings] = await Promise.all([
        apiFetch(`/api/superadmin/agentic-crm/nurture/stats?org_id=${encodeURIComponent(orgId)}&days=30`),
        apiFetch(`/api/agentic-crm/nurture/sequences?org_id=${encodeURIComponent(orgId)}&status=${statusFilter}&limit=50`),
        apiFetch(`/api/superadmin/phase-y/${encodeURIComponent(orgId)}`).catch(() => null),
      ]);
      setStats(statsResp);
      setSequences(seqResp.sequences || []);
      const t = settings?.feature_tiers?.nurture_intelligent || 'off';
      setCurrentTier(t);
    } catch (e) {
      setError(e.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handlePause = async (leadId) => {
    setBusyId(leadId);
    try {
      await apiFetch(`/api/agentic-crm/nurture/sequences/${encodeURIComponent(leadId)}/pause`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally { setBusyId(null); }
  };

  const handleResume = async (leadId) => {
    setBusyId(leadId);
    try {
      await apiFetch(`/api/agentic-crm/nurture/sequences/${encodeURIComponent(leadId)}/resume`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally { setBusyId(null); }
  };

  const handleDryRun = async (leadId) => {
    setDryRunModal({ leadId, loading: true, result: null, error: null });
    try {
      const result = await apiFetch(
        `/api/agentic-crm/nurture/sequences/${encodeURIComponent(leadId)}/dry-run`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      setDryRunModal({ leadId, loading: false, result, error: null });
    } catch (e) {
      setDryRunModal({ leadId, loading: false, result: null, error: e.message });
    }
  };

  const handleToggle = async (newTier) => {
    setToggleModal({ tier: newTier, submitting: true });
    try {
      await apiFetch('/api/superadmin/agentic-crm/nurture/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, tier: newTier }),
      });
      setCurrentTier(newTier);
      setToggleModal(null);
      await load();
    } catch (e) {
      setError(e.message);
      setToggleModal(null);
    }
  };

  const filterButtons = useMemo(() => [
    { k: 'active',    label: 'Activas' },
    { k: 'paused',    label: 'Pausadas' },
    { k: 'completed', label: 'Completadas' },
    { k: 'all',       label: 'Todas' },
  ], []);

  return (
    <div data-testid="nurture-intelligent-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--cream-3)', fontWeight: 700,
          }}>
            W4.6 Y.3E · Nurture Intelligent
          </div>
          <div style={{
            fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--cream)',
          }}>
            Secuencias personalizadas con AI
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {currentTier ? (
            <Pill
              label={`Tier · ${currentTier.toUpperCase()}`}
              color={currentTier === 'off' ? '#94A3B8' : '#10B981'}
              testid="nurture-current-tier"
            />
          ) : null}
          <PillButton
            onClick={() => setToggleModal({ tier: currentTier === 'off' ? 'T1' : 'off' })}
            testid="nurture-toggle-btn"
            Icon={Settings}
          >
            {currentTier === 'off' ? 'Activar' : 'Desactivar'}
          </PillButton>
          <PillButton
            onClick={load}
            disabled={loading}
            testid="nurture-refresh-btn"
            Icon={loading ? Loader2 : RefreshCw}
          >
            Refrescar
          </PillButton>
        </div>
      </div>

      {error ? (
        <div
          data-testid="nurture-error"
          style={{
            padding: 10,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.32)',
            borderRadius: 12, color: '#FCA5A5',
            fontFamily: 'DM Sans', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <AlertCircle size={12} /> {error}
        </div>
      ) : null}

      {/* Stats */}
      {stats ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatCard
            label="Activas"
            value={stats.active || 0}
            sub={`${stats.sequences_total || 0} total / 30d`}
            testid="nurture-stat-active"
          />
          <StatCard
            label="Completadas 30d"
            value={stats.completed || 0}
            sub={`${stats.paused || 0} pausadas`}
            testid="nurture-stat-completed"
          />
          <StatCard
            label="Open rate"
            value={`${stats.open_rate || 0}%`}
            sub={`${stats.sent_touches || 0} touches enviados`}
            testid="nurture-stat-open"
          />
          <StatCard
            label="Reply rate"
            value={`${stats.reply_rate || 0}%`}
            sub={`${stats.replied || 0} respuestas`}
            testid="nurture-stat-reply"
          />
          <StatCard
            label="Conversión"
            value={`${stats.conversion_pct || 0}%`}
            sub="closed_won / sequences"
            testid="nurture-stat-conv"
          />
        </div>
      ) : null}

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {filterButtons.map((opt) => (
          <button
            key={opt.k}
            data-testid={`nurture-filter-${opt.k}`}
            onClick={() => setStatusFilter(opt.k)}
            className="rounded-full"
            style={{
              padding: '4px 10px', borderRadius: 9999, fontSize: 11,
              fontFamily: 'DM Sans', fontWeight: 600,
              background: statusFilter === opt.k ? 'rgba(var(--theme-rgb),0.18)' : 'transparent',
              color: statusFilter === opt.k ? '#A5B4FC' : 'var(--cream-3)',
              border: `1px solid ${statusFilter === opt.k ? 'rgba(var(--theme-rgb),0.4)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Sequences table */}
      {loading && sequences.length === 0 ? (
        <div style={{
          padding: 32, textAlign: 'center', color: 'var(--cream-3)',
          fontFamily: 'DM Sans', fontSize: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Loader2 size={14} className="animate-spin" /> Cargando secuencias…
        </div>
      ) : null}

      {!loading && sequences.length === 0 ? (
        <div
          data-testid="nurture-empty"
          style={{
            padding: 24, textAlign: 'center',
            fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)',
          }}
        >
          Sin secuencias para este filtro. Activa el tier T1 y espera al próximo cron 04:15 MX
          o lanza un dry-run para previsualizar.
        </div>
      ) : null}

      {sequences.map((s) => {
        const seqType = SEQ_TYPE_META[s.sequence_type] || { label: s.sequence_type, color: '#94A3B8' };
        const stMeta = STATUS_META[s.status] || { label: s.status, color: '#94A3B8' };
        const layer = LAYER_META[s.layer_used] || LAYER_META.heuristic;
        const isActive = s.status === 'active';
        const isPaused = s.status === 'paused';
        return (
          <div
            key={s.sequence_id}
            data-testid={`nurture-row-${s.lead_id}`}
            style={{
              padding: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 10, flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>
                <Pill label={seqType.label} color={seqType.color} />
                <Pill label={stMeta.label} color={stMeta.color} />
                <Pill label={layer.label} color={layer.color} Icon={layer.Icon} />
                <Pill
                  label={`${s.current_step}/${s.total_steps}`}
                  color="#94A3B8"
                  testid={`nurture-progress-${s.lead_id}`}
                />
              </div>
              <div style={{
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5,
                color: 'var(--cream)',
              }}>
                {s.lead_id}
              </div>
              <div style={{
                fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2,
              }}>
                Próximo touch · {fmtDateTime(s.next_touch_scheduled_at)}
                {s.last_touch_at ? ` · último ${fmtDateTime(s.last_touch_at)}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <PillButton
                onClick={() => handleDryRun(s.lead_id)}
                disabled={busyId === s.lead_id}
                testid={`nurture-dryrun-btn-${s.lead_id}`}
                variant="ghost"
                Icon={Eye}
              >
                Preview
              </PillButton>
              {isActive ? (
                <PillButton
                  onClick={() => handlePause(s.lead_id)}
                  disabled={busyId === s.lead_id}
                  testid={`nurture-pause-btn-${s.lead_id}`}
                  variant="warn"
                  Icon={Pause}
                >
                  Pausar
                </PillButton>
              ) : null}
              {isPaused ? (
                <PillButton
                  onClick={() => handleResume(s.lead_id)}
                  disabled={busyId === s.lead_id}
                  testid={`nurture-resume-btn-${s.lead_id}`}
                  variant="success"
                  Icon={Play}
                >
                  Reactivar
                </PillButton>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* Dry-run modal */}
      {dryRunModal ? (
        <div
          data-testid="nurture-dryrun-modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setDryRunModal(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL,
            background: 'rgba(6,8,15,0.72)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            data-testid="nurture-dryrun-modal"
            style={{
              maxWidth: 720, width: '100%', maxHeight: '85vh', overflow: 'auto',
              background: 'rgba(13,16,23,0.96)',
              border: '1px solid rgba(240,235,224,0.18)',
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              borderRadius: 16, padding: 20,
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
            }}>
              <div>
                <div style={{
                  fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: 'var(--cream-3)', fontWeight: 700,
                }}>
                  Dry-run preview · {dryRunModal.leadId}
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--cream)',
                }}>
                  Sequence preview (sin envío)
                </div>
              </div>
              <button
                data-testid="nurture-dryrun-close"
                onClick={() => setDryRunModal(null)}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--cream-3)',
                  cursor: 'pointer', padding: 4,
                }}
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            {dryRunModal.loading ? (
              <div style={{
                padding: 32, textAlign: 'center', color: 'var(--cream-3)',
                fontFamily: 'DM Sans', fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Loader2 size={14} className="animate-spin" /> Generando preview…
              </div>
            ) : null}

            {dryRunModal.error ? (
              <div style={{
                padding: 10,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.32)',
                borderRadius: 12, color: '#FCA5A5',
                fontFamily: 'DM Sans', fontSize: 12,
              }}>
                {dryRunModal.error}
              </div>
            ) : null}

            {dryRunModal.result ? (
              <div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  <Pill
                    label={SEQ_TYPE_META[dryRunModal.result.sequence_type]?.label || dryRunModal.result.sequence_type}
                    color={SEQ_TYPE_META[dryRunModal.result.sequence_type]?.color || '#94A3B8'}
                    testid="nurture-preview-type"
                  />
                  <Pill
                    label={`${dryRunModal.result.total_steps} touches`}
                    color="#94A3B8"
                  />
                  <Pill
                    label={LAYER_META[dryRunModal.result.layer_used]?.label || dryRunModal.result.layer_used}
                    color={LAYER_META[dryRunModal.result.layer_used]?.color || '#94A3B8'}
                    Icon={LAYER_META[dryRunModal.result.layer_used]?.Icon || Zap}
                  />
                </div>
                {(dryRunModal.result.touches || []).map((t, i) => (
                  <div
                    key={i}
                    data-testid={`nurture-preview-touch-${i + 1}`}
                    style={{
                      padding: 12, marginBottom: 8,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <Pill label={`Step ${t.step || i + 1}`} color="var(--theme)" />
                      <Pill label={CHANNEL_LABEL[t.channel] || t.channel} color="#A5B4FC" />
                      <Pill label={`+${t.offset_hours || 0}h`} color="#94A3B8" />
                    </div>
                    {t.subject ? (
                      <div style={{
                        fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                        color: 'var(--cream)', marginBottom: 4,
                      }}>
                        {t.subject}
                      </div>
                    ) : null}
                    <div style={{
                      fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)',
                      whiteSpace: 'pre-wrap', lineHeight: 1.5,
                    }}>
                      {t.body}
                    </div>
                    {t.cta ? (
                      <div style={{
                        marginTop: 6, fontSize: 11.5, color: '#A5B4FC', fontWeight: 700,
                      }}>
                        CTA · {t.cta}
                      </div>
                    ) : null}
                    {t.rationale ? (
                      <div style={{
                        marginTop: 4, fontSize: 10.5, color: 'var(--cream-3)', fontStyle: 'italic',
                      }}>
                        {t.rationale}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Toggle modal */}
      {toggleModal ? (
        <div
          data-testid="nurture-toggle-modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget && !toggleModal.submitting) setToggleModal(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL,
            background: 'rgba(6,8,15,0.72)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            data-testid="nurture-toggle-modal"
            style={{
              maxWidth: 480, width: '100%',
              background: 'rgba(13,16,23,0.96)',
              border: '1px solid rgba(240,235,224,0.18)',
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              borderRadius: 16, padding: 20,
            }}
          >
            <div style={{
              fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--cream)', marginBottom: 8,
            }}>
              Confirmar cambio de tier · Nurture Intelligent
            </div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', marginBottom: 14,
              lineHeight: 1.6,
            }}>
              {toggleModal.tier === 'off'
                ? `Vas a desactivar Nurture Intelligent para ${orgId}. La org volverá al cron template-based legacy.`
                : `Vas a activar tier ${toggleModal.tier} para ${orgId}. El próximo cron 04:15 MX generará secuencias personalizadas.`}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <PillButton
                onClick={() => setToggleModal(null)}
                disabled={toggleModal.submitting}
                variant="ghost"
                testid="nurture-toggle-cancel"
              >
                Cancelar
              </PillButton>
              <PillButton
                onClick={() => handleToggle(toggleModal.tier)}
                disabled={toggleModal.submitting}
                variant="primary"
                testid="nurture-toggle-confirm"
              >
                {toggleModal.submitting ? 'Aplicando…' :
                  (toggleModal.tier === 'off' ? 'Desactivar' : `Activar ${toggleModal.tier}`)}
              </PillButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

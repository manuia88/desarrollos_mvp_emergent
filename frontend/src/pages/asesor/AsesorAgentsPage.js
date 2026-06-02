/**
 * P3.A · AsesorAgentsPage — "Tus Agentes IA".
 * Cierra el ciclo de P2: los 5 agentes invisibles ahora tienen UI. Consume endpoints P2
 * (getAgents · getAgentWorkforceStatus · runAgentsNow · agent_workforce diff=0) + reusa
 * getDashboard para el log de acciones recientes (command_center_actions · source_agent).
 * AdvisorLayout (sidebar presente · lección F1) · Aurora · es-MX · skeleton · empty state.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bot, UserPlus, MessageCircle, CheckCircle2, GraduationCap, BarChart3,
  Zap, Clock, Inbox, ChevronRight,
} from 'lucide-react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import PremiumCard from '../../components/asesor/design/PremiumCard'; // B7 · diseño premium
import AutopilotPanel from '../../components/asesor/AutopilotPanel';
import {
  getAgents, getAgentWorkforceStatus, runAgentsNow, getDashboard,
} from '../../api/advisor';

const AGENT_ICONS = {
  prospector: UserPlus,
  nurturer: MessageCircle,
  closer: CheckCircle2,
  coach: GraduationCap,
  analyst: BarChart3,
};

const fmtHora = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch (_e) {
    return null;
  }
};

const SYNTHETIC_PREFIXES = ['cita_', 'tarea_', 'lead_hot_', 'lead_cold_'];
const isAgentAction = (a) => !!a?.source_agent && !SYNTHETIC_PREFIXES.some((p) => (a.id || '').startsWith(p));

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6" data-testid="agents-skeleton">
      <div className="h-8 w-56 rounded-lg bg-[var(--surface-2)]" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-40 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] animate-pulse" />)}
      </div>
    </div>
  );
}

export default function AsesorAgentsPage({ user, onLogout }) {
  const { t } = useTranslation('agents_workforce');
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [status, setStatus] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const [ag, st, dash] = await Promise.all([
      getAgents().catch(() => ({ agents: [] })),
      getAgentWorkforceStatus().catch(() => null),
      getDashboard().catch(() => ({})),
    ]);
    setAgents(Array.isArray(ag?.agents) ? ag.agents : []);
    setStatus(st);
    setRecent((dash?.action_queue || []).filter(isAgentAction).slice(0, 12));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { await load(); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [load]);

  const runAll = useCallback(async (agentName) => {
    if (running) return;
    setRunning(true);
    setMsg(null);
    try {
      // E6 · si viene un nombre de agente (string), corre SOLO ese; si no, todos.
      const res = await runAgentsNow(typeof agentName === 'string' ? agentName : undefined);
      const n = res?.total_actions ?? 0;
      setMsg({ kind: 'ok', text: n > 0 ? t('page.run_success', { count: n }) : t('page.run_none') });
      await load();
    } catch (e) {
      if (e?.status === 429) setMsg({ kind: 'warn', text: t('page.rate_limited') });
      else setMsg({ kind: 'err', text: t('page.run_error') });
    } finally {
      setRunning(false);
    }
  }, [running, t, load]);

  const lastRunHora = fmtHora(status?.last_run?.ran_at);
  const byAgent = status?.last_run?.by_agent || {};

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div className="max-w-[1100px] mx-auto" data-testid="asesor-agents-page">
        {loading ? <Skeleton /> : (
          <>
            {/* Header */}
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[linear-gradient(135deg,#6366F1,#EC4899)] text-white shrink-0">
                  <Bot size={22} />
                </span>
                <div>
                  <h1 className="text-[var(--cream)] text-2xl font-bold tracking-tight">{t('page.title')}</h1>
                  <p className="text-[var(--cream-3)] text-sm mt-1 max-w-md">{t('page.subtitle')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => runAll()}
                disabled={running}
                data-testid="run-all-agents"
                className="flex items-center gap-2 px-4 h-10 rounded-full text-sm font-semibold text-white bg-[linear-gradient(90deg,#6366F1,#EC4899)] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Zap size={16} />
                {running ? t('page.running') : t('page.run_all')}
              </button>
            </div>

            {msg && (
              <div
                data-testid="run-msg"
                className={`mb-5 px-4 py-2.5 rounded-xl text-sm border ${
                  msg.kind === 'ok'
                    ? 'text-emerald-300 bg-[rgba(16,185,129,0.1)] border-[rgba(16,185,129,0.25)]'
                    : msg.kind === 'warn'
                    ? 'text-amber-300 bg-[rgba(245,158,11,0.1)] border-[rgba(245,158,11,0.25)]'
                    : 'text-rose-300 bg-[rgba(244,63,94,0.1)] border-[rgba(244,63,94,0.25)]'
                }`}
              >
                {msg.text}
              </div>
            )}

            {/* 5 tarjetas de agentes */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
              {agents.map((a) => {
                const Ico = AGENT_ICONS[a.name] || Bot;
                const generated = byAgent[a.name] ?? 0;
                return (
                  <PremiumCard
                    key={a.name}
                    hover
                    data-testid={`agent-card-${a.name}`}
                    className="flex flex-col"
                    style={{ padding: 18, borderRadius: 18 }}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--theme), var(--theme-3))', color: '#fff', boxShadow: '0 6px 16px rgba(var(--theme-rgb),0.35)', flexShrink: 0 }}>
                        <Ico size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--theme-2)' }}>
                          {t(`agents.${a.name}.role`, a.name)}
                        </div>
                        <p className="truncate" style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 17, color: 'var(--cream)', margin: '2px 0 0', letterSpacing: '-0.01em' }}>
                          {a.label || a.name}
                        </p>
                      </div>
                      <span title={a.available ? 'Activo' : 'Inactivo'} style={{ width: 8, height: 8, borderRadius: '50%', background: a.available ? '#22C55E' : 'var(--cream-3)', boxShadow: a.available ? '0 0 0 3px rgba(34,197,94,0.18)' : 'none', flexShrink: 0, marginTop: 6 }} />
                    </div>
                    <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.55, margin: '0 0 16px', flex: 1, position: 'relative' }}>
                      {t(`agents.${a.name}.desc`, '')}
                    </p>
                    <div className="flex items-center justify-between gap-2" style={{ position: 'relative' }}>
                      {a.pending_actions > 0 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.22)', color: 'var(--theme-2)', fontSize: 11.5, fontWeight: 700 }}>
                          {t('page.pending', { count: a.pending_actions })}
                        </span>
                      ) : generated > 0 ? (
                        <span style={{ fontSize: 11.5, color: 'var(--cream-3)', fontWeight: 600 }}>{t('page.generated', { count: generated })}</span>
                      ) : (
                        <span style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>Sin pendientes</span>
                      )}
                      {a.available ? (
                        <button
                          type="button"
                          onClick={() => runAll(a.name)}
                          disabled={running}
                          data-testid={`run-agent-${a.name}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 999, border: 'none', cursor: running ? 'default' : 'pointer', background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 700, boxShadow: '0 4px 14px rgba(var(--theme-rgb),0.32)', opacity: running ? 0.6 : 1 }}
                        >
                          <Zap size={13} /> {t('page.run_agent')}
                        </button>
                      ) : (
                        <span style={{ padding: '8px 14px', borderRadius: 999, border: '1px dashed var(--border-2)', color: 'var(--cream-3)', fontSize: 12 }}>
                          {t('page.unavailable')}
                        </span>
                      )}
                    </div>
                  </PremiumCard>
                );
              })}
            </div>

            {/* Último run */}
            <div className="mb-5 flex items-center gap-2 text-[var(--cream-3)] text-xs">
              <Clock size={13} />
              {lastRunHora ? `${t('page.last_run')}: ${lastRunHora}` : t('page.never_run')}
            </div>

            {/* P5.A · Modo Piloto · el agente EJECUTA acciones aprobadas (guardrails) */}
            <AutopilotPanel />

            {/* Log de acciones recientes generadas por agentes */}
            <section>
              <h2 className="text-[var(--cream)] text-sm font-semibold uppercase tracking-wide mb-3">
                {t('page.recent_log_title')}
              </h2>
              {recent.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-10 rounded-2xl border border-dashed border-[var(--border)]" data-testid="agents-log-empty">
                  <Inbox size={26} className="text-[var(--cream-3)] mb-2" />
                  <p className="text-[var(--cream-3)] text-xs max-w-xs">{t('page.recent_log_empty')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recent.map((a, i) => (
                    <button
                      key={`${a.id ?? 'q'}-${i}`}
                      type="button"
                      onClick={() => navigate(a.lead_id ? `/asesor/contactos/${a.lead_id}` : '/asesor')}
                      data-testid={`agent-log-${a.id ?? i}`}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors text-left"
                    >
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-[var(--theme)] bg-[rgba(var(--theme-rgb),0.15)] shrink-0">
                        🤖 {a.source_agent}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[var(--cream)] text-sm font-medium truncate">{a.title}</span>
                        {a.subtitle && <span className="block text-[var(--cream-3)] text-xs truncate">{a.subtitle}</span>}
                      </span>
                      <ChevronRight size={15} className="text-[var(--cream-3)] shrink-0" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => navigate('/asesor')}
                    className="text-[var(--cream-2)] text-xs font-medium hover:text-[var(--cream)] transition-colors mt-1"
                  >
                    {t('page.view_in_queue')}
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AdvisorLayout>
  );
}

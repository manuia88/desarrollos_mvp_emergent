/**
 * P1 · AsesorCommandCenter — UPGRADE visual del dashboard asesor (command-center look).
 * Reusa /api/asesor/dashboard (extendido con action_queue + kpis_trend), BuyerScoreBadge
 * y FloatingQuickActions. NO recrea backend ni componentes existentes.
 * Activado por feature flag REACT_APP_COMMAND_CENTER='true' (else AsesorDashboard V1).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DollarSign, Flame, CheckCircle2, Wallet, Trophy, FileText, Users,
  UserPlus, ListPlus, CalendarPlus, Sparkles, Inbox, ChevronDown, ChevronRight,
} from 'lucide-react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import BuyerScoreBadge from '../../components/asesor/BuyerScoreBadge';
import ActionCard from '../../components/asesor/command_center/ActionCard';
import KpiCard from '../../components/asesor/command_center/KpiCard';
import LeadInlinePreview from '../../components/asesor/command_center/LeadInlinePreview';
import AgentTeamCard from '../../components/asesor/command_center/AgentTeamCard';
import {
  getDashboard, getLeaderboard, completeAction, dismissAction, archiveAction,
  restoreAction, getArchivedActions, generateBriefing, getCloseProbability,
} from '../../api/advisor';

// Pill color por probabilidad de cierre (reusa paleta aurora).
const probPill = (p) => {
  if (p == null) return null;
  if (p >= 70) return 'text-emerald-300 bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.25)]';
  if (p >= 40) return 'text-amber-300 bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.25)]';
  return 'text-[var(--cream-3)] bg-[rgba(240,235,224,0.06)] border-[rgba(240,235,224,0.12)]';
};

// Ids sintéticos (heurística del dashboard) vs acciones reales de agentes (collection).

const fmtMXN = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v.toLocaleString('es-MX')}`;
};

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" data-testid="command-center-skeleton">
      <div className="h-8 w-64 rounded-lg bg-[rgba(240,235,224,0.08)]" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-[rgba(240,235,224,0.06)]" />)}
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-[rgba(240,235,224,0.06)]" />)}
      </div>
    </div>
  );
}

export default function AsesorCommandCenter({ user, onLogout }) {
  const { t } = useTranslation('command_center');
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState([]);
  const [hoverLead, setHoverLead] = useState(null);
  const [closeProbs, setCloseProbs] = useState({});
  // Colapsar "Prioridades de hoy" · recuerda preferencia (localStorage)
  const [queueCollapsed, setQueueCollapsed] = useState(() => {
    try { return localStorage.getItem('dmx_cc_queue_collapsed') === '1'; } catch { return false; }
  });
  const toggleQueue = useCallback(() => {
    setQueueCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('dmx_cc_queue_collapsed', next ? '1' : '0'); } catch { /* no-op */ }
      return next;
    });
  }, []);
  // Archivadas · ver/recuperar
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState([]);
  const toggleArchived = useCallback(() => {
    setShowArchived((s) => {
      const next = !s;
      if (next) getArchivedActions().then((r) => setArchived(r?.archived || [])).catch(() => setArchived([]));
      return next;
    });
  }, []);
  const onRestore = useCallback((action) => {
    setArchived((arr) => arr.filter((a) => a.id !== action.id));
    setQueue((q) => [action, ...q]);  // vuelve a la cola visualmente
    restoreAction(action.id).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [dash, lb] = await Promise.all([
          getDashboard(),
          getLeaderboard().catch(() => []),
        ]);
        if (!alive) return;
        setData(dash);
        setQueue(dash.action_queue || []);
        setLeaders(Array.isArray(lb) ? lb.slice(0, 5) : []);

        // Briefing auto: si no hay briefing hoy, genéralo solo (reusa daily_briefing · FAIL-OPEN).
        if (!dash.briefing) {
          generateBriefing()
            .then((b) => { if (alive && b) setData((prev) => ({ ...(prev || {}), briefing: b })); })
            .catch(() => {});
        }

        // Close prob por lead reciente (lazy · reusa close_probability · FAIL-OPEN por lead).
        const leads = (dash.leads_recientes || []).filter((l) => l?.id);
        if (leads.length) {
          Promise.all(leads.map((l) =>
            getCloseProbability(l.id)
              .then((r) => [l.id, r?.prob])
              .catch(() => [l.id, null]),
          )).then((pairs) => {
            if (!alive) return;
            const map = {};
            pairs.forEach(([id, prob]) => { if (prob != null) map[id] = prob; });
            setCloseProbs(map);
          });
        }
      } catch (_e) {
        if (alive) setData({});
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const goLead = useCallback((leadId) => {
    navigate(leadId ? `/asesor/contactos/${leadId}` : '/asesor/contactos');
  }, [navigate]);

  const removeFromQueue = useCallback((id) => {
    setQueue((q) => q.filter((a) => a.id !== id));
  }, []);

  const onCTA = useCallback((cta, action) => {
    switch (cta) {
      case 'llamar':
      case 'whatsapp':
      case 'ver_lead':
        goLead(action.lead_id);
        break;
      // Persistimos SIEMPRE (agente o sintética) enviando la card como payload ·
      // así sintéticas no reaparecen (supresión) + archivadas son recuperables.
      case 'completar':
        removeFromQueue(action.id);
        completeAction(action.id, action).catch(() => {});
        break;
      case 'descartar':
        removeFromQueue(action.id);
        dismissAction(action.id, action).catch(() => {});
        break;
      case 'archivar':
        removeFromQueue(action.id);
        archiveAction(action.id, action).catch(() => {});
        break;
      default:
        goLead(action.lead_id);
    }
  }, [goLead, removeFromQueue]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return t('hero.greeting_morning');
    if (h < 19) return t('hero.greeting_afternoon');
    return t('hero.greeting_evening');
  })();

  const quickActions = [
    { label: t('quick_actions.new_lead'), icon: UserPlus, onClick: () => navigate('/asesor/contactos'), primary: true },
    { label: t('quick_actions.new_task'), icon: ListPlus, onClick: () => navigate('/asesor/tareas') },
    { label: t('quick_actions.new_cita'), icon: CalendarPlus, onClick: () => navigate('/asesor/citas') },
    { label: t('quick_actions.open_studio'), icon: Sparkles, onClick: () => navigate('/asesor/studio') },
  ];

  const kpis = data?.kpis_trend || {};
  const firstName = (user?.name || '').split(' ')[0] || '';
  const actionCount = queue.length;

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div className="max-w-[1100px] mx-auto" data-testid="asesor-command-center">
        {loading ? <Skeleton /> : (
          <>
            {/* Hero · greeting + quick actions inline (fix: NO floating · evita
                encimar con botones globales AI/Argumentario/Reportar) */}
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-[var(--cream)] text-2xl font-bold tracking-tight">
                  {greeting}{firstName ? `, ${firstName}` : ''}
                </h1>
                <p className="text-[var(--cream-3)] text-sm mt-1">
                  {actionCount > 0
                    ? t('hero.actions_today', { count: actionCount })
                    : t('hero.all_clear')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {quickActions.map((qa, i) => {
                  const Ico = qa.icon;
                  return (
                    <button
                      key={i}
                      onClick={qa.onClick}
                      data-testid={`quick-action-${i}`}
                      className={`flex items-center gap-1.5 px-3 h-9 rounded-full text-sm font-medium transition-colors ${
                        qa.primary
                          ? 'text-white bg-[linear-gradient(90deg,#6366F1,#EC4899)] hover:opacity-90'
                          : 'text-[var(--cream)] bg-[rgba(240,235,224,0.06)] border border-[rgba(240,235,224,0.12)] hover:bg-[rgba(240,235,224,0.1)]'
                      }`}
                    >
                      {Ico ? <Ico size={15} /> : null}
                      {qa.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiCard label={t('kpi.pipeline')} value={fmtMXN(kpis.pipeline_mxn)} trendPct={kpis.pipeline_trend_pct ?? null}
                Icon={DollarSign} trendLabel={t('kpi.vs_week')} onClick={() => navigate('/asesor/operaciones')} />
              <KpiCard label={t('kpi.leads_calientes')} value={kpis.leads_calientes ?? 0} trendPct={kpis.leads_calientes_trend_pct ?? null}
                Icon={Flame} trendLabel={t('kpi.vs_week')} onClick={() => navigate('/asesor/contactos')} />
              <KpiCard label={t('kpi.cierres_mes')} value={kpis.cierres_mes ?? 0} trendPct={kpis.cierres_trend_pct ?? null}
                Icon={CheckCircle2} trendLabel={t('kpi.vs_week')} onClick={() => navigate('/asesor/operaciones')} />
              <KpiCard label={t('kpi.comisiones')} value={fmtMXN(kpis.comisiones_por_cobrar ?? data?.comisiones_por_cobrar)} trendPct={null}
                Icon={Wallet} onClick={() => navigate('/asesor/comisiones')} />
            </div>

            {/* P3.A · mini-resumen del equipo IA (consume /api/agent-workforce/status) */}
            <div className="mb-6">
              <AgentTeamCard />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Prioridades de hoy (col principal · colapsable) */}
              <section className="lg:col-span-2">
                <button
                  type="button"
                  onClick={toggleQueue}
                  data-testid="queue-toggle"
                  className="w-full flex items-center gap-2 mb-3 text-[var(--cream)] text-sm font-semibold uppercase tracking-wide hover:opacity-80 transition-opacity"
                  aria-expanded={!queueCollapsed}
                  aria-label={queueCollapsed ? t('queue.expand') : t('queue.collapse')}
                >
                  {queueCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  {t('queue.title')}
                  {actionCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[rgba(var(--theme-rgb),0.18)] text-[var(--theme)] text-[10px] font-bold normal-case">
                      {actionCount}
                    </span>
                  )}
                </button>
                {!queueCollapsed && (
                  queue.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-12 rounded-2xl border border-dashed border-[rgba(240,235,224,0.12)]" data-testid="queue-empty">
                      <Inbox size={28} className="text-[var(--cream-3)] mb-2" />
                      <p className="text-[var(--cream)] text-sm font-medium">{t('queue.empty_title')}</p>
                      <p className="text-[var(--cream-3)] text-xs mt-1 max-w-xs">{t('queue.empty_subtitle')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {queue.map((a) => <ActionCard key={a.id} action={a} onCTA={onCTA} t={t} />)}
                    </div>
                  )
                )}

                {/* Ver / recuperar archivadas */}
                {!queueCollapsed && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={toggleArchived}
                      data-testid="toggle-archived"
                      className="text-[var(--cream-3)] text-xs hover:text-[var(--cream)] transition-colors"
                    >
                      {showArchived ? t('queue.hide_archived') : t('queue.view_archived')}
                    </button>
                    {showArchived && (
                      <div className="mt-2 space-y-1.5" data-testid="archived-list">
                        {archived.length === 0 ? (
                          <p className="text-[var(--cream-3)] text-xs py-2">{t('queue.no_archived')}</p>
                        ) : archived.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(240,235,224,0.03)] border border-[rgba(240,235,224,0.06)]"
                          >
                            <span className="min-w-0 flex-1 text-[var(--cream-3)] text-xs truncate">{a.title}</span>
                            <button
                              type="button"
                              onClick={() => onRestore(a)}
                              data-testid={`restore-${a.id}`}
                              className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium text-[rgba(240,235,224,0.7)] hover:text-[var(--cream)] hover:bg-[rgba(240,235,224,0.08)] transition-colors"
                            >
                              {t('queue.restore')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Lateral: leads + performance + briefing */}
              <aside className="space-y-5">
                {/* Recent leads */}
                <div>
                  <h2 className="text-[var(--cream)] text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Users size={15} /> {t('panels.recent_leads')}
                  </h2>
                  <div className="space-y-1.5">
                    {(data?.leads_recientes || []).length === 0 && (
                      <p className="text-[var(--cream-3)] text-xs">{t('panels.no_leads')}</p>
                    )}
                    {(data?.leads_recientes || []).map((lead) => (
                      <div
                        key={lead.id}
                        className="relative"
                        onMouseEnter={() => setHoverLead(lead.id)}
                        onMouseLeave={() => setHoverLead(null)}
                      >
                        <button
                          type="button"
                          onClick={() => goLead(lead.id)}
                          data-testid={`recent-lead-${lead.id}`}
                          className="w-full flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-[rgba(240,235,224,0.06)] transition-colors text-left"
                        >
                          <span className="text-[var(--cream-2)] text-sm truncate">
                            {`${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Lead'}
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {closeProbs[lead.id] != null && (
                              <span
                                data-testid={`close-prob-${lead.id}`}
                                title={t('panels.close_prob_tooltip')}
                                className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${probPill(closeProbs[lead.id])}`}
                              >
                                {closeProbs[lead.id]}% {t('panels.close_prob_suffix')}
                              </span>
                            )}
                            <BuyerScoreBadge
                              score={lead.buyer_score?.value}
                              tier={lead.buyer_score?.tier}
                              delta={lead.buyer_score?.delta_pct}
                              size="sm"
                            />
                          </span>
                        </button>
                        {hoverLead === lead.id && <LeadInlinePreview lead={lead} />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Performance / ranking */}
                <div>
                  <h2 className="text-[var(--cream)] text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Trophy size={15} /> {t('panels.performance')}
                  </h2>
                  <div className="space-y-1.5">
                    {leaders.map((p, i) => (
                      <div key={p.user_id || i} className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(240,235,224,0.03)]">
                        <span className="w-5 text-center text-[var(--cream-3)] text-xs font-bold">{i + 1}</span>
                        <span className="text-[var(--cream-2)] text-sm truncate flex-1">{p.full_name || '—'}</span>
                        <span className="text-[var(--cream)] text-xs font-semibold">{p.score_elo ?? 1000}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Briefing */}
                <div>
                  <h2 className="text-[var(--cream)] text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
                    <FileText size={15} /> {t('panels.briefing')}
                  </h2>
                  {data?.briefing ? (
                    <button
                      type="button"
                      onClick={() => navigate('/asesor/briefings')}
                      data-testid="briefing-card"
                      className="w-full text-left p-3 rounded-xl bg-[rgba(var(--theme-rgb),0.08)] border border-[rgba(var(--theme-rgb),0.2)] hover:bg-[rgba(var(--theme-rgb),0.12)] transition-colors"
                    >
                      <p className="text-[var(--cream)] text-sm font-medium line-clamp-3">
                        {data.briefing.titulo || data.briefing.title || data.briefing.text || t('panels.briefing')}
                      </p>
                    </button>
                  ) : (
                    <p className="text-[var(--cream-3)] text-xs">{t('panels.no_briefing')}</p>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>

      {/* Quick actions ahora inline en el hero (fix: evita encimar con los
          botones flotantes globales AI/Argumentario/Reportar en esa esquina) */}
    </AdvisorLayout>
  );
}

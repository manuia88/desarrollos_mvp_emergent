/**
 * P3.A · AgentTeamCard — mini-resumen del equipo IA para el Inicio (Command Center).
 * Consume GET /api/agent-workforce/status (helper getAgentWorkforceStatus). Self-contained:
 * fetch propio · FAIL-OPEN (si falla → no rompe el dashboard, muestra estado vacío).
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bot, ChevronRight } from 'lucide-react';
import { getAgentWorkforceStatus } from '../../../api/advisor';

const fmtHora = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  } catch (_e) {
    return null;
  }
};

export default function AgentTeamCard() {
  const { t } = useTranslation('agents_workforce');
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getAgentWorkforceStatus()
      .then((s) => { if (alive) setStatus(s); })
      .catch(() => { if (alive) setStatus(null); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  if (!loaded) {
    return (
      <div className="h-[58px] rounded-2xl bg-[var(--surface-2)] animate-pulse" data-testid="agent-team-card-skeleton" />
    );
  }

  const pending = status?.total_pending ?? 0;
  const hora = fmtHora(status?.last_run?.ran_at);
  const countLabel = pending > 0
    ? t('team_card.actions', { count: pending })
    : t('team_card.no_actions');
  const runLabel = hora ? t('team_card.last_run', { time: hora }) : t('team_card.never_run');

  return (
    <button
      type="button"
      onClick={() => navigate('/portal/asesor/agents')}
      data-testid="agent-team-card"
      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-[rgba(var(--theme-rgb),0.08)] border border-[rgba(var(--theme-rgb),0.2)] hover:bg-[rgba(var(--theme-rgb),0.12)] transition-colors text-left"
    >
      <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-[linear-gradient(135deg,#6366F1,#EC4899)] text-white shrink-0">
        <Bot size={18} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[var(--cream)] text-sm font-semibold">{t('team_card.title')}</span>
        <span className="block text-[var(--cream-3)] text-xs truncate">
          {countLabel} · {runLabel}
        </span>
      </span>
      <span className="flex items-center gap-1 text-[var(--cream-2)] text-xs font-medium shrink-0">
        {t('team_card.view_detail')}
        <ChevronRight size={14} />
      </span>
    </button>
  );
}

/**
 * P1 · ActionCard — una acción priorizada de la cola del Command Center.
 * Props:
 *   action: {id, type, priority, title, subtitle, lead_id?, source_agent?, cta_actions[], icon_hint, color_hint}
 *   onCTA(ctaKey, action) — handler de cada botón (navegar / completar / descartar)
 *   t — fn i18n (namespace command_center)
 * NO crea status pill nuevo (los pills viven en BuyerScoreBadge · este card es la fila de acción).
 */
import React from 'react';
import {
  Calendar, Clock, Flame, User, Sparkles, Phone, MessageCircle, Eye, Check, X, Archive,
} from 'lucide-react';

const ICONS = {
  calendar: Calendar, clock: Clock, flame: Flame, user: User, sparkles: Sparkles,
};

// priority → color del punto (1 urgente rojo · 2 ámbar · 3 verde)
const PRIORITY_DOT = {
  1: 'bg-[#f87171]',
  2: 'bg-[#fbbf24]',
  3: 'bg-[#86efac]',
};

const CTA_ICONS = {
  llamar: Phone, whatsapp: MessageCircle, ver_lead: Eye, completar: Check,
  descartar: X, archivar: Archive,
};

export default function ActionCard({ action, onCTA, t }) {
  const Icon = ICONS[action.icon_hint] || Sparkles;
  const dot = PRIORITY_DOT[action.priority] || PRIORITY_DOT[3];

  return (
    <div
      data-testid={`action-card-${action.id}`}
      className="group flex items-start gap-3 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] hover:border-[rgba(var(--theme-rgb),0.35)] hover:bg-[rgba(var(--theme-rgb),0.06)] transition-all"
    >
      {/* icono tipo */}
      <div className="shrink-0 w-9 h-9 rounded-lg bg-[rgba(var(--theme-rgb),0.14)] flex items-center justify-center text-[var(--cream)]">
        <Icon size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden />
          <p className="text-[var(--cream)] text-sm font-semibold truncate">{action.title}</p>
          {action.source_agent && (
            <span
              data-testid="action-agent-badge"
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(99,102,241,0.18)] text-[#c7d2fe] text-[10px] font-medium shrink-0"
            >
              <Sparkles size={10} /> {action.source_agent}
            </span>
          )}
        </div>
        {action.subtitle && (
          <p className="text-[var(--cream-3)] text-xs mt-0.5 truncate">{action.subtitle}</p>
        )}

        {/* CTAs inline · +Archivar siempre disponible (guardar sin perder) */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {[...(action.cta_actions || []), 'archivar'].map((cta) => {
            const CtaIcon = CTA_ICONS[cta] || Eye;
            const danger = cta === 'descartar';
            return (
              <button
                key={cta}
                type="button"
                onClick={() => onCTA(cta, action)}
                data-testid={`action-cta-${cta}`}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                  ${danger
                    ? 'text-[var(--cream-3)] hover:text-[#f87171] hover:bg-[rgba(248,113,113,0.1)]'
                    : 'text-[var(--cream-2)] hover:text-[var(--cream)] hover:bg-[var(--surface-2)]'}`}
              >
                <CtaIcon size={13} /> {t(`cta.${cta}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

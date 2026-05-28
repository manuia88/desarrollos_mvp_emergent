/**
 * P1 · LeadInlinePreview — popover de vista rápida al hacer hover sobre un lead.
 * Props:
 *   lead: {id, first_name, last_name, temperatura, tipo, phones[], emails[], buyer_score?}
 * Reusa BuyerScoreBadge para el score (NO crea pill nuevo).
 */
import React from 'react';
import { Phone, Mail, Tag } from 'lucide-react';
import BuyerScoreBadge from '../BuyerScoreBadge';

export default function LeadInlinePreview({ lead }) {
  if (!lead) return null;
  const nombre = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Lead';
  const phone = (lead.phones || [])[0];
  const email = (lead.emails || [])[0];
  const bs = lead.buyer_score;

  return (
    <div
      data-testid={`lead-preview-${lead.id}`}
      className="absolute z-50 left-0 top-full mt-1 w-64 p-3 rounded-xl bg-[rgba(13,16,23,0.96)] border border-[rgba(255,255,255,0.16)] backdrop-blur-[24px] shadow-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[var(--cream)] text-sm font-semibold truncate">{nombre}</p>
        <BuyerScoreBadge score={bs?.value} tier={bs?.tier} delta={bs?.delta_pct} size="sm" />
      </div>
      {lead.tipo && (
        <div className="flex items-center gap-1 mt-1.5 text-[var(--cream-3)] text-xs">
          <Tag size={12} /> <span className="capitalize">{lead.tipo}</span>
          {lead.temperatura && <span className="capitalize">· {lead.temperatura}</span>}
        </div>
      )}
      {phone && (
        <div className="flex items-center gap-1.5 mt-1 text-[var(--cream-2)] text-xs">
          <Phone size={12} /> {phone}
        </div>
      )}
      {email && (
        <div className="flex items-center gap-1.5 mt-1 text-[var(--cream-2)] text-xs truncate">
          <Mail size={12} /> <span className="truncate">{email}</span>
        </div>
      )}
    </div>
  );
}

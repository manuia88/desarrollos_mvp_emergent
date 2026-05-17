/**
 * W5.ASR.5 Parte 2 — SourceBadge
 * Badge compacto color-coded con tooltip por source de captura.
 * Props:
 *   source: string
 *   date?: string (ISO)
 *   compact?: bool (solo icono, sin label)
 */
import React, { useState } from 'react';
import {
  Mail, Building2, Globe, User, Megaphone,
} from 'lucide-react';

const SOURCE_CONFIG = {
  email_alias:       { label: 'Email directo',   Icon: Mail,      bg: 'rgba(99,102,241,0.14)',  color: '#a5b4fc', border: 'rgba(99,102,241,0.30)' },
  portal_inmuebles24:{ label: 'Inmuebles24',      Icon: Building2, bg: 'rgba(244,63,94,0.12)',   color: '#fda4af', border: 'rgba(244,63,94,0.28)'  },
  portal_lamudi:     { label: 'Lamudi',           Icon: Building2, bg: 'rgba(245,158,11,0.13)',  color: '#fcd34d', border: 'rgba(245,158,11,0.30)' },
  fb_lead_ads:       { label: 'FB Lead Ads',      Icon: Megaphone, bg: 'rgba(59,130,246,0.13)',  color: '#93c5fd', border: 'rgba(59,130,246,0.28)' },
  landing:           { label: 'Landing page',     Icon: Globe,     bg: 'rgba(34,197,94,0.12)',   color: '#86efac', border: 'rgba(34,197,94,0.26)'  },
  manual:            { label: 'Manual',           Icon: User,      bg: 'rgba(100,116,139,0.14)', color: '#94a3b8', border: 'rgba(100,116,139,0.28)'},
};

const DEFAULT_CFG = { label: 'Desconocido', Icon: Globe, bg: 'rgba(100,116,139,0.10)', color: '#94a3b8', border: 'rgba(100,116,139,0.20)' };

function fmt(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch { return ''; }
}

export default function SourceBadge({ source, date, compact = false }) {
  const [tip, setTip] = useState(false);
  const cfg = SOURCE_CONFIG[source] || DEFAULT_CFG;
  const { Icon, label, bg, color, border } = cfg;
  const dateStr = fmt(date);

  return (
    <span
      data-testid={`source-badge-${source || 'unknown'}`}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: compact ? 0 : 4,
        padding: compact ? '2px 5px' : '3px 8px',
        borderRadius: 9999,
        background: bg, border: `1px solid ${border}`,
        color, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.02em', whiteSpace: 'nowrap',
        cursor: 'default', userSelect: 'none',
      }}>
      <Icon size={compact ? 9 : 10} />
      {!compact && <span>{label}</span>}

      {tip && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: '#1c1c1e', border: '1px solid rgba(240,235,224,0.12)',
          borderRadius: 6, padding: '5px 9px',
          color: '#e5e0d8', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 400,
          whiteSpace: 'nowrap', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          Capturado via {label}{dateStr ? ` · ${dateStr}` : ''}
        </div>
      )}
    </span>
  );
}

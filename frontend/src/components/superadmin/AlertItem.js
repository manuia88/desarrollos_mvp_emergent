// W1.3 SA1.2 — AlertItem
import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, Check } from 'lucide-react';

const SEV_CFG = {
  critical: { color: '#F87171', bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.32)', label: 'Crítica', Icon: AlertTriangle },
  warning:  { color: '#FACC15', bg: 'rgba(250,204,21,0.10)', bd: 'rgba(250,204,21,0.32)', label: 'Warning', Icon: AlertCircle },
  info:     { color: 'var(--theme)', bg: 'rgba(var(--theme-rgb),0.10)', bd: 'rgba(var(--theme-rgb),0.32)', label: 'Info', Icon: Info },
};

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return `hace ${sec}s`;
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

export default function AlertItem({ alert, onResolve }) {
  const cfg = SEV_CFG[alert.severity] || SEV_CFG.info;
  const Ic = cfg.Icon;
  const resolved = !!alert.resolved_at;
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try { await onResolve(alert.id); } finally { setBusy(false); }
  };

  return (
    <div data-testid={`alert-${alert.id}`}
      style={{
        padding: '12px 14px', borderRadius: 12,
        background: resolved ? 'rgba(255,255,255,0.02)' : cfg.bg,
        border: `1px solid ${resolved ? 'rgba(255,255,255,0.07)' : cfg.bd}`,
        display: 'flex', alignItems: 'flex-start', gap: 11, flexWrap: 'wrap',
        opacity: resolved ? 0.65 : 1,
      }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: cfg.bg, border: `1px solid ${cfg.bd}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Ic size={13} color={cfg.color} />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.bd}` }}>
            {cfg.label}
          </span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
            {alert.source}
          </span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.68)' }}>
            {fmtRel(alert.ts)}
          </span>
          {resolved && (
            <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700, background: 'rgba(74,222,128,0.10)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.28)' }}>
              Resuelta
            </span>
          )}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', lineHeight: 1.45 }}>
          {alert.message}
        </div>
      </div>
      {!resolved && onResolve && (
        <button data-testid={`resolve-${alert.id}`} onClick={handle} disabled={busy}
          style={{ padding: '6px 12px', borderRadius: 9999, background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.32)', color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Check size={11} /> Resolver
        </button>
      )}
    </div>
  );
}

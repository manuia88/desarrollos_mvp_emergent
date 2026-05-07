// W1.3 SA1.2 — CronCard
import React from 'react';
import { Clock, AlertTriangle, CheckCircle2, Loader } from 'lucide-react';

function fmtRel(iso) {
  if (!iso) return 'nunca';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return `hace ${sec}s`;
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

const STATUS_CFG = {
  ok:      { color: '#4ADE80', bg: 'rgba(74,222,128,0.10)', bd: 'rgba(74,222,128,0.32)', label: 'OK', Icon: CheckCircle2 },
  fail:    { color: '#F87171', bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.32)', label: 'Fail', Icon: AlertTriangle },
  stale:   { color: '#FACC15', bg: 'rgba(250,204,21,0.10)', bd: 'rgba(250,204,21,0.32)', label: 'Stale', Icon: AlertTriangle },
  pending: { color: 'rgba(240,235,224,0.50)', bg: 'rgba(255,255,255,0.04)', bd: 'rgba(255,255,255,0.12)', label: 'Pendiente', Icon: Loader },
};

export default function CronCard({ cron }) {
  const cfg = STATUS_CFG[cron.computed_status] || STATUS_CFG.pending;
  const Ic = cfg.Icon;
  return (
    <div data-testid={`cron-card-${cron.job_id}`}
      style={{
        padding: '14px 16px', borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${cron.computed_status === 'fail' || cron.computed_status === 'stale' ? cfg.bd : 'rgba(255,255,255,0.07)'}`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 140, fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
          {cron.job_id}
        </span>
        <span style={{
          padding: '2px 9px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700,
          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.bd}`,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Ic size={10} /> {cfg.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.50)' }}>
        <Clock size={10} /> {cron.schedule_expr || '—'}
      </div>
      <div style={{ display: 'flex', gap: 14, fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', flexWrap: 'wrap' }}>
        <span>Última: {fmtRel(cron.last_run_at)}</span>
        {cron.last_duration_ms != null && cron.last_duration_ms > 0 && (
          <span>{cron.last_duration_ms}ms</span>
        )}
        <span>Runs 24h: {cron.run_count_24h ?? 0}</span>
        {(cron.fail_count_24h ?? 0) > 0 && (
          <span style={{ color: '#F87171' }}>Fails: {cron.fail_count_24h}</span>
        )}
      </div>
      {cron.last_error && (
        <div style={{ padding: '6px 9px', borderRadius: 7, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)', fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: '#F87171', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cron.last_error}
        </div>
      )}
    </div>
  );
}

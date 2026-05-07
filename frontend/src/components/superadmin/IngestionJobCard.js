// W1.4 ZZ.1 — IngestionJobCard
import React from 'react';
import { ChevronRight, Clock, AlertCircle } from 'lucide-react';

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

const STATUS_CFG = {
  pending:    { label: 'Pendiente',  color: 'rgba(240,235,224,0.55)', bg: 'rgba(255,255,255,0.04)', bd: 'rgba(255,255,255,0.12)' },
  extracting: { label: 'Extrayendo', color: '#818CF8', bg: 'rgba(99,102,241,0.10)', bd: 'rgba(99,102,241,0.32)' },
  reviewing:  { label: 'Revisión',   color: '#FACC15', bg: 'rgba(250,204,21,0.10)', bd: 'rgba(250,204,21,0.32)' },
  completed:  { label: 'Completo',   color: '#4ADE80', bg: 'rgba(74,222,128,0.10)', bd: 'rgba(74,222,128,0.32)' },
  failed:     { label: 'Falló',      color: '#F87171', bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.32)' },
};

export default function IngestionJobCard({ job, onOpen }) {
  const cfg = STATUS_CFG[job.status] || STATUS_CFG.pending;
  const isLive = job.status === 'extracting' || job.status === 'pending';
  return (
    <div data-testid={`ingest-job-${job.id}`} onClick={() => onOpen(job)}
      style={{
        padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${isLive ? cfg.bd : 'rgba(255,255,255,0.07)'}`,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        transition: 'background 180ms, border-color 180ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--cream)', fontWeight: 700 }}>
            {job.id}
          </span>
          <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.bd}` }}>
            {cfg.label}
            {isLive && <span style={{ marginLeft: 4, animation: 'pulse 1.5s infinite' }}>·</span>}
          </span>
          {job.target_dev_org_id && (
            <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.50)', fontFamily: 'DM Mono, monospace' }}>
              {job.target_dev_org_id}
            </span>
          )}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.45)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.drive_folder_url}
        </div>
        <div style={{ display: 'flex', gap: 12, fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', flexWrap: 'wrap' }}>
          <span><Clock size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />{fmtRel(job.started_at)}</span>
          <span>Total: {job.items_total}</span>
          <span style={{ color: '#4ADE80' }}>Aprobados: {job.items_auto_approved}</span>
          <span style={{ color: '#FACC15' }}>Pendientes: {job.items_pending_review}</span>
          {job.items_rejected > 0 && <span style={{ color: 'rgba(240,235,224,0.45)' }}>Rechazados: {job.items_rejected}</span>}
          {job.items_failed > 0 && <span style={{ color: '#F87171' }}><AlertCircle size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />{job.items_failed}</span>}
        </div>
      </div>
      <ChevronRight size={14} color="rgba(240,235,224,0.30)" />
    </div>
  );
}

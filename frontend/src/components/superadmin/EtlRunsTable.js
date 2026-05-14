// W2.7 Phase Z.0 — ETL Runs Table (density-aware, expandable)
import React, { useState } from 'react';
import { ChevronDown, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

const STATUS_COLOR = {
  ok: { bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.30)',
        text: '#4ADE80', Icon: CheckCircle2 },
  partial: { bg: 'rgba(250,204,21,0.10)', border: 'rgba(250,204,21,0.30)',
             text: '#FACC15', Icon: AlertTriangle },
  failed: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.30)',
            text: '#F87171', Icon: AlertCircle },
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

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function Row({ run, density }) {
  const [expanded, setExpanded] = useState(false);
  const sty = STATUS_COLOR[run.status] || STATUS_COLOR.failed;
  const StatusIcon = sty.Icon;
  const dense = density === 'dense';
  const rowPad = dense ? '7px 12px' : '11px 14px';

  return (
    <>
      <tr data-testid={`etl-row-${run.id}`}
        onClick={() => setExpanded(e => !e)}
        style={{
          cursor: 'pointer',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          transition: 'background 180ms',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.05)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <td style={{ padding: rowPad, fontFamily: 'DM Mono, monospace',
          fontSize: dense ? 11 : 12, color: 'rgba(240,235,224,0.65)',
          whiteSpace: 'nowrap' }}>
          <div>{fmtDate(run.run_at)}</div>
          <div style={{ fontSize: 10, color: 'rgba(240, 235, 224, 0.68)' }}>{fmtRel(run.run_at)}</div>
        </td>
        <td style={{ padding: rowPad }}>
          <span style={{
            padding: '3px 9px', borderRadius: 9999,
            background: sty.bg, border: `1px solid ${sty.border}`,
            color: sty.text, fontFamily: 'DM Mono, monospace',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <StatusIcon size={10} /> {run.status}
          </span>
        </td>
        <td style={{ padding: rowPad, textAlign: 'right',
          fontFamily: 'DM Mono, monospace', fontSize: dense ? 11 : 12,
          color: 'rgba(240,235,224,0.75)' }}>
          {(run.duration_seconds || 0).toFixed(2)}s
        </td>
        <td style={{ padding: rowPad, textAlign: 'right',
          fontFamily: 'DM Mono, monospace', fontSize: dense ? 11 : 12,
          color: 'var(--cream)', fontWeight: 600 }}>
          {(run.zones_processed || 0).toLocaleString('es-MX')}
        </td>
        <td style={{ padding: rowPad, textAlign: 'right',
          fontFamily: 'DM Mono, monospace', fontSize: dense ? 11 : 12,
          color: (run.errors_total || 0) > 0 ? '#F87171' : 'rgba(240, 235, 224, 0.68)' }}>
          {run.errors_total || 0}
        </td>
        <td style={{ padding: rowPad, textAlign: 'center', width: 32 }}>
          <ChevronDown size={11} style={{
            color: 'rgba(240, 235, 224, 0.72)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 180ms',
          }} />
        </td>
      </tr>
      {expanded && (
        <tr data-testid={`etl-row-expanded-${run.id}`}>
          <td colSpan={6} style={{
            padding: '12px 16px', background: 'rgba(0,0,0,0.18)',
            fontFamily: 'DM Mono, monospace', fontSize: 11,
            color: 'rgba(240,235,224,0.65)',
          }}>
            <div style={{ marginBottom: 6 }}>
              <strong>ID:</strong> {run.id} · <strong>tipo:</strong> {run.run_type} · <strong>by:</strong> {run.triggered_by}
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong>KPIs computed:</strong> {run.kpis_computed} · <strong>target:</strong> {fmtDate(run.target_date)}
            </div>
            {run.errors && run.errors.length > 0 && (
              <div>
                <div style={{ marginBottom: 4, color: '#F87171' }}>Errores ({run.errors_total}):</div>
                <pre style={{
                  background: 'rgba(0,0,0,0.4)', padding: 8, borderRadius: 6,
                  fontSize: 10.5, color: 'rgba(240,235,224,0.55)',
                  maxHeight: 180, overflowY: 'auto', margin: 0,
                  whiteSpace: 'pre-wrap',
                }}>{(run.errors || []).join('\n')}</pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function EtlRunsTable({ items, density = 'compact' }) {
  if (!items || items.length === 0) {
    return (
      <div data-testid="etl-table-empty" style={{
        padding: 30, textAlign: 'center', borderRadius: 14,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.07)',
        fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240, 235, 224, 0.70)',
      }}>Sin runs ETL todavía. El cron corre diario a las 03:00 MX.</div>
    );
  }
  return (
    <div data-testid="etl-runs-table" style={{
      borderRadius: 14, overflow: 'hidden',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['Run', 'Estado', 'Duración', 'Zonas', 'Errores', ''].map((h, i) => (
                <th key={i} style={{
                  padding: '10px 12px', textAlign: i >= 2 && i < 5 ? 'right' : 'left',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5,
                  color: 'rgba(240,235,224,0.55)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <Row key={r.id} run={r} density={density} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

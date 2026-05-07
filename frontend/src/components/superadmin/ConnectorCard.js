// W2.1 SA2 — ConnectorCard
import React, { useState } from 'react';
import {
  Bot, Brain, MapPin, Map, Layers, FolderOpen, CalendarDays, Calendar,
  Mail, AlertCircle, Activity, Plug, RefreshCw, Repeat, Play,
} from 'lucide-react';

const ICONS = { Bot, Brain, MapPin, Map, Layers, FolderOpen, CalendarDays, Calendar, Mail, AlertCircle, Activity, Plug };

const STATUS_CFG = {
  ok:       { color: '#4ADE80', bg: 'rgba(74,222,128,0.12)',  bd: 'rgba(74,222,128,0.32)',  label: 'OK',       pulse: false },
  degraded: { color: '#FACC15', bg: 'rgba(250,204,21,0.12)',  bd: 'rgba(250,204,21,0.34)',  label: 'Degradado',pulse: false },
  failed:   { color: '#F87171', bg: 'rgba(239,68,68,0.12)',   bd: 'rgba(239,68,68,0.34)',   label: 'Falló',    pulse: true },
  stub:     { color: 'rgba(240,235,224,0.55)', bg: 'rgba(255,255,255,0.04)', bd: 'rgba(255,255,255,0.12)', label: 'Stub', pulse: false },
};

const CATEGORY_LABEL = {
  ai: 'IA', geo: 'Geo', email: 'Email', drive: 'Drive',
  observability: 'Observabilidad', calendar: 'Calendar', payments: 'Pagos',
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

export default function ConnectorCard({ conn, onTest, onRetry, onReplay, onOpen }) {
  const cfg = STATUS_CFG[conn.status] || STATUS_CFG.ok;
  const Icon = ICONS[conn.icon_key] || Plug;
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(null); // 'test' | 'retry' | null

  const stop = (e) => e.stopPropagation();

  const doTest = async (e) => { stop(e); setBusy('test'); try { await onTest(conn.id); } finally { setBusy(null); } };
  const doRetry = async (e) => { stop(e); setBusy('retry'); try { await onRetry(conn.id); } finally { setBusy(null); } };
  const doReplay = (e) => { stop(e); onReplay(conn); };

  return (
    <div
      data-testid={`connector-card-${conn.id}`}
      onClick={() => onOpen(conn)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 16, borderRadius: 14,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${hover ? 'rgba(99,102,241,0.30)' : 'rgba(255,255,255,0.08)'}`,
        display: 'flex', flexDirection: 'column', gap: 11,
        cursor: 'pointer',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 180ms, border-color 180ms, background 180ms',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(99,102,241,0.10)',
          border: '1px solid rgba(99,102,241,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#818CF8', flexShrink: 0,
        }}>
          <Icon size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conn.name}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 9.5, fontFamily: 'DM Sans', fontWeight: 600, background: 'rgba(255,255,255,0.04)', color: 'rgba(240,235,224,0.55)', border: '1px solid rgba(255,255,255,0.08)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {CATEGORY_LABEL[conn.category] || conn.category}
            </span>
            <span data-testid={`connector-status-${conn.id}`} style={{
              padding: '1px 8px', borderRadius: 9999, fontSize: 10,
              fontFamily: 'DM Sans', fontWeight: 700,
              background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.bd}`,
              animation: cfg.pulse ? 'connectorPulse 1.6s infinite' : undefined,
            }}>{cfg.label}</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.55)' }}>
        <span>Última: {fmtRel(conn.last_check_at)}</span>
        <span style={{ color: '#4ADE80' }}>OK 24h: {conn.success_count_24h || 0}</span>
        {(conn.fail_count_24h || 0) > 0 && (
          <span style={{ color: '#F87171' }}>Fails: {conn.fail_count_24h}</span>
        )}
        {conn.latency_avg_ms_24h > 0 && (
          <span>{Math.round(conn.latency_avg_ms_24h)}ms</span>
        )}
      </div>

      {conn.last_error && (
        <div style={{
          fontFamily: 'DM Mono, monospace', fontSize: 10.5,
          color: '#F87171',
          background: 'rgba(239,68,68,0.05)',
          border: '1px solid rgba(239,68,68,0.20)',
          padding: '5px 9px', borderRadius: 7, wordBreak: 'break-word',
          maxHeight: 36, overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {conn.last_error}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 'auto' }}>
        <button data-testid={`connector-test-${conn.id}`} onClick={doTest} disabled={busy === 'test' || conn.status === 'stub'}
          style={{
            padding: '5px 10px', borderRadius: 9999,
            background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)',
            color: '#818CF8', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
            cursor: busy === 'test' || conn.status === 'stub' ? 'not-allowed' : 'pointer',
            opacity: busy === 'test' || conn.status === 'stub' ? 0.55 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          <Play size={10} /> {busy === 'test' ? 'Probando…' : 'Probar'}
        </button>
        <button data-testid={`connector-retry-${conn.id}`} onClick={doRetry}
          disabled={!conn.supports_retry || busy === 'retry' || conn.status === 'stub'}
          style={{
            padding: '5px 10px', borderRadius: 9999,
            background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.28)',
            color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
            cursor: (!conn.supports_retry || busy === 'retry' || conn.status === 'stub') ? 'not-allowed' : 'pointer',
            opacity: (!conn.supports_retry || conn.status === 'stub') ? 0.45 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          <RefreshCw size={10} className={busy === 'retry' ? 'animate-spin' : ''} /> Reintentar
        </button>
        <button data-testid={`connector-replay-${conn.id}`} onClick={doReplay}
          disabled={!conn.supports_replay || conn.status === 'stub'}
          style={{
            padding: '5px 10px', borderRadius: 9999,
            background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.30)',
            color: '#EC4899', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
            cursor: (!conn.supports_replay || conn.status === 'stub') ? 'not-allowed' : 'pointer',
            opacity: (!conn.supports_replay || conn.status === 'stub') ? 0.45 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          <Repeat size={10} /> Replay
        </button>
      </div>

      {!conn.env_present && conn.status === 'stub' && conn.required_env?.length > 0 && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(250,204,21,0.85)' }}>
          Configurar credenciales: <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>{conn.required_env.join(', ')}</code>
        </div>
      )}
    </div>
  );
}

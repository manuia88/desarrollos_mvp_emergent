// W2.6 SA8 — Anomaly feed: list + resolve/dismiss/investigate inline
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, Info, ChevronDown, X, Check,
  Search as SearchIcon, Loader2,
} from 'lucide-react';
import { resolveAnomaly, dismissAnomaly } from '../../api/superadminFounderConsole';

const SEVERITY_COLOR = {
  critical: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.30)',
              text: '#F87171', Icon: AlertCircle },
  warning: { bg: 'rgba(250,204,21,0.08)', border: 'rgba(250,204,21,0.30)',
             text: '#FACC15', Icon: AlertTriangle },
  info: { bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.22)',
          text: '#818CF8', Icon: Info },
};

const SOURCE_LABEL = {
  ai_cost: 'Costos IA',
  tenant_activity: 'Actividad tenant',
  metrics_cube: 'Métricas',
  ingestion: 'Ingesta',
  conversion: 'Conversión',
};

const SOURCE_ROUTE = {
  ai_cost: '/superadmin/ai-cost',
  tenant_activity: '/superadmin/tenants',
  metrics_cube: '/superadmin/metrics-cube',
  ingestion: '/superadmin/bulk-ingest',
  conversion: '/superadmin/metrics-cube',
};

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return 'ahora';
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

function ActionModal({ title, placeholder, onConfirm, onClose, busy }) {
  const [text, setText] = useState('');
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)',
        backdropFilter: 'blur(8px)', zIndex: 1500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
      <div data-testid="anomaly-action-modal" style={{
        width: '100%', maxWidth: 480,
        background: 'rgba(13,17,28,0.97)',
        border: '1px solid rgba(99,102,241,0.30)',
        borderRadius: 14, padding: 22,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <h3 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
          color: 'var(--cream)', margin: 0,
        }}>{title}</h3>
        <textarea
          data-testid="anomaly-action-input"
          value={text} onChange={e => setText(e.target.value)}
          placeholder={placeholder} rows={3}
          style={{
            padding: '10px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5,
            outline: 'none', resize: 'vertical',
          }} />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 9999,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Cancelar</button>
          <button data-testid="anomaly-action-confirm"
            onClick={() => onConfirm(text)} disabled={busy}
            style={{
              padding: '9px 20px', borderRadius: 9999,
              background: 'linear-gradient(90deg,#6366F1,#EC4899)',
              border: 'none', color: '#fff', fontFamily: 'DM Sans',
              fontWeight: 700, fontSize: 12.5,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
            }}>{busy ? 'Guardando…' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  );
}

function AnomalyRow({ item, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const navigate = useNavigate();
  const sev = SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.info;
  const SevIcon = sev.Icon;

  const onResolve = async (note) => {
    setBusy(true);
    try { await resolveAnomaly(item.id, note); onChanged && onChanged(); setModal(null); }
    catch (e) { console.warn(e); }
    finally { setBusy(false); }
  };
  const onDismiss = async (reason) => {
    setBusy(true);
    try { await dismissAnomaly(item.id, reason); onChanged && onChanged(); setModal(null); }
    catch (e) { console.warn(e); }
    finally { setBusy(false); }
  };

  const evidenceObj = item.evidence || {};
  const reasoning = item.claude_reasoning || {};

  return (
    <div data-testid={`anomaly-row-${item.id}`} style={{
      padding: '12px 14px', borderRadius: 12,
      background: sev.bg, border: `1px solid ${sev.border}`,
      display: 'flex', flexDirection: 'column', gap: 8,
      transition: 'transform 180ms',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <SevIcon size={14} color={sev.text} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            marginBottom: 3,
          }}>
            <span style={{
              padding: '2px 9px', borderRadius: 9999, fontSize: 10,
              fontFamily: 'DM Mono, monospace', textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.06)', color: sev.text,
              fontWeight: 700, letterSpacing: '0.07em',
            }}>{item.severity}</span>
            <span style={{
              padding: '2px 9px', borderRadius: 9999, fontSize: 10,
              fontFamily: 'DM Mono, monospace',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(240,235,224,0.55)',
            }}>{SOURCE_LABEL[item.source] || item.source}</span>
            <span style={{
              fontFamily: 'DM Mono, monospace', fontSize: 10,
              color: 'rgba(240,235,224,0.45)',
            }}>{fmtRel(item.detected_at)}</span>
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)',
            lineHeight: 1.45,
          }}>{item.message}</div>
        </div>
        <button
          data-testid={`anomaly-expand-${item.id}`}
          onClick={() => setExpanded(e => !e)}
          style={{
            padding: 5, borderRadius: 9999, background: 'transparent',
            border: 'none', cursor: 'pointer',
            color: 'rgba(240,235,224,0.55)',
          }}>
          <ChevronDown size={13} style={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 180ms',
          }} />
        </button>
      </div>

      {expanded && (
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(0,0,0,0.18)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          {reasoning.summary && (
            <div style={{ marginBottom: 8 }}>
              <div style={{
                fontFamily: 'DM Mono, monospace', fontSize: 9.5,
                color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase',
                letterSpacing: '0.07em', marginBottom: 3,
              }}>Reasoning Claude Haiku ({((reasoning.confidence || 0) * 100).toFixed(0)}%)</div>
              <div style={{
                fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.85)',
                lineHeight: 1.5,
              }}>{reasoning.summary}</div>
              {reasoning.recommendation && (
                <div style={{
                  marginTop: 5, padding: '6px 9px', borderRadius: 8,
                  background: 'rgba(99,102,241,0.07)',
                  border: '1px solid rgba(99,102,241,0.20)',
                  fontFamily: 'DM Sans', fontSize: 11.5, color: '#818CF8',
                }}>→ {reasoning.recommendation}</div>
              )}
            </div>
          )}
          <div style={{
            fontFamily: 'DM Mono, monospace', fontSize: 10.5,
            color: 'rgba(240,235,224,0.55)',
            background: 'rgba(0,0,0,0.18)',
            padding: 8, borderRadius: 6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{JSON.stringify(evidenceObj, null, 2)}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          data-testid={`anomaly-investigate-${item.id}`}
          onClick={() => navigate(SOURCE_ROUTE[item.source] || '/superadmin')}
          style={{
            padding: '5px 12px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(240,235,224,0.65)',
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          <SearchIcon size={10} /> Investigar
        </button>
        <button
          data-testid={`anomaly-dismiss-${item.id}`}
          onClick={() => setModal('dismiss')}
          style={{
            padding: '5px 12px', borderRadius: 9999,
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.28)',
            color: '#F87171', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          <X size={10} /> Descartar
        </button>
        <button
          data-testid={`anomaly-resolve-${item.id}`}
          onClick={() => setModal('resolve')}
          style={{
            padding: '5px 12px', borderRadius: 9999,
            background: 'linear-gradient(90deg,#6366F1,#EC4899)',
            border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          <Check size={10} /> Resolver
        </button>
      </div>

      {modal === 'resolve' && (
        <ActionModal
          title="Resolver anomalía"
          placeholder="Nota de resolución (opcional)…"
          onConfirm={onResolve}
          onClose={() => setModal(null)}
          busy={busy}
        />
      )}
      {modal === 'dismiss' && (
        <ActionModal
          title="Descartar anomalía"
          placeholder="Razón (opcional)…"
          onConfirm={onDismiss}
          onClose={() => setModal(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

export default function AnomalyFeed({ items, onChanged, loading }) {
  if (loading) {
    return (
      <div data-testid="anomaly-feed-loading" style={{
        padding: 30, textAlign: 'center', fontFamily: 'DM Sans',
        fontSize: 13, color: 'rgba(240,235,224,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
        Cargando anomalías…
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <div data-testid="anomaly-feed-empty" style={{
        padding: 30, textAlign: 'center',
        borderRadius: 14, background: 'rgba(74,222,128,0.04)',
        border: '1px solid rgba(74,222,128,0.18)',
      }}>
        <Check size={20} color="#4ADE80" style={{ marginBottom: 6 }} />
        <div style={{
          fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
          color: '#4ADE80', marginBottom: 3,
        }}>Sin anomalías abiertas</div>
        <div style={{
          fontFamily: 'DM Sans', fontSize: 11.5,
          color: 'rgba(240,235,224,0.50)',
        }}>El cron corre diario a las 06:00 MX.</div>
      </div>
    );
  }
  return (
    <div data-testid="anomaly-feed" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(it => (
        <AnomalyRow key={it.id} item={it} onChanged={onChanged} />
      ))}
    </div>
  );
}

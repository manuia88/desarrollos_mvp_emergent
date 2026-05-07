// W1.4 ZZ.1 — ReviewQueueItem
import React, { useState } from 'react';
import { Check, X, GitMerge, MapPin, Layers, AlertTriangle } from 'lucide-react';

function fmtMxn(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default function ReviewQueueItem({ item, onApprove, onReject, onMerge }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [showMerge, setShowMerge] = useState(false);

  const e = item.extracted || {};
  const dedup = item.dedup || {};
  const matches = dedup.similar_matches || [];
  const score = dedup.score;
  const lowConf = e._low_confidence || e._stub;
  const priceMin = fmtMxn(e?.price_range?.min_mxn);
  const priceMax = fmtMxn(e?.price_range?.max_mxn);

  const doApprove = async () => { setBusy(true); try { await onApprove(item.id); } finally { setBusy(false); } };
  const doReject = async () => {
    if (reason.trim().length < 3) return;
    setBusy(true);
    try { await onReject(item.id, reason); setShowReject(false); setReason(''); }
    finally { setBusy(false); }
  };
  const doMerge = async (devId) => {
    setBusy(true);
    try { await onMerge(item.id, devId); setShowMerge(false); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid={`review-item-${item.id}`}
      style={{
        padding: '14px 16px', borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${lowConf ? 'rgba(250,204,21,0.30)' : 'rgba(255,255,255,0.07)'}`,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14.5, color: 'var(--cream)' }}>
              {e.project_name || item.project_folder_name || 'Sin nombre'}
            </span>
            {lowConf && (
              <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, background: 'rgba(250,204,21,0.10)', color: '#FACC15', border: '1px solid rgba(250,204,21,0.32)', fontFamily: 'DM Sans', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <AlertTriangle size={9} /> Baja conf.
              </span>
            )}
          </div>
          {e.address_full && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <MapPin size={10} color="rgba(240,235,224,0.40)" />
              <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)' }}>{e.address_full}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', flexWrap: 'wrap' }}>
            <span><Layers size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />{(e.units || []).length} prototipos · {e.total_units || 0} unidades</span>
            {(priceMin || priceMax) && <span>{priceMin || '—'} — {priceMax || '—'}</span>}
            {(e.amenities || []).length > 0 && <span>{e.amenities.length} amenidades</span>}
            <span style={{ color: 'rgba(240,235,224,0.40)' }}>· {item.source_files?.length || 0} archivos</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button data-testid={`review-approve-${item.id}`} onClick={doApprove} disabled={busy}
            style={{ padding: '7px 13px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: busy ? 0.7 : 1 }}>
            <Check size={11} /> Aprobar
          </button>
          {matches.length > 0 && (
            <button data-testid={`review-merge-${item.id}`} onClick={() => setShowMerge(s => !s)}
              style={{ padding: '7px 12px', borderRadius: 9999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.32)', color: '#818CF8', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <GitMerge size={11} /> Fusionar
            </button>
          )}
          <button data-testid={`review-reject-${item.id}`} onClick={() => setShowReject(s => !s)}
            style={{ padding: '7px 12px', borderRadius: 9999, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <X size={11} /> Rechazar
          </button>
        </div>
      </div>

      {/* Dedup matches */}
      {matches.length > 0 && (
        <div style={{ padding: '8px 11px', borderRadius: 9, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
            Posibles coincidencias (top {matches.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {matches.map(m => (
              <div key={m.dev_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.03)' }}>
                <span style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream)' }}>{m.name || m.dev_id}</span>
                <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, background: m.score >= 0.85 ? 'rgba(74,222,128,0.10)' : 'rgba(250,204,21,0.10)', color: m.score >= 0.85 ? '#4ADE80' : '#FACC15', fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
                  {(m.score * 100).toFixed(0)}%
                </span>
                {showMerge && (
                  <button onClick={() => doMerge(m.dev_id)} disabled={busy} data-testid={`merge-${item.id}-${m.dev_id}`}
                    style={{ padding: '4px 9px', borderRadius: 9999, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.40)', color: '#818CF8', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5, cursor: busy ? 'wait' : 'pointer' }}>
                    Usar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject reason */}
      {showReject && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <input data-testid={`reject-reason-${item.id}`} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Motivo del rechazo (mín 3 chars)…" maxLength={500}
            style={{ flex: 1, padding: '7px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none' }} />
          <button onClick={doReject} disabled={busy || reason.trim().length < 3} data-testid={`reject-confirm-${item.id}`}
            style={{ padding: '7px 14px', borderRadius: 9999, background: 'rgba(239,68,68,0.85)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: busy || reason.trim().length < 3 ? 'not-allowed' : 'pointer', opacity: busy || reason.trim().length < 3 ? 0.6 : 1 }}>
            Confirmar
          </button>
        </div>
      )}

      {/* Toggle expand to show units */}
      {(e.units || []).length > 0 && (
        <button onClick={() => setExpanded(x => !x)} data-testid={`review-expand-${item.id}`}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(99,102,241,0.85)', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600 }}>
          {expanded ? 'Ocultar' : `Ver ${e.units.length} prototipos`}
        </button>
      )}
      {expanded && (e.units || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {e.units.map((u, i) => (
            <span key={i} style={{ padding: '3px 9px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Mono, monospace' }}>
              {u.unit_number} · {u.type || '—'} · {u.bedrooms || '?'}rec · {u.size_m2 || '?'}m² · {fmtMxn(u.price_mxn) || '—'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

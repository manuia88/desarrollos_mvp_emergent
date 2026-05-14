// W1.5 ZZ.1.1 — MergeDiffVisualizer
import React, { useEffect, useState } from 'react';
import { GitMerge, AlertCircle, Check, ArrowRight, X, Loader } from 'lucide-react';
import { getItemDiff, forceMatch, mergeItem as apiMerge } from '../../api/superadminBulkIngest';

function fmtVal(v) {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function StatusPill({ status }) {
  const map = {
    same: { c: '#4ADE80', bg: 'rgba(74,222,128,0.10)', l: 'Igual' },
    diff: { c: '#FACC15', bg: 'rgba(250,204,21,0.10)', l: 'Difiere' },
    missing_target: { c: 'var(--theme)', bg: 'rgba(var(--theme-rgb),0.10)', l: 'Solo ingesta' },
    missing_ingest: { c: '#F87171', bg: 'rgba(239,68,68,0.10)', l: 'Solo destino' },
    new: { c: 'var(--theme)', bg: 'rgba(var(--theme-rgb),0.10)', l: 'Nueva' },
    target_only: { c: '#F87171', bg: 'rgba(239,68,68,0.10)', l: 'Solo destino' },
  };
  const s = map[status] || map.diff;
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 9999, fontSize: 9.5,
      background: s.bg, color: s.c, fontFamily: 'DM Mono, monospace', fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>{s.l}</span>
  );
}

function FieldRow({ field }) {
  const isSame = field.status === 'same';
  return (
    <div data-testid={`diff-field-${field.key}`}
      style={{
        display: 'grid', gridTemplateColumns: '110px 1fr 14px 1fr 70px',
        gap: 8, alignItems: 'center', padding: '6px 8px',
        borderRadius: 8,
        background: isSame ? 'transparent' : 'rgba(250,204,21,0.04)',
        border: `1px solid ${isSame ? 'rgba(255,255,255,0.05)' : 'rgba(250,204,21,0.18)'}`,
      }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.72)', fontWeight: 600 }}>
        {field.label}
      </span>
      <span style={{
        fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream)',
        background: 'rgba(var(--theme-rgb),0.06)', padding: '3px 7px', borderRadius: 6,
        wordBreak: 'break-word',
      }}>{fmtVal(field.ingest)}</span>
      <ArrowRight size={11} color="rgba(240,235,224,0.35)" style={{ justifySelf: 'center' }} />
      <span style={{
        fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream)',
        background: 'rgba(255,255,255,0.04)', padding: '3px 7px', borderRadius: 6,
        wordBreak: 'break-word',
      }}>{fmtVal(field.target)}</span>
      <StatusPill status={field.status} />
    </div>
  );
}

function UnitRow({ unit }) {
  const showIngest = !!unit.ingest;
  const showTarget = !!unit.target;
  const fmtUnit = (u) => u ? `${u.type || '—'} · ${u.bedrooms || '?'}rec · ${u.size_m2 || '?'}m² · ${u.price_mxn ? '$' + Math.round(u.price_mxn / 1000) + 'K' : '—'}` : '—';
  return (
    <div data-testid={`diff-unit-${unit.unit_number || 'tgt'}`}
      style={{
        display: 'grid', gridTemplateColumns: '70px 1fr 14px 1fr 80px',
        gap: 8, alignItems: 'center', padding: '5px 8px',
        borderRadius: 7,
        background: unit.status === 'same' ? 'transparent' : 'rgba(var(--theme-rgb),0.04)',
        border: `1px solid ${unit.status === 'same' ? 'rgba(255,255,255,0.05)' : 'rgba(var(--theme-rgb),0.18)'}`,
      }}>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream)', fontWeight: 700 }}>
        {unit.unit_number || '—'}
      </span>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: showIngest ? 'var(--cream)' : 'rgba(240,235,224,0.30)' }}>
        {fmtUnit(unit.ingest)}
      </span>
      <ArrowRight size={10} color="rgba(240,235,224,0.30)" style={{ justifySelf: 'center' }} />
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: showTarget ? 'var(--cream)' : 'rgba(240,235,224,0.30)' }}>
        {fmtUnit(unit.target)}
      </span>
      <StatusPill status={unit.status} />
    </div>
  );
}

/**
 * MergeDiffVisualizer
 * Props:
 *  - itemId
 *  - candidates: [{dev_id, name, score}]  (from item.dedup.similar_matches)
 *  - defaultTargetDevId: optional initial target (e.g., best_match_dev_id)
 *  - onMerged: cb after successful merge / force-match
 *  - onClose
 *  - allowForceMatch: bool — show force-match-by-id input
 */
export default function MergeDiffVisualizer({
  itemId,
  candidates = [],
  defaultTargetDevId,
  onMerged,
  onClose,
  allowForceMatch = true,
}) {
  const [targetId, setTargetId] = useState(defaultTargetDevId || (candidates[0] && candidates[0].dev_id) || '');
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [forceMode, setForceMode] = useState(false);
  const [forceId, setForceId] = useState('');

  const load = async (tid) => {
    if (!tid) return;
    setLoading(true); setErr('');
    try { setDiff(await getItemDiff(itemId, tid)); }
    catch (e) { setErr(e.message || 'Error al cargar diff'); setDiff(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (targetId) load(targetId); /* eslint-disable-next-line */ }, [targetId, itemId]);

  const doMerge = async () => {
    if (!targetId) return;
    setBusy(true);
    try { await apiMerge(itemId, targetId); onMerged && onMerged({ mode: 'merge', target: targetId }); }
    catch (e) { setErr(e.message || 'Error al fusionar'); }
    finally { setBusy(false); }
  };

  const doForce = async (mode) => {
    const tid = (forceId || targetId || '').trim();
    if (!tid) return;
    setBusy(true);
    try { await forceMatch(itemId, tid, mode); onMerged && onMerged({ mode: `force_${mode}`, target: tid }); }
    catch (e) { setErr(e.message || 'Error en force-match'); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid={`merge-diff-${itemId}`} style={{
      padding: '14px 16px', borderRadius: 12, background: 'rgba(var(--theme-rgb),0.05)',
      border: '1px solid rgba(var(--theme-rgb),0.25)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <GitMerge size={13} color="var(--theme)" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
          Comparar y fusionar
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {onClose && (
            <button data-testid="merge-diff-close" onClick={onClose}
              style={{ padding: '4px 10px', borderRadius: 9999, background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)',
                fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer' }}>Cerrar</button>
          )}
        </div>
      </div>

      {/* Target selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Destino
        </span>
        {candidates.map(c => (
          <button key={c.dev_id} data-testid={`merge-target-${c.dev_id}`}
            onClick={() => { setTargetId(c.dev_id); setForceMode(false); }}
            style={{
              padding: '4px 10px', borderRadius: 9999, fontSize: 11,
              fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
              border: targetId === c.dev_id ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.10)',
              background: targetId === c.dev_id ? 'rgba(var(--theme-rgb),0.18)' : 'transparent',
              color: targetId === c.dev_id ? 'var(--theme)' : 'rgba(240,235,224,0.65)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
            {c.name || c.dev_id}
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, opacity: 0.85 }}>{(c.score * 100).toFixed(0)}%</span>
          </button>
        ))}
        {allowForceMatch && (
          <button data-testid="merge-force-toggle" onClick={() => setForceMode(s => !s)}
            style={{
              padding: '4px 10px', borderRadius: 9999, fontSize: 11,
              fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
              border: '1px solid rgba(250,204,21,0.30)',
              background: forceMode ? 'rgba(250,204,21,0.12)' : 'transparent',
              color: '#FACC15', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
            <AlertCircle size={10} /> Forzar por ID
          </button>
        )}
      </div>

      {forceMode && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <input data-testid="merge-force-id" value={forceId} onChange={e => setForceId(e.target.value)}
            placeholder="dev_xxxxxxxxx"
            style={{
              flex: '1 1 220px', padding: '6px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(250,204,21,0.30)',
              color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 11.5, outline: 'none',
            }} />
          <button data-testid="merge-force-load" onClick={() => setTargetId(forceId.trim())}
            disabled={!forceId.trim()}
            style={{
              padding: '6px 12px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.18)',
              border: '1px solid rgba(var(--theme-rgb),0.40)', color: 'var(--theme)',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
              cursor: forceId.trim() ? 'pointer' : 'not-allowed', opacity: forceId.trim() ? 1 : 0.5,
            }}>Cargar diff</button>
        </div>
      )}

      {/* Body */}
      {loading && (
        <div data-testid="merge-diff-loading" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 14, fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.72)' }}>
          <Loader size={12} className="animate-spin" /> Cargando comparativa…
        </div>
      )}
      {err && (
        <div data-testid="merge-diff-err" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)', fontFamily: 'DM Sans', fontSize: 11.5, color: '#F87171', display: 'flex', alignItems: 'center', gap: 5 }}>
          <X size={11} /> {err}
        </div>
      )}

      {diff && !loading && (
        <>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontFamily: 'DM Mono, monospace', fontSize: 10.5 }}>
            <span style={{ padding: '2px 8px', borderRadius: 9999, background: 'rgba(74,222,128,0.10)', color: '#4ADE80' }}>
              {diff.summary.fields_same}/{diff.summary.total_fields} iguales
            </span>
            <span style={{ padding: '2px 8px', borderRadius: 9999, background: 'rgba(250,204,21,0.10)', color: '#FACC15' }}>
              {diff.summary.fields_diff} difieren
            </span>
            <span style={{ padding: '2px 8px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', color: 'var(--theme)' }}>
              {diff.summary.units_new} unidades nuevas
            </span>
            {diff.summary.units_diff > 0 && (
              <span style={{ padding: '2px 8px', borderRadius: 9999, background: 'rgba(250,204,21,0.10)', color: '#FACC15' }}>
                {diff.summary.units_diff} unidades a actualizar
              </span>
            )}
          </div>

          {/* Field rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 14px 1fr 70px', gap: 8, padding: '0 8px', fontFamily: 'DM Sans', fontSize: 9.5, color: 'rgba(240, 235, 224, 0.68)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              <span>Campo</span>
              <span>Ingesta</span>
              <span></span>
              <span>Destino: {diff.target_name || diff.target_dev_id}</span>
              <span style={{ textAlign: 'right' }}>Estado</span>
            </div>
            {diff.fields.map(f => <FieldRow key={f.key} field={f} />)}
          </div>

          {/* Units */}
          {(diff.units || []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'rgba(240, 235, 224, 0.68)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 8px 0' }}>
                Unidades ({diff.units.length})
              </div>
              {diff.units.map((u, i) => <UnitRow key={`${u.unit_number || 'tgt'}-${i}`} unit={u} />)}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
            {forceMode ? (
              <>
                <button data-testid="merge-force-merge-btn" onClick={() => doForce('merge')} disabled={busy || !targetId}
                  style={{ padding: '7px 14px', borderRadius: 9999, background: 'rgba(250,204,21,0.20)', border: '1px solid rgba(250,204,21,0.45)', color: '#FACC15', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <GitMerge size={11} /> Forzar fusión
                </button>
                <button data-testid="merge-force-approve-btn" onClick={() => doForce('approve_as_new')} disabled={busy || !targetId}
                  style={{ padding: '7px 14px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.40)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Check size={11} /> Aprobar como nuevo
                </button>
              </>
            ) : (
              <button data-testid="merge-confirm-btn" onClick={doMerge} disabled={busy || !targetId}
                style={{ padding: '8px 16px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <GitMerge size={11} /> Fusionar en {diff.target_name || diff.target_dev_id}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

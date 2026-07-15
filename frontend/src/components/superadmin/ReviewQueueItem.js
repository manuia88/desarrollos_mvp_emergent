// W1.4 ZZ.1 + W1.5 ZZ.1.1 — ReviewQueueItem
import React, { useState, useMemo } from 'react';
import { Check, X, GitMerge, MapPin, Layers, AlertTriangle, RefreshCw, History } from 'lucide-react';
import InlineEditableField from './InlineEditableField';
import MergeDiffVisualizer from './MergeDiffVisualizer';
import { patchItem, recomputeExtraction } from '../../api/superadminBulkIngest';

function fmtMxn(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// Compute effective extracted on the client (mirrors backend.effective_extracted)
function computeEffective(item) {
  const base = { ...(item.extracted || {}) };
  for (const ov of (item.extracted_overrides || [])) {
    const patch = ov.patch || {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'price_range' && v && typeof v === 'object') {
        base.price_range = { ...(base.price_range || {}), ...v };
      } else if (k === 'units' && Array.isArray(v)) {
        base.units = v;
      } else {
        base[k] = v;
      }
    }
  }
  return base;
}

export default function ReviewQueueItem({ item: itemProp, onApprove, onReject, onMerge }) {
  const [item, setItem] = useState(itemProp);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [toast, setToast] = useState('');

  React.useEffect(() => { setItem(itemProp); }, [itemProp]);
  React.useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); } }, [toast]);

  const e = useMemo(() => computeEffective(item), [item]);
  const pre = item.pre_auditoria;
  const dedup = item.dedup || {};
  const matches = dedup.similar_matches || [];
  const lowConf = e._low_confidence || e._stub;
  const conf = e._confidence || {};          // confianza por campo de la IA (upgrade sesión)
  const geocoded = !!e._geocoded;            // lat/lng completadas por geocoding
  const priceMin = fmtMxn(e?.price_range?.min_mxn);
  const priceMax = fmtMxn(e?.price_range?.max_mxn);
  const overrideCount = (item.extracted_overrides || []).length;
  const historyCount = (item.extraction_history || []).length;

  const savePatch = async (patch) => {
    const r = await patchItem(item.id, patch);
    if (r && r.item) setItem(r.item);
    setToast('Guardado');
  };

  const doApprove = async () => { setBusy(true); try { await onApprove(item.id); } finally { setBusy(false); } };
  const doReject = async () => {
    if (reason.trim().length < 3) return;
    setBusy(true);
    try { await onReject(item.id, reason); setShowReject(false); setReason(''); }
    finally { setBusy(false); }
  };
  const doRecompute = async () => {
    if (!window.confirm('¿Re-ejecutar Claude sobre los archivos? Esto preserva el histórico y descarta tus ediciones inline.')) return;
    setRecomputing(true);
    try {
      const r = await recomputeExtraction(item.id);
      if (r && r.item) setItem(r.item);
      setToast('Extracción re-computada');
    } catch (err) {
      setToast(err.message || 'Error al recomputar');
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div data-testid={`review-item-${item.id}`}
      style={{
        padding: '14px 16px', borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${lowConf ? 'rgba(250,204,21,0.30)' : 'rgba(255,255,255,0.07)'}`,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
      {toast && (
        <div data-testid={`review-toast-${item.id}`} style={{ alignSelf: 'flex-end', padding: '4px 10px', borderRadius: 9999, background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.30)', color: '#4ADE80', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700 }}>
          {toast}
        </div>
      )}

      {/* 🚦 EL PORTÓN: el lote llega pre-auditado — apruebas sabiendo qué viene */}
      {pre && ((pre.resumen?.error || 0) + (pre.resumen?.alerta || 0) + (pre.resumen?.aviso || 0)) > 0 && (
        <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(210,153,34,0.07)', border: '1px solid rgba(210,153,34,0.4)', fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.85)' }}>
          <b style={{ color: '#d29922' }}>🚦 Pre-auditoría del lote:</b> {pre.resumen.error || 0} errores · {pre.resumen.alerta || 0} alertas · {pre.resumen.aviso || 0} avisos
          {(pre.hallazgos || []).slice(0, 3).map((h, i2) => (
            <div key={i2} style={{ marginTop: 3, opacity: 0.9 }}>· [{h.severidad}] {h.ref}: {(h.detalle || '').slice(0, 110)}</div>
          ))}
          {(pre.preguntas_al_dev || []).length > 0 && (
            <div style={{ marginTop: 5, color: '#9ecbff' }}>💬 Pregunta lista para el dev: {pre.preguntas_al_dev[0]}</div>
          )}
          {(pre.muestra_juez || []).length > 0 && (
            <details style={{ marginTop: 5 }}>
              <summary style={{ cursor: 'pointer', color: '#86efac', fontWeight: 700 }}>⚖️ Tus {pre.muestra_juez.length} campos de juez (verifica contra el PDF antes de aprobar)</summary>
              {pre.muestra_juez.map((m, i3) => (
                <div key={i3} style={{ opacity: 0.85, marginTop: 2 }}>· {m.unidad} — {m.campo}: <b>{typeof m.valor === 'number' ? m.valor.toLocaleString('en-US') : String(m.valor)}</b></div>
              ))}
            </details>
          )}
        </div>
      )}

      {/* Qué tan segura está la IA de cada dato — en lenguaje claro (no un % que asusta) */}
      {(Object.keys(conf).length > 0 || geocoded) && (
        <div data-testid={`review-conf-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span title="La IA leyó los documentos y esto es qué tan segura está de cada dato" style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'rgba(240,235,224,0.45)' }}>La IA encontró</span>
          {[['nombre', conf.project_name], ['dirección', conf.address], ['precio', conf.price], ['unidades', conf.units]]
            .filter(([, v]) => typeof v === 'number')
            .map(([lbl, v]) => {
              const c = v >= 0.7 ? '#4ADE80' : (v >= 0.4 ? '#FACC15' : '#F87171');
              const word = v >= 0.7 ? 'sí ✓' : (v >= 0.4 ? 'dudoso' : 'no lo halló');
              return (
                <span key={lbl} title={`La IA está ${Math.round(v * 100)}% segura del ${lbl}. Rojo = no lo encontró en los documentos (edítalo o apruébalo igual, no significa que esté mal).`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, background: `${c}1f`, border: `1px solid ${c}55`, color: c }}>
                  {lbl}: {word}
                </span>
              );
            })}
          {geocoded && (
            <span style={{ padding: '2px 8px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.4)', color: '#A5B4FC' }}>
              📍 geocodificado
            </span>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
            <InlineEditableField
              testId={`field-name-${item.id}`}
              value={e.project_name}
              onSave={(v) => savePatch({ project_name: v })}
              placeholder={item.project_folder_name || 'Sin nombre'}
            />
            {lowConf && (
              <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, background: 'rgba(250,204,21,0.10)', color: '#FACC15', border: '1px solid rgba(250,204,21,0.32)', fontFamily: 'DM Sans', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <AlertTriangle size={9} /> Baja conf.
              </span>
            )}
            {overrideCount > 0 && (
              <span title={`${overrideCount} ediciones inline aplicadas`} style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, background: 'rgba(var(--theme-rgb),0.10)', color: 'var(--theme)', border: '1px solid rgba(var(--theme-rgb),0.32)', fontFamily: 'DM Sans', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Check size={9} /> Editado ({overrideCount})
              </span>
            )}
            {historyCount > 0 && (
              <span title={`${historyCount} extracciones previas`} style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, background: 'rgba(var(--theme-rgb),0.10)', color: 'var(--theme)', border: '1px solid rgba(var(--theme-rgb),0.32)', fontFamily: 'DM Sans', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <History size={9} /> Recomputado ({historyCount})
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <MapPin size={10} color="rgba(240, 235, 224, 0.68)" />
            <InlineEditableField
              testId={`field-address-${item.id}`}
              value={e.address_full}
              onSave={(v) => savePatch({ address_full: v })}
              placeholder="Sin dirección"
            />
          </div>

          <div style={{ display: 'flex', gap: 10, fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Layers size={10} />
              {(e.units || []).length} unidades extraídas · 
              <InlineEditableField
                testId={`field-total-${item.id}`}
                value={e.total_units || 0}
                onSave={(v) => savePatch({ total_units: v == null ? 0 : Number(v) })}
                type="number" mono
              /> unidades
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <InlineEditableField
                testId={`field-pmin-${item.id}`}
                value={e?.price_range?.min_mxn ?? null}
                onSave={(v) => savePatch({ price_range: { min_mxn: v == null ? null : Number(v) } })}
                type="number" mono placeholder="—"
              />
              <span>—</span>
              <InlineEditableField
                testId={`field-pmax-${item.id}`}
                value={e?.price_range?.max_mxn ?? null}
                onSave={(v) => savePatch({ price_range: { max_mxn: v == null ? null : Number(v) } })}
                type="number" mono placeholder="—"
              />
            </span>
            {(priceMin || priceMax) && <span style={{ color: 'rgba(240, 235, 224, 0.68)' }}>· {priceMin || '—'} a {priceMax || '—'}</span>}
            {(e.amenities || []).length > 0 && <span>{e.amenities.length} amenidades</span>}
            <span style={{ color: 'rgba(240, 235, 224, 0.68)' }}>· {item.source_files?.length || 0} archivos</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button data-testid={`review-recompute-${item.id}`} onClick={doRecompute} disabled={recomputing || busy} title="Re-extraer con Claude"
            style={{ padding: '7px 12px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.32)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: recomputing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: recomputing ? 0.7 : 1 }}>
            <RefreshCw size={11} className={recomputing ? 'animate-spin' : ''} /> {recomputing ? 'Procesando…' : 'Re-extraer'}
          </button>
          <button data-testid={`review-approve-${item.id}`} onClick={doApprove} disabled={busy}
            style={{ padding: '7px 13px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: busy ? 0.7 : 1 }}>
            <Check size={11} /> Aprobar
          </button>
          <button data-testid={`review-merge-${item.id}`} onClick={() => setShowDiff(s => !s)}
            style={{ padding: '7px 12px', borderRadius: 9999, background: showDiff ? 'rgba(var(--theme-rgb),0.20)' : 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.32)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <GitMerge size={11} /> {showDiff ? 'Cerrar diff' : 'Comparar / Fusionar'}
          </button>
          <button data-testid={`review-reject-${item.id}`} onClick={() => setShowReject(s => !s)}
            style={{ padding: '7px 12px', borderRadius: 9999, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <X size={11} /> Rechazar
          </button>
        </div>
      </div>

      {/* Dedup matches summary */}
      {matches.length > 0 && !showDiff && (
        <div style={{ padding: '8px 11px', borderRadius: 9, background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.20)' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
            Posibles coincidencias (top {matches.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {matches.map(m => (
              <div key={m.dev_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.03)' }}>
                <span style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream)' }}>{m.name || m.dev_id}</span>
                <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, background: m.score >= 0.85 ? 'rgba(74,222,128,0.10)' : 'rgba(250,204,21,0.10)', color: m.score >= 0.85 ? '#4ADE80' : '#FACC15', fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
                  {(m.score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diff visualizer (W1.5) */}
      {showDiff && (
        <MergeDiffVisualizer
          itemId={item.id}
          candidates={matches}
          defaultTargetDevId={dedup.best_match_dev_id || (matches[0] && matches[0].dev_id)}
          onClose={() => setShowDiff(false)}
          onMerged={async (info) => {
            setShowDiff(false);
            setToast(info.mode.startsWith('force') ? 'Forzado aplicado' : `Fusionado en ${info.target}`);
            // Notify parent so it refreshes the queue
            if (onMerge) await onMerge(item.id, info.target);
          }}
        />
      )}

      {/* Reject reason */}
      {showReject && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <input data-testid={`reject-reason-${item.id}`} value={reason} onChange={ev => setReason(ev.target.value)}
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
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(var(--theme-rgb),0.85)', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600 }}>
          {expanded ? 'Ocultar' : `Ver ${e.units.length} unidades`}
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

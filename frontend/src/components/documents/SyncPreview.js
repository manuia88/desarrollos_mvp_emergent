// SyncPreview — Phase 7.5 · Auto-Sync diff viewer with apply/revert/lock controls.
import React, { useEffect, useState } from 'react';
import * as docsApi from '../../api/documents';
import { Sparkle, AlertTriangle, Check, RotateCcw, Trash, Download } from '../icons';

const fmtVal = (v) => {
  if (v == null) return <span style={{ color: 'var(--cream-3)', fontStyle: 'italic' }}>(no asignado)</span>;
  if (Array.isArray(v)) return `[${v.length} items] ${v.slice(0, 3).map(x => typeof x === 'object' ? JSON.stringify(x).slice(0, 40) : String(x).slice(0, 40)).join(' · ')}${v.length > 3 ? '…' : ''}`;
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isInteger(v) ? new Intl.NumberFormat('es-MX').format(v) : v.toFixed(2);
  return String(v).slice(0, 200);
};

const fmtDate = (s) => s ? new Date(s).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';


export default function SyncPreview({ devId, devName, scope = 'superadmin', onApplied }) {
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState('preview');

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const [pre, aud] = await Promise.all([
        docsApi.getSyncPreview(devId, scope),
        docsApi.getSyncAudit(devId, scope),
      ]);
      setData(pre); setAudit(aud.audit || []);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  useEffect(() => { if (devId) load(); /* eslint-disable-next-line */ }, [devId, scope]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const apply = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await docsApi.applySync(devId, scope);
      setToast({ ok: r.ok, msg: r.ok ? `Aplicados ${r.applied_count} cambios · saltados ${r.skipped_count}` : (r.error || 'Error') });
      await load();
      onApplied?.();
    } catch (e) {
      setToast({ ok: false, msg: typeof e.body?.detail === 'string' ? e.body.detail : e.message });
    }
    setBusy(false);
  };

  const revert = async (auditId) => {
    if (!window.confirm('Revertir este cambio al valor anterior?')) return;
    try {
      await docsApi.revertSync(devId, auditId, scope);
      setToast({ ok: true, msg: 'Cambio revertido.' });
      load();
    } catch (e) { setToast({ ok: false, msg: e.message }); }
  };

  const toggleLock = async (field, currentlyLocked) => {
    try {
      await docsApi.lockSyncField(devId, field, !currentlyLocked, scope);
      setToast({ ok: true, msg: !currentlyLocked ? `${field} bloqueado · auto-sync lo respetará` : `${field} desbloqueado` });
      load();
    } catch (e) { setToast({ ok: false, msg: e.message }); }
  };

  if (loading) return <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>Cargando preview…</div>;
  if (err) return <div style={{ color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12.5 }}>Error: {err}</div>;

  const diffs = data?.diffs || [];
  const unitsDiff = data?.units_diff;
  const paused = data?.auto_sync_paused;

  return (
    <div data-testid="sync-preview-view">
      {/* Header summary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Auto-Sync · v{data?.engine_version || '1.0'}</div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
            Cambios pendientes · {devName || devId}
          </h3>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 3 }}>
            Última sincronización: {fmtDate(data?.last_auto_sync_at)} · {(data?.locked_fields || []).length} bloqueado(s) por developer
          </div>
        </div>
        <button data-testid="sync-apply-btn" onClick={apply} disabled={busy || diffs.length === 0 && !unitsDiff} style={{
          padding: '10px 20px', borderRadius: 9999,
          background: (busy || (diffs.length === 0 && !unitsDiff)) ? 'rgba(148,163,184,0.2)' : 'var(--grad)',
          border: 'none', color: '#fff',
          fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5,
          cursor: busy ? 'wait' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Sparkle size={12} />
          {busy ? 'Aplicando…' : `Aplicar ${diffs.length + (unitsDiff ? 1 : 0)} cambio(s)`}
        </button>
      </div>

      {paused && (
        <div data-testid="sync-paused-banner" style={{
          padding: 12, marginBottom: 14, borderRadius: 12,
          background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.32)',
          display: 'flex', alignItems: 'flex-start', gap: 8,
          color: '#fcd34d', fontFamily: 'DM Sans', fontSize: 12.5, lineHeight: 1.5,
        }}>
          <AlertTriangle size={14} />
          <span><strong style={{ color: '#fde68a' }}>Auto-aplicación pausada</strong> — {data.auto_sync_paused_reason}<br/>
          Puedes ver el preview y aplicar manualmente, pero el sistema no auto-publica hasta resolver críticos.</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
        {[
          { k: 'preview', label: `Preview (${diffs.length}${unitsDiff ? '+' : ''})` },
          { k: 'audit', label: `Historial (${audit.length})` },
          { k: 'locks', label: `Bloqueos (${(data?.locked_fields || []).length})` },
        ].map(t => (
          <button key={t.k} data-testid={`sync-tab-${t.k}`} onClick={() => setTab(t.k)} style={{
            padding: '8px 14px', background: 'transparent', border: 'none',
            borderBottom: `2px solid ${tab === t.k ? '#6366F1' : 'transparent'}`,
            color: tab === t.k ? 'var(--cream)' : 'var(--cream-3)',
            fontFamily: 'DM Sans', fontWeight: tab === t.k ? 600 : 500, fontSize: 12.5,
            cursor: 'pointer', marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab: Preview */}
      {tab === 'preview' && (
        <>
          {diffs.length === 0 && !unitsDiff && (
            <div data-testid="sync-no-pending" style={{ padding: 26, textAlign: 'center', background: '#0A0D16', border: '1px solid var(--border)', borderRadius: 12 }}>
              <Check size={20} color="#86efac" />
              <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 13.5, color: 'var(--cream-2)', marginTop: 6 }}>
                Marketplace ya sincronizado.
              </div>
            </div>
          )}

          {diffs.map((d) => (
            <div key={d.field} data-testid={`sync-diff-${d.field}`} style={{
              padding: 12, marginBottom: 8, borderRadius: 12,
              background: '#0D1118', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--cream)', fontWeight: 600 }}>{d.field}</span>
                  <span style={{
                    padding: '2px 9px', borderRadius: 9999,
                    background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.28)',
                    color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>{d.source_doc_type}</span>
                  {d.is_private && <span style={{ padding: '2px 9px', borderRadius: 9999, background: 'rgba(148,163,184,0.12)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>PRIVADO</span>}
                  {d.is_locked && <span style={{ padding: '2px 9px', borderRadius: 9999, background: 'rgba(245,158,11,0.12)', color: '#fcd34d', fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>BLOQUEADO</span>}
                </div>
                <button onClick={() => toggleLock(d.field, d.is_locked)} title={d.is_locked ? 'Desbloquear' : 'Bloquear (auto-sync no lo tocará)'} style={{
                  padding: '4px 10px', borderRadius: 9999, background: 'transparent',
                  border: '1px solid var(--border)', color: 'var(--cream-3)',
                  fontFamily: 'DM Sans', fontSize: 10.5, cursor: 'pointer',
                }}>{d.is_locked ? 'Desbloquear' : 'Bloquear'}</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ padding: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Actual</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--cream-2)', wordBreak: 'break-word' }}>{fmtVal(d.current)}</div>
                </div>
                <div style={{ alignSelf: 'center', textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 16 }}>→</div>
                <div style={{ padding: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.22)', borderRadius: 8 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Propuesto</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: '#86efac', wordBreak: 'break-word' }}>{fmtVal(d.proposed)}</div>
                </div>
              </div>
            </div>
          ))}

          {unitsDiff && (
            <div data-testid="sync-diff-units" style={{
              padding: 12, marginBottom: 8, borderRadius: 12,
              background: '#0D1118', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--cream)', fontWeight: 600 }}>units_overlay</span>
                <span style={{ padding: '2px 9px', borderRadius: 9999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.28)', color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>lp</span>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                <strong>{unitsDiff.current_count}</strong> unidades actuales → <strong style={{ color: '#86efac' }}>{unitsDiff.proposed_count}</strong> propuestas (reemplazo full).
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab: Audit */}
      {tab === 'audit' && (
        <div>
          {audit.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', background: '#0A0D16', border: '1px solid var(--border)', borderRadius: 12, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              Sin historial aún.
            </div>
          )}
          {audit.map((a) => (
            <div key={a.audit_id} data-testid="sync-audit-row" style={{
              padding: 11, marginBottom: 6, borderRadius: 10,
              background: '#0D1118', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{
                padding: '2px 9px', borderRadius: 9999,
                background: a.kind === 'revert' ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)',
                color: a.kind === 'revert' ? '#fcd34d' : '#c7d2fe',
                fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>{a.kind || 'apply'}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--cream)', flexShrink: 0 }}>{a.field}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                {fmtDate(a.applied_at)} · {a.applied_by}
              </span>
              {a.source_doc_id && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#c7d2fe' }}>{a.source_doc_id}</span>}
              <div style={{ marginLeft: 'auto' }}>
                {a.can_revert && a.kind !== 'revert' && (
                  <button data-testid="sync-revert-btn" onClick={() => revert(a.audit_id)} style={{
                    padding: '4px 12px', borderRadius: 9999, background: 'rgba(99,102,241,0.10)',
                    border: '1px solid rgba(99,102,241,0.32)', color: '#c7d2fe',
                    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}><RotateCcw size={10} /> Revertir</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Locks */}
      {tab === 'locks' && (
        <div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5, marginBottom: 12 }}>
            Los campos bloqueados quedan protegidos del auto-sync; cualquier extracción nueva los respeta. Útil cuando editas manualmente la ficha y no quieres que un re-upload la sobrescriba.
          </p>
          {(data?.locked_fields || []).length === 0 && (
            <div style={{ padding: 22, textAlign: 'center', background: '#0A0D16', border: '1px solid var(--border)', borderRadius: 12, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              Sin bloqueos. Marca un campo desde la pestaña <strong>Preview</strong>.
            </div>
          )}
          {(data?.locked_fields || []).map((f) => (
            <div key={f} style={{
              padding: 10, marginBottom: 6, borderRadius: 10, background: '#0D1118', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--cream)' }}>{f}</span>
              <button onClick={() => toggleLock(f, true)} style={{
                marginLeft: 'auto',
                padding: '4px 12px', borderRadius: 9999, background: 'transparent',
                border: '1px solid var(--border)', color: 'var(--cream-3)',
                fontFamily: 'DM Sans', fontSize: 10.5, cursor: 'pointer',
              }}>Desbloquear</button>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div data-testid="sync-toast" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 620,
          padding: '12px 18px', borderRadius: 14,
          background: toast.ok ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.16)',
          border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.ok ? '#86efac' : '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500, maxWidth: 360,
        }}>{toast.msg}</div>
      )}
    </div>
  );
}

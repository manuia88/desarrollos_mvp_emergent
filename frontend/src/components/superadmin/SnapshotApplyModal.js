// W2.4 SA5 — SnapshotApplyModal
import React, { useState } from 'react';
import { X, ArrowRightCircle } from 'lucide-react';
import { applySnapshot } from '../../api/superadminCommercial';

const COMPONENTS = [
  ['features', 'Features (flags)', true],
  ['pipeline', 'Pipeline (etapas)', true],
  ['email_templates', 'Email templates', true],
  ['branding', 'Branding (logo, colores)', false],
  ['automations', 'Automations', true],
  ['disc', 'DISC config', true],
  ['reportes', 'Reportes IA defaults', true],
];

export default function SnapshotApplyModal({ snapshot, tenants = [], onClose, onDone }) {
  const [tenantId, setTenantId] = useState('');
  const [include, setInclude] = useState(() => Object.fromEntries(COMPONENTS.map(([k, , def]) => [k, def])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (!tenantId.trim()) { setErr('Selecciona o ingresa un tenant'); return; }
    setBusy(true); setErr('');
    try {
      const body = Object.fromEntries(COMPONENTS.map(([k]) => [`include_${k}`, !!include[k]]));
      const r = await applySnapshot(snapshot.id, tenantId.trim(), body);
      setResult(r);
    } catch (e) { setErr(e.message || 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div data-testid="snapshot-apply-modal" style={{
        width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto',
        background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(var(--theme-rgb),0.30)',
        borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowRightCircle size={14} color="var(--theme)" />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0, flex: 1 }}>
            Aplicar snapshot · {snapshot.name}
          </h3>
          <button onClick={onClose} style={{ padding: 5, borderRadius: 9999, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.55)' }}>
            <X size={14} />
          </button>
        </div>

        {!result ? (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Tenant destino
              </span>
              <input data-testid="snapshot-apply-tenant" value={tenantId} onChange={e => setTenantId(e.target.value)}
                placeholder="dev_abc123…" list="tenants-dl"
                style={{ padding: '9px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 12.5, outline: 'none' }} />
              <datalist id="tenants-dl">
                {tenants.map(t => <option key={t.id || t.tenant_id} value={t.id || t.tenant_id}>{t.name}</option>)}
              </datalist>
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Componentes a incluir
              </span>
              {COMPONENTS.map(([k, label]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}>
                  <input type="checkbox" data-testid={`snap-incl-${k}`}
                    checked={!!include[k]} onChange={e => setInclude(s => ({ ...s, [k]: e.target.checked }))}
                    style={{ accentColor: 'var(--theme)' }} />
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)' }}>{label}</span>
                </label>
              ))}
            </div>

            {err && (
              <div data-testid="snapshot-apply-err" style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#F87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)', padding: '7px 11px', borderRadius: 8 }}>
                {err}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button data-testid="snapshot-apply-confirm" onClick={submit} disabled={busy}
                style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Aplicando…' : 'Aplicar snapshot'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '11px 13px', borderRadius: 9, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#4ADE80', fontWeight: 700, marginBottom: 4 }}>
                Snapshot aplicado correctamente
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.65)' }}>
                Componentes aplicados: {(result.diff?.applied_components || []).join(', ') || '—'}
              </div>
            </div>
            {result.diff?.features && (
              <div style={{ padding: '9px 11px', borderRadius: 8, background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.20)', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.65)' }}>
                Features: {(result.diff.features.applied || []).length} aplicados · {(result.diff.features.skipped || []).length} skipped
              </div>
            )}
            <button onClick={() => { onDone && onDone(result); onClose(); }}
              style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

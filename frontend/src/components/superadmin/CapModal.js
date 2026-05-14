// W2.3 SA4 — CapModal
import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, DollarSign } from 'lucide-react';
import { upsertCap, patchCap } from '../../api/superadminAiCost';

export default function CapModal({ tenant, existingCap, onClose, onSaved }) {
  const isEdit = !!existingCap;
  const [monthly, setMonthly] = useState(existingCap?.monthly_cap_mxn || 5000);
  const [threshold, setThreshold] = useState(existingCap?.alert_threshold_pct || 80);
  const [email, setEmail] = useState(existingCap?.custom_alert_email || '');
  const [hardBlock, setHardBlock] = useState(!!existingCap?.hard_block);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setMonthly(existingCap?.monthly_cap_mxn || 5000);
    setThreshold(existingCap?.alert_threshold_pct || 80);
    setEmail(existingCap?.custom_alert_email || '');
    setHardBlock(!!existingCap?.hard_block);
  }, [existingCap]);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const body = {
        monthly_cap_mxn: Number(monthly),
        alert_threshold_pct: Number(threshold),
        custom_alert_email: email || null,
        hard_block: hardBlock,
      };
      if (isEdit) {
        await patchCap(tenant.tenant_id, body);
      } else {
        await upsertCap({ tenant_id: tenant.tenant_id, ...body });
      }
      onSaved && onSaved();
    } catch (e) { setErr(e.message || 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div data-testid="cap-modal" style={{
        width: '100%', maxWidth: 480, background: 'rgba(13,17,28,0.97)',
        border: '1px solid rgba(var(--theme-rgb),0.30)', borderRadius: 14,
        padding: 22, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DollarSign size={14} color="var(--theme)" />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0, flex: 1 }}>
            {isEdit ? 'Editar tope' : 'Configurar tope'} · {tenant.name || tenant.tenant_id}
          </h3>
          <button onClick={onClose} data-testid="cap-modal-close"
            style={{ padding: 5, borderRadius: 9999, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.55)' }}>
            <X size={14} />
          </button>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Tope mensual (MXN)
          </span>
          <input data-testid="cap-monthly" type="number" value={monthly}
            onChange={e => setMonthly(e.target.value)} min="100" max="1000000" step="100"
            style={{ padding: '9px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none' }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Alerta a {threshold}% del tope
            </span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--theme)' }}>
              {Math.round(monthly * threshold / 100)} MXN
            </span>
          </div>
          <input data-testid="cap-threshold" type="range" min="50" max="95" value={threshold}
            onChange={e => setThreshold(e.target.value)}
            style={{ accentColor: 'var(--theme)' }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Email alternativo (opcional)
          </span>
          <input data-testid="cap-email" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="finanzas@empresa.mx"
            style={{ padding: '9px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none' }} />
        </label>

        <label data-testid="cap-hardblock-label" style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 13px',
          borderRadius: 11, background: hardBlock ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${hardBlock ? 'rgba(239,68,68,0.30)' : 'rgba(255,255,255,0.08)'}`,
          cursor: 'pointer', transition: 'background 180ms, border-color 180ms',
        }}>
          <input type="checkbox" data-testid="cap-hardblock" checked={hardBlock}
            onChange={e => setHardBlock(e.target.checked)}
            style={{ accentColor: '#EF4444', marginTop: 2 }} />
          <div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <ShieldAlert size={11} color="#F87171" />
              Bloqueo duro al exceder el tope
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)', lineHeight: 1.4 }}>
              Si está activado, las llamadas a IA del tenant se bloquearán automáticamente cuando se exceda el tope mensual.
            </div>
          </div>
        </label>

        {err && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#F87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)', padding: '7px 11px', borderRadius: 8 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button data-testid="cap-save" onClick={submit} disabled={busy}
            style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Guardando…' : 'Guardar tope'}
          </button>
        </div>
      </div>
    </div>
  );
}

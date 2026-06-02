// Phase 14 · Batch 37 — DesarrolladorCrossPartnerships
// Lista, crea, aprueba/rechaza y revoca alianzas dev↔dev / dev↔inmobiliaria
import React, { useEffect, useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import {
  HeartHandshake as Handshake, Plus, X, CheckCircle2, XCircle, RotateCcw, Inbox, Send,
} from 'lucide-react';
import {
  getCrossPartnerships, createCrossPartnership,
  approveCrossPartnership, rejectCrossPartnership, revokeCrossPartnership,
} from '../../api/cross_partnerships';
import { Z } from '../../styles/zIndex';

const STATUS_CFG = {
  pending:  { label: 'Pendiente', color: '#fff', bg: '#C77F12', bd: '#C77F12' },
  approved: { label: 'Aprobada',  color: '#fff', bg: '#1FA06A', bd: '#1FA06A' },
  rejected: { label: 'Rechazada', color: '#fff', bg: '#E0463D', bd: '#E0463D' },
  revoked:  { label: 'Revocada',  color: '#fff', bg: '#8A92A6', bd: '#8A92A6' },
};

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 9999, fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: 700, background: c.bg, border: `1px solid ${c.bd}`, color: c.color }}>
      {c.label}
    </span>
  );
}

function CreateModal({ onClose, onSuccess, defaultTargetType = 'dev' }) {
  const [form, setForm] = useState({ target_org_type: defaultTargetType, target_org_id: '', notes: '', commission_pct_default: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const s = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = { width: '100%', padding: '10px 13px', borderRadius: 9, background: 'rgba(var(--cream-rgb),0.06)', border: '1px solid rgba(var(--cream-rgb),0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const lbl = { fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'rgba(var(--cream-rgb),0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 };

  const submit = async () => {
    if (!form.target_org_id.trim()) { setErr('ID de la organización destino es requerido'); return; }
    setBusy(true); setErr('');
    try {
      await createCrossPartnership({
        target_org_type: form.target_org_type,
        target_org_id: form.target_org_id.trim(),
        notes: form.notes.trim() || undefined,
        commission_pct_default: form.commission_pct_default ? parseFloat(form.commission_pct_default) : undefined,
      });
      onSuccess();
    } catch (e) { setErr(e.message || 'Error al crear alianza'); setBusy(false); }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(var(--bg-rgb),0.82)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.MODAL, padding: 16 }}>
      <div style={{ background: 'rgba(var(--bg-rgb),0.97)', border: '1px solid rgba(var(--cream-rgb),0.10)', borderRadius: 18, width: '100%', maxWidth: 460, padding: '26px 26px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)', margin: 0 }}>Nueva alianza cross-org</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(var(--cream-rgb),0.45)' }}><X size={16} /></button>
        </div>
        {err && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', color: 'var(--red)', fontFamily: 'DM Sans', fontSize: 12.5, marginBottom: 12 }}>{err}</div>}

        <div style={{ marginBottom: 13 }}>
          <label style={lbl}>Tipo de organización destino *</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['dev', 'Desarrolladora'], ['inmobiliaria', 'Inmobiliaria']].map(([k, l]) => (
              <button key={k} onClick={() => s('target_org_type', k)}
                data-testid={`target-type-${k}`}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 9999, fontSize: 12,
                  fontFamily: 'DM Sans', fontWeight: 700, cursor: 'pointer',
                  border: form.target_org_type === k ? '1px solid rgba(99,102,241,0.55)' : '1px solid rgba(var(--cream-rgb),0.10)',
                  background: form.target_org_type === k ? 'rgba(99,102,241,0.16)' : 'transparent',
                  color: form.target_org_type === k ? '#818CF8' : 'rgba(var(--cream-rgb),0.50)',
                }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 13 }}>
          <label style={lbl}>ID de la organización *</label>
          <input data-testid="cp-target-org-id" style={inp} value={form.target_org_id} onChange={e => s('target_org_id', e.target.value)} placeholder="org_xyz_001" />
        </div>
        <div style={{ marginBottom: 13 }}>
          <label style={lbl}>Comisión default (%)</label>
          <input data-testid="cp-commission-pct" style={inp} type="number" min="0" max="50" step="0.1" value={form.commission_pct_default} onChange={e => s('commission_pct_default', e.target.value)} placeholder="3.5" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={lbl}>Notas</label>
          <textarea data-testid="cp-notes" style={{ ...inp, minHeight: 70, resize: 'vertical', fontFamily: 'DM Sans' }} value={form.notes} onChange={e => s('notes', e.target.value)} placeholder="Detalles, exclusividad, zonas…" maxLength={500} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(var(--cream-rgb),0.12)', color: 'rgba(var(--cream-rgb),0.55)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button data-testid="cp-create-submit" onClick={submit} disabled={busy} style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Enviando…' : 'Solicitar alianza'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReasonModal({ title, label, onClose, onConfirm, busy, confirmLabel }) {
  const [reason, setReason] = useState('');
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(var(--bg-rgb),0.80)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.DRAWER, padding: 16 }}>
      <div style={{ background: 'rgba(var(--bg-rgb),0.97)', border: '1px solid rgba(var(--cream-rgb),0.10)', borderRadius: 16, width: '100%', maxWidth: 440, padding: 26 }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '0 0 14px' }}>{title}</h3>
        <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>{label} *</label>
        <textarea data-testid="reason-textarea"
          style={{ width: '100%', padding: '10px 13px', borderRadius: 9, background: 'rgba(var(--cream-rgb),0.06)', border: '1px solid rgba(var(--cream-rgb),0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', minHeight: 70, resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }}
          value={reason} onChange={e => setReason(e.target.value)} maxLength={500} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(var(--cream-rgb),0.12)', color: 'rgba(var(--cream-rgb),0.55)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button data-testid="reason-confirm" onClick={() => onConfirm(reason)} disabled={busy || reason.trim().length < 3}
            style={{ padding: '9px 18px', borderRadius: 9999, background: 'rgba(239,68,68,0.80)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: busy || reason.trim().length < 3 ? 'not-allowed' : 'pointer', opacity: busy || reason.trim().length < 3 ? 0.6 : 1 }}>
            {busy ? 'Procesando…' : (confirmLabel || 'Confirmar')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DesarrolladorCrossPartnerships({ user, onLogout }) {
  return <CrossPartnershipsPage user={user} onLogout={onLogout} Layout={DeveloperLayout} portalName="Desarrolladora" />;
}

// Shared component used by Inmobiliaria too
export function CrossPartnershipsPage({ user, onLogout, Layout, portalName }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('both'); // both | requester | target
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [busy, setBusy] = useState({});
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getCrossPartnerships(tab, statusFilter || undefined);
      setItems(r.items || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [tab, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } }, [toast]);

  const myOrgId = user?.tenant_id || '';

  const handleApprove = async (pid) => {
    setBusy(b => ({ ...b, [pid]: true }));
    try { await approveCrossPartnership(pid); setToast('Alianza aprobada'); load(); }
    catch (e) { setToast(e.message || 'Error al aprobar'); }
    finally { setBusy(b => ({ ...b, [pid]: false })); }
  };

  const handleReject = async (pid, reason) => {
    setActionBusy(true);
    try { await rejectCrossPartnership(pid, reason); setRejectTarget(null); setToast('Alianza rechazada'); load(); }
    catch (e) { setToast(e.message || 'Error al rechazar'); }
    finally { setActionBusy(false); }
  };

  const handleRevoke = async (pid, reason) => {
    setActionBusy(true);
    try { await revokeCrossPartnership(pid, reason); setRevokeTarget(null); setToast('Alianza revocada'); load(); }
    catch (e) { setToast(e.message || 'Error al revocar'); }
    finally { setActionBusy(false); }
  };

  const incomingPending = items.filter(p => p.status === 'pending' && p.target_org_id === myOrgId).length;

  return (
    <Layout user={user} onLogout={onLogout}>
      <div data-testid="cross-partnerships" style={{ maxWidth: 1000 }}>
        {toast && (
          <div style={{ position: 'fixed', top: 20, right: 20, zIndex: Z.TOAST, padding: '11px 18px', borderRadius: 10, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', color: 'var(--blue)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>
            {toast}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Handshake size={20} color="#818CF8" />
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
                Alianzas cross-org
              </h1>
              {incomingPending > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 9999, background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.35)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: '#FACC15' }}>
                  {incomingPending} pendiente{incomingPending > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(var(--cream-rgb),0.50)', margin: 0 }}>
              Gestiona acuerdos de colaboración con otras organizaciones ({portalName}).
            </p>
          </div>
          <button data-testid="cp-new-btn" onClick={() => setShowCreate(true)}
            style={{ padding: '10px 20px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Plus size={14} /> Nueva alianza
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            ['both', 'Todas', null],
            ['target', 'Recibidas', Inbox],
            ['requester', 'Enviadas', Send],
          ].map(([k, l, Ic]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`cp-tab-${k}`}
              style={{
                padding: '7px 14px', borderRadius: 9999, fontSize: 12.5,
                fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                border: tab === k ? '1px solid rgba(99,102,241,0.55)' : '1px solid rgba(var(--cream-rgb),0.10)',
                background: tab === k ? 'rgba(99,102,241,0.16)' : 'transparent',
                color: tab === k ? '#818CF8' : 'rgba(var(--cream-rgb),0.50)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {Ic && <Ic size={12} />} {l}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {['', 'pending', 'approved', 'rejected', 'revoked'].map(s => (
            <button key={s || 'all'} onClick={() => setStatusFilter(s)}
              data-testid={`cp-status-${s || 'all'}`}
              style={{
                padding: '5px 11px', borderRadius: 9999, fontSize: 11.5,
                fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                border: statusFilter === s ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(var(--cream-rgb),0.08)',
                background: statusFilter === s ? 'rgba(99,102,241,0.10)' : 'transparent',
                color: statusFilter === s ? '#818CF8' : 'rgba(var(--cream-rgb),0.45)',
              }}>
              {s ? STATUS_CFG[s].label : 'Todas'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 70, color: 'rgba(var(--cream-rgb),0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Cargando alianzas…
          </div>
        ) : items.length === 0 ? (
          <div data-testid="cp-empty" style={{ textAlign: 'center', padding: 70, color: 'rgba(var(--cream-rgb),0.40)', fontFamily: 'DM Sans' }}>
            <Handshake size={40} color="rgba(var(--cream-rgb),0.20)" style={{ marginBottom: 12 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', marginBottom: 5 }}>
              Sin alianzas
            </div>
            <div>Solicita tu primera alianza con otra organización.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(p => {
              const isIncoming = p.target_org_id === myOrgId;
              const partnerOrgId = isIncoming ? p.requester_org_id : p.target_org_id;
              const partnerOrgType = isIncoming ? p.requester_org_type : p.target_org_type;
              const canApprove = isIncoming && p.status === 'pending';
              const canRevoke = p.status === 'approved';
              return (
                <div key={p.partnership_id} data-testid={`cp-row-${p.partnership_id}`}
                  style={{
                    padding: '15px 18px', borderRadius: 12,
                    background: 'rgba(var(--cream-rgb),0.03)',
                    border: `1px solid ${p.status === 'pending' && isIncoming ? 'rgba(250,204,21,0.20)' : 'rgba(var(--cream-rgb),0.08)'}`,
                    display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
                  }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isIncoming ? <Inbox size={15} color="#818CF8" /> : <Send size={15} color="#EC4899" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14.5, color: 'var(--cream)' }}>
                        {partnerOrgId}
                      </span>
                      <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid rgba(var(--cream-rgb),0.10)', color: 'rgba(var(--cream-rgb),0.45)', fontFamily: 'DM Sans' }}>
                        {partnerOrgType === 'dev' ? 'Desarrolladora' : 'Inmobiliaria'}
                      </span>
                      <StatusBadge status={p.status} />
                      <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(var(--cream-rgb),0.04)', color: 'rgba(var(--cream-rgb),0.40)', fontFamily: 'DM Sans' }}>
                        {isIncoming ? 'Recibida' : 'Enviada'}
                      </span>
                    </div>
                    {p.commission_pct_default != null && (
                      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.50)', marginBottom: 4 }}>
                        Comisión: {p.commission_pct_default}%
                      </div>
                    )}
                    {p.notes && (
                      <div style={{ padding: '7px 10px', borderRadius: 7, background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid rgba(var(--cream-rgb),0.07)', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.65)', lineHeight: 1.45 }}>
                        {p.notes}
                      </div>
                    )}
                    {p.revoke_reason && (
                      <div style={{ marginTop: 5, fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(var(--cream-rgb),0.40)', fontStyle: 'italic' }}>
                        Revocado: {p.revoke_reason}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {canApprove && (
                      <>
                        <button data-testid={`cp-approve-${p.partnership_id}`} onClick={() => handleApprove(p.partnership_id)} disabled={busy[p.partnership_id]}
                          style={{ padding: '7px 14px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: busy[p.partnership_id] ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, opacity: busy[p.partnership_id] ? 0.7 : 1 }}>
                          <CheckCircle2 size={12} /> Aprobar
                        </button>
                        <button data-testid={`cp-reject-${p.partnership_id}`} onClick={() => setRejectTarget(p.partnership_id)}
                          style={{ padding: '7px 12px', borderRadius: 9999, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: 'var(--red)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <XCircle size={12} /> Rechazar
                        </button>
                      </>
                    )}
                    {canRevoke && (
                      <button data-testid={`cp-revoke-${p.partnership_id}`} onClick={() => setRevokeTarget(p.partnership_id)}
                        style={{ padding: '7px 12px', borderRadius: 9999, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--red)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <RotateCcw size={12} /> Revocar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); setToast('Solicitud enviada'); load(); }} />}
      {rejectTarget && <ReasonModal title="Rechazar alianza" label="Motivo del rechazo" confirmLabel="Rechazar" onClose={() => setRejectTarget(null)} onConfirm={(r) => handleReject(rejectTarget, r)} busy={actionBusy} />}
      {revokeTarget && <ReasonModal title="Revocar alianza" label="Razón de revocación" confirmLabel="Revocar" onClose={() => setRevokeTarget(null)} onConfirm={(r) => handleRevoke(revokeTarget, r)} busy={actionBusy} />}
    </Layout>
  );
}

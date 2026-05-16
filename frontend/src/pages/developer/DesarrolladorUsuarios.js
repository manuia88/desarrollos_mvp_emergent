/**
 * DesarrolladorUsuarios — Phase 4.9 + Phase 14 Batch 37 (B37 internal_users)
 * /desarrollador/usuarios — CRUD team internos con invitation magic link
 */
import React, { useEffect, useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { Users, Plus, X, ChevronDown, Mail, AlertCircle } from 'lucide-react';
import {
  getDevInternalUsers, inviteDevUser, patchDevUser, suspendDevUser, resendDevInvitation,
} from '../../api/internal_users';
import { Z } from '../../styles/zIndex';

const DEV_ROLES = [
  { value: 'developer_director', label: 'Director Comercial' },
  { value: 'developer_advisor', label: 'Asesor' },
  { value: 'developer_obras', label: 'Obras' },
  { value: 'developer_marketing', label: 'Marketing' },
];
const ROLE_LABEL = Object.fromEntries(DEV_ROLES.map(r => [r.value, r.label]));
ROLE_LABEL['developer_admin'] = 'Administrador';
const ROLE_COLOR = {
  developer_admin: '#EC4899', developer_director: '#6366F1',
  developer_advisor: '#22c55e', developer_obras: '#f59e0b', developer_marketing: '#a855f7',
};

const STATUS_CFG = {
  active: { label: 'Activo', color: '#4ADE80', bg: 'rgba(74,222,128,0.10)', bd: 'rgba(74,222,128,0.28)' },
  pending_invitation: { label: 'Invitacion pendiente', color: '#FACC15', bg: 'rgba(250,204,21,0.10)', bd: 'rgba(250,204,21,0.28)' },
  pending: { label: 'Invitacion pendiente', color: '#FACC15', bg: 'rgba(250,204,21,0.10)', bd: 'rgba(250,204,21,0.28)' },
  suspended: { label: 'Suspendido', color: '#F87171', bg: 'rgba(239,68,68,0.08)', bd: 'rgba(239,68,68,0.22)' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending_invitation;
  return <span style={{ padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 700, background: cfg.bg, border: `1px solid ${cfg.bd}`, color: cfg.color }}>{cfg.label}</span>;
}

function InviteModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ email: '', role: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const s = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = { width: '100%', padding: '10px 13px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const lbl = { fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 };

  const submit = async () => {
    if (!form.email.trim() || !form.role) { setErr('Email y rol son requeridos'); return; }
    setBusy(true); setErr('');
    try { onSuccess(await inviteDevUser({ email: form.email.trim(), role: form.role, name: form.name || undefined })); }
    catch (e) { setErr(e.message || 'Error al invitar'); setBusy(false); }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.MODAL, padding: 16 }}>
      <div style={{ background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, width: '100%', maxWidth: 440, padding: '26px 26px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)', margin: 0 }}>Invitar usuario</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.45)' }}><X size={16} /></button>
        </div>
        {err && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 12.5, marginBottom: 12 }}>{err}</div>}
        <div style={{ marginBottom: 13 }}>
          <label style={lbl}>Correo electronico *</label>
          <input data-testid="invite-email" style={inp} type="email" placeholder="usuario@empresa.com" value={form.email} onChange={e => s('email', e.target.value)} />
        </div>
        <div style={{ marginBottom: 13 }}>
          <label style={lbl}>Rol *</label>
          <div style={{ position: 'relative' }}>
            <select data-testid="invite-role" style={{ ...inp, appearance: 'none', paddingRight: 36, cursor: 'pointer' }} value={form.role} onChange={e => s('role', e.target.value)}>
              <option value="">Seleccionar rol</option>
              {DEV_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <ChevronDown size={13} color="rgba(240,235,224,0.38)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Nombre (opcional)</label>
          <input data-testid="invite-name" style={inp} placeholder="Nombre completo" value={form.name} onChange={e => s('name', e.target.value)} maxLength={100} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button data-testid="invite-submit" onClick={submit} disabled={busy} style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Enviando…' : 'Enviar invitacion'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DesarrolladorUsuarios({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await getDevInternalUsers(); setItems(r.items || []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } }, [toast]);

  const handleSuspend = async (email) => {
    setBusy(b => ({ ...b, [email]: true }));
    try { await suspendDevUser(email); setToast('Usuario suspendido'); load(); }
    catch (e) { setToast(e.message || 'Error'); }
    finally { setBusy(b => ({ ...b, [email]: false })); }
  };

  const handleResend = async (invId) => {
    try { await resendDevInvitation(invId); setToast('Invitacion reenviada'); }
    catch (e) { setToast(e.message || 'Error'); }
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div data-testid="desarrollador-usuarios" style={{ maxWidth: 880 }}>
        {toast && <div style={{ position: 'fixed', top: 20, right: 20, zIndex: Z.TOAST, padding: '11px 18px', borderRadius: 10, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', color: '#818CF8', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>{toast}</div>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Users size={20} color="#818CF8" />
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>Equipo</h1>
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.50)', margin: 0 }}>Usuarios internos de tu organización.</p>
          </div>
          <button data-testid="invite-user-btn" onClick={() => setShowInvite(true)} style={{ padding: '10px 20px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Plus size={14} /> Invitar usuario
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando equipo…</div>
        ) : items.length === 0 ? (
          <div data-testid="usuarios-empty" style={{ textAlign: 'center', padding: 60, color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans' }}>
            <Users size={38} color="rgba(240,235,224,0.18)" style={{ marginBottom: 12 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', marginBottom: 5 }}>Sin usuarios invitados</div>
            <div>Invita a tu equipo para darles acceso al portal.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(u => (
              <div key={u.email} data-testid={`user-row-${u.email}`}
                style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(99,102,241,0.22),rgba(236,72,153,0.12))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.09)', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: '#818CF8' }}>{(u.name || u.email || 'U').charAt(0).toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 2 }}>{u.name || u.email}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.45)' }}>{u.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 700, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.22)', color: ROLE_COLOR[u.role] || '#818CF8' }}>
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                  <StatusBadge status={u.status} />
                  {(u.assigned_projects || []).length > 0 && (
                    <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.38)' }}>{u.assigned_projects.length} proyectos</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(u.status === 'pending_invitation' || u.status === 'pending') && u.invitation_id && (
                    <button data-testid={`resend-btn-${u.email}`} onClick={() => handleResend(u.invitation_id)}
                      style={{ padding: '6px 11px', borderRadius: 9999, background: 'rgba(99,102,241,0.09)', border: '1px solid rgba(99,102,241,0.22)', color: '#818CF8', fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Mail size={11} /> Reenviar
                    </button>
                  )}
                  {u.status === 'active' && (
                    <button data-testid={`suspend-btn-${u.email}`} onClick={() => handleSuspend(u.email)} disabled={busy[u.email]}
                      style={{ padding: '6px 11px', borderRadius: 9999, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 11.5, cursor: busy[u.email] ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertCircle size={11} /> Suspender
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onSuccess={() => { setShowInvite(false); setToast('Invitacion enviada'); load(); }} />}
    </DeveloperLayout>
  );
}

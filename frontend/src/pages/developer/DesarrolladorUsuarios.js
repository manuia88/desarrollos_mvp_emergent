/**
 * DesarrolladorUsuarios — Phase 4.9 + Phase 14 (dev slice)
 * /desarrollador/usuarios — CRUD team internos
 */
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, Toast } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import { Users, Plus, X, Shield, CheckCircle } from '../../components/icons';

const ROLES = ['admin', 'commercial_director', 'comercial', 'obras', 'marketing'];
const ROLE_LABELS = {
  admin: 'Administrador', commercial_director: 'Director Comercial',
  comercial: 'Comercial', obras: 'Obras', marketing: 'Marketing',
};
const ROLE_COLOR = {
  admin: '#EC4899', commercial_director: '#6366F1',
  comercial: '#22c55e', obras: '#f59e0b', marketing: '#a855f7',
};
const STATUS_TONE = { active: 'ok', invited: 'warn', disabled: 'neutral' };

export default function DesarrolladorUsuarios({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'comercial' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.listInternalUsers();
      setUsers(r);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const invite = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      const created = await api.createInternalUser(form);
      setToast({ kind: 'success', text: `Invitación enviada a ${form.email}${created.email_sent ? ' (email enviado)' : ' (configura RESEND_API_KEY para envío real)'}` });
      setShowForm(false);
      setForm({ name: '', email: '', role: 'comercial' });
      load();
    } catch (e) {
      setToast({ kind: 'error', text: e.body?.detail || 'Error al invitar' });
    } finally { setSaving(false); }
  };

  const patchUser = async (id, patch) => {
    try {
      await api.patchInternalUser(id, patch);
      setToast({ kind: 'success', text: 'Usuario actualizado' });
      setEditingUser(null);
      load();
    } catch (e) {
      setToast({ kind: 'error', text: e.body?.detail || 'Error al actualizar' });
    }
  };

  const disableUser = async (id) => {
    if (!window.confirm('¿Deshabilitar este usuario?')) return;
    try {
      await api.deleteInternalUser(id);
      setToast({ kind: 'success', text: 'Usuario deshabilitado' });
      load();
    } catch (e) {
      setToast({ kind: 'error', text: e.body?.detail || 'Error' });
    }
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="4.9 · EQUIPO INTERNO"
        title="Gestión de Usuarios"
        sub="Administra los roles y permisos del equipo interno de tu organización."
        actions={
          <button onClick={() => setShowForm(true)} data-testid="invite-user-btn"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px',
              background: 'var(--grad)', border: 'none', borderRadius: 9999,
              color: '#fff', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
            <Plus size={13} /> Invitar miembro
          </button>
        }
      />

      {/* Role legend */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {ROLES.map(r => (
          <div key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${ROLE_COLOR[r]}22`, borderRadius: 8, padding: '5px 12px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: ROLE_COLOR[r] }} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>{ROLE_LABELS[r]}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {users.length === 0 ? (
            <div style={{ padding: '50px 24px', textAlign: 'center' }}>
              <Users size={28} color="var(--cream-4)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)', marginBottom: 8 }}>No hay miembros del equipo todavía</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-4)' }}>Invita a tu equipo para que puedan acceder al portal.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="users-table">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Nombre', 'Email', 'Rol', 'Estado', 'Invitado', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id || i} data-testid={`user-row-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={tdS}>
                      <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13.5, color: 'var(--cream)' }}>{u.name}</div>
                    </td>
                    <td style={{ ...tdS, fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--cream-3)' }}>{u.email}</td>
                    <td style={tdS}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${ROLE_COLOR[u.role] || '#94a3b8'}1a`, color: ROLE_COLOR[u.role] || '#94a3b8', border: `1px solid ${ROLE_COLOR[u.role] || '#94a3b8'}33`, borderRadius: 6, padding: '3px 9px', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600 }}>
                        {u.role === 'admin' && <Shield size={10} />}
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td style={tdS}><Badge tone={STATUS_TONE[u.status] || 'neutral'}>{u.status}</Badge></td>
                    <td style={{ ...tdS, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-4)' }}>
                      {u.ts ? new Date(u.ts).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td style={tdS}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {u.status !== 'disabled' && (
                          <>
                            <button onClick={() => setEditingUser(u)} data-testid={`edit-user-${i}`}
                              style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer' }}>
                              Editar
                            </button>
                            {u.role !== 'admin' && (
                              <button onClick={() => disableUser(u.id)} data-testid={`disable-user-${i}`}
                                style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#f87171', fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer' }}>
                                Deshabilitar
                              </button>
                            )}
                          </>
                        )}
                        {u.status === 'disabled' && <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)' }}>Deshabilitado</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Invite modal */}
      {showForm && (
        <div onClick={() => setShowForm(false)} style={overlay}>
          <div onClick={e => e.stopPropagation()} data-testid="invite-modal" style={modal}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>Invitar miembro</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 4 }}><X size={16} /></button>
            </div>
            {[
              { label: 'Nombre completo', key: 'name', placeholder: 'Ej: Ana García', type: 'text' },
              { label: 'Email corporativo', key: 'email', placeholder: 'ana@constructora.com', type: 'email' },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={lblS}>{label}</div>
                <input type={type} placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  data-testid={`invite-${key}`}
                  style={inputS} />
              </div>
            ))}
            <div style={{ marginBottom: 20 }}>
              <div style={lblS}>Rol</div>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                data-testid="invite-role-select" style={inputS}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', borderRadius: 9, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={invite} disabled={saving || !form.name || !form.email} data-testid="confirm-invite-btn"
                style={{ flex: 2, padding: '10px', borderRadius: 9, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Enviando...' : 'Enviar invitación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit role modal */}
      {editingUser && (
        <div onClick={() => setEditingUser(null)} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={modal}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)', marginBottom: 16 }}>Editar: {editingUser.name}</div>
            <div style={{ marginBottom: 14 }}>
              <div style={lblS}>Rol</div>
              <select defaultValue={editingUser.role}
                onChange={e => setEditingUser(u => ({ ...u, role: e.target.value }))}
                style={inputS}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={lblS}>Estado</div>
              <select defaultValue={editingUser.status}
                onChange={e => setEditingUser(u => ({ ...u, status: e.target.value }))}
                style={inputS}>
                {['active', 'invited', 'disabled'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditingUser(null)} style={{ flex: 1, padding: '10px', borderRadius: 9, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => patchUser(editingUser.id, { role: editingUser.role, status: editingUser.status })}
                style={{ flex: 2, padding: '10px', borderRadius: 9, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <CheckCircle size={13} style={{ marginRight: 5 }} /> Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </DeveloperLayout>
  );
}

const tdS = { padding: '12px 16px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', verticalAlign: 'middle' };
const overlay = { position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,8,15,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modal = { width: '100%', maxWidth: 440, background: '#0D1118', border: '1px solid var(--border)', borderRadius: 18, padding: 24 };
const lblS = { fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 };
const inputS = { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

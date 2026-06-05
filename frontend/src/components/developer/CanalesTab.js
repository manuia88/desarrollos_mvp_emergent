/**
 * CanalesTab — gestión operativa de canales: brokers externos asignados + pre-asignación
 * de asesores in-house. Estilo cockpit (tarjetas blancas). La inteligencia de canales
 * (cockpit) la pinta AreaInsights con BrokerIntel(section='canales') arriba.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  listBrokers, assignBroker, patchBroker,
  listPreassignments, createPreassignment, deletePreassignment, listInternalUsers,
} from '../../api/developer';
import { Users } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const BROKER_TYPE_LABELS = { advisor: 'Asesor externo', developer_admin: 'Admin interno', developer_member: 'Miembro interno' };
const STATUS_CHIP = {
  active: { bg: 'rgba(31,160,106,0.12)', color: '#15803d', label: 'Activo' },
  paused: { bg: 'rgba(226,152,46,0.14)', color: '#B7791F', label: 'Pausado' },
  revoked: { bg: 'rgba(242,99,91,0.14)', color: '#DC2626', label: 'Revocado' },
};

function Toggle({ value, onChange, disabled }) {
  return (
    <div onClick={() => !disabled && onChange(!value)} style={{
      width: 40, height: 23, borderRadius: 999, position: 'relative', flexShrink: 0,
      background: value ? 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' : 'var(--border)',
      cursor: disabled ? 'default' : 'pointer', transition: 'background .2s',
    }}>
      <div style={{ position: 'absolute', top: 2.5, left: value ? 19 : 2.5, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .2s' }} />
    </div>
  );
}

function Card({ title, count, action, children }) {
  return (
    <div className="dmx-card" style={{ background: '#fff', borderRadius: 14, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 4, height: 16, borderRadius: 3, background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' }} />
          <h3 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 15.5, fontWeight: 800, color: 'var(--cream)' }}>{title}</h3>
          {count != null && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme)', background: 'rgba(var(--theme-rgb),0.09)', padding: '2px 9px', borderRadius: 999 }}>{count}</span>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function AssignBrokerModal({ projectId, onClose, onAssigned }) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [commission, setCommission] = useState('3');
  const [saving, setSaving] = useState(false);
  useEffect(() => { listInternalUsers().then(d => setUsers(d?.items || d || [])).catch(() => {}); }, []);

  const handleAssign = async () => {
    if (!selectedUser || !commission) return;
    setSaving(true);
    try {
      await assignBroker(projectId, { broker_user_id: selectedUser, commission_pct: parseFloat(commission), access_level: 'sell' });
      onAssigned(); onClose();
    } catch (e) { alert(e?.message || 'Error al asignar broker'); } finally { setSaving(false); }
  };
  const fld = { width: '100%', background: '#fff', color: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: Z.DRAWER, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="theme-light-scope" style={{ background: '#fff', borderRadius: 16, padding: 26, width: 400, maxWidth: '90vw', boxShadow: '0 18px 48px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>Asignar asesor / broker</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 10.5, color: 'var(--cream-3)', fontWeight: 700, display: 'block', marginBottom: 5 }}>Asesor</label>
            <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} style={fld}>
              <option value="">Selecciona asesor…</option>
              {users.map(u => <option key={u.user_id || u.id} value={u.user_id || u.id}>{u.name || u.email}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10.5, color: 'var(--cream-3)', fontWeight: 700, display: 'block', marginBottom: 5 }}>Comisión %</label>
            <input type="number" min="0" max="15" step="0.5" value={commission} onChange={e => setCommission(e.target.value)} style={fld} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={onClose} style={{ background: '#fff', border: '1px solid var(--border)', color: 'var(--cream-2)', borderRadius: 9, padding: '8px 15px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button data-testid="confirm-assign-broker-btn" onClick={handleAssign} disabled={saving || !selectedUser}
            style={{ background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 18px', fontSize: 12.5, fontWeight: 700, cursor: saving || !selectedUser ? 'default' : 'pointer' }}>
            {saving ? 'Asignando…' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CanalesTab({ devId, user }) {
  const [brokers, setBrokers] = useState([]);
  const [preassigns, setPreassigns] = useState([]);
  const [inHouseUsers, setInHouseUsers] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';

  const load = useCallback(async () => {
    try {
      const [bkrs, pas, inHouse] = await Promise.all([listBrokers(devId), listPreassignments(devId), listInternalUsers()]);
      setBrokers(bkrs?.items || []);
      setPreassigns(pas?.items || []);
      setInHouseUsers(inHouse?.items || inHouse || []);
    } catch (e) { console.error('CanalesTab:', e); }
  }, [devId]);

  useEffect(() => { load(); }, [load]);

  const handleBrokerAction = async (brokerId, action) => {
    try { await patchBroker(devId, brokerId, { status: action === 'pause' ? 'paused' : 'revoked' }); await load(); }
    catch (e) { console.error('Broker action:', e); }
  };
  const handlePreassignToggle = async (userId, assigned) => {
    if (assigned) await deletePreassignment(devId, userId); else await createPreassignment(devId, { user_id: userId });
    await load();
  };

  const avatar = (sz) => ({ width: sz, height: sz, borderRadius: '50%', background: 'rgba(var(--theme-rgb),0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 });

  return (
    <div>
      {/* Brokers externos asignados */}
      <Card title="Brokers externos" count={`${brokers.filter(b => b.status === 'active').length} activos`}
        action={isAdmin && (
          <button data-testid="assign-broker-btn" onClick={() => setShowAssignModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <Users size={13} /> Asignar broker
          </button>
        )}>
        {brokers.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--cream-3)', margin: 0 }}>Sin brokers externos todavía. Asigna uno para que venda tu inventario.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {brokers.map(b => {
              const st = STATUS_CHIP[b.status] || STATUS_CHIP.active;
              const info = b.broker_info || {};
              return (
                <div key={b.id} data-testid={`broker-row-${b.id}`} className="dmx-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', background: '#fff' }}>
                  <div style={avatar(34)}><Users size={15} color="var(--theme)" /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{info.name || info.email || b.broker_user_id}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>{BROKER_TYPE_LABELS[info.role] || 'Broker'} · {b.commission_pct}% comisión</div>
                  </div>
                  <span style={{ background: st.bg, color: st.color, fontSize: 10.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999 }}>{st.label}</span>
                  {isAdmin && b.status === 'active' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleBrokerAction(b.id, 'pause')} style={{ background: '#fff', border: '1px solid var(--border)', color: 'var(--cream-3)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Pausar</button>
                      <button onClick={() => handleBrokerAction(b.id, 'revoke')} style={{ background: '#fff', border: '1px solid var(--border)', color: '#DC2626', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Revocar</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Pre-asignar asesores in-house */}
      {isAdmin && (
        <Card title="Tu equipo in-house">
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--cream-3)' }}>
            Marca los asesores que vienen con acceso a este proyecto. Al invitar a un nuevo asesor, hereda los proyectos marcados aquí.
          </p>
          {inHouseUsers.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--cream-3)', margin: 0 }}>Sin asesores in-house registrados todavía.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {inHouseUsers.map(u => {
                const assigned = preassigns.some(p => p.assigned_user_id === (u.user_id || u.id));
                return (
                  <div key={u.user_id || u.id} data-testid={`preassign-row-${u.user_id || u.id}`} className="dmx-card"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', background: assigned ? 'rgba(var(--theme-rgb),0.05)' : '#fff', border: `1.5px solid ${assigned ? 'var(--theme)' : 'var(--border)'}` }}>
                    <div style={avatar(30)}><Users size={14} color="var(--theme)" /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 700 }}>{u.name || u.email}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>{u.role || 'developer_member'}</div>
                    </div>
                    <span style={{ fontSize: 11.5, color: assigned ? 'var(--theme)' : 'var(--cream-3)', fontWeight: 700 }}>{assigned ? 'En el proyecto' : 'Fuera'}</span>
                    <Toggle value={assigned} onChange={() => handlePreassignToggle(u.user_id || u.id, assigned)} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {showAssignModal && <AssignBrokerModal projectId={devId} onClose={() => setShowAssignModal(false)} onAssigned={load} />}
    </div>
  );
}

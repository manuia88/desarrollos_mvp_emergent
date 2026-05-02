/**
 * Phase 4 Batch 11 — Sub-chunk B
 * ComercializacionTab — política comercial + brokers + pre-asignaciones
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  getCommercialization, patchCommercialization,
  listBrokers, assignBroker, patchBroker,
  listPreassignments, createPreassignment, deletePreassignment,
  listInternalUsers, listProjectsWithStats,
} from '../../api/developer';
import InlineEditField from '../shared/InlineEditField';
import { Users, Check } from '../../components/icons';

const BROKER_TYPE_LABELS = {
  advisor: 'Asesor externo',
  developer_admin: 'Admin interno',
  developer_member: 'Miembro interno',
};

const BROKER_STATUS_COLORS = {
  active:  { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
  paused:  { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
  revoked: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
};

function Toggle({ value, onChange, label, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'default' : 'pointer' }}>
      <div
        onClick={() => !disabled && onChange(!value)}
        style={{
          width: 42, height: 24, borderRadius: 12, position: 'relative',
          background: value ? 'var(--cream)' : 'rgba(240,235,224,0.15)',
          border: `1.5px solid ${value ? 'var(--cream)' : 'rgba(240,235,224,0.25)'}`,
          transition: 'all 0.2s', cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: value ? 20 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: value ? 'var(--navy)' : 'rgba(240,235,224,0.4)',
          transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--cream-2)' }}>{label}</span>
    </label>
  );
}

function AssignBrokerModal({ projectId, onClose, onAssigned }) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [commission, setCommission] = useState('3');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listInternalUsers().then(d => setUsers(d?.items || d || [])).catch(() => {});
  }, []);

  const handleAssign = async () => {
    if (!selectedUser || !commission) return;
    setSaving(true);
    try {
      await assignBroker(projectId, {
        broker_user_id: selectedUser,
        commission_pct: parseFloat(commission),
        access_level: 'sell',
      });
      onAssigned();
      onClose();
    } catch (e) {
      alert(e?.message || 'Error al asignar broker');
    } finally { setSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.85)', zIndex: 1500,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--navy)', border: '1px solid rgba(240,235,224,0.18)',
        borderRadius: 14, padding: 28, width: 400, maxWidth: '90vw',
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
          Asignar asesor/broker
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--cream-3)', display: 'block', marginBottom: 5 }}>Asesor</label>
            <select
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
              style={{
                width: '100%', background: 'rgba(240,235,224,0.06)', color: 'var(--cream)',
                border: '1px solid rgba(240,235,224,0.14)', borderRadius: 8,
                padding: '8px 10px', fontSize: 13,
              }}
            >
              <option value="" style={{ background: 'var(--navy)' }}>Selecciona asesor…</option>
              {users.map(u => (
                <option key={u.user_id || u.id} value={u.user_id || u.id} style={{ background: 'var(--navy)' }}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--cream-3)', display: 'block', marginBottom: 5 }}>Comisión %</label>
            <input
              type="number" min="0" max="15" step="0.5"
              value={commission} onChange={e => setCommission(e.target.value)}
              style={{
                width: '100%', background: 'rgba(240,235,224,0.06)', color: 'var(--cream)',
                border: '1px solid rgba(240,235,224,0.14)', borderRadius: 8,
                padding: '8px 10px', fontSize: 13, boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(240,235,224,0.12)', color: 'var(--cream-2)', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            data-testid="confirm-assign-broker-btn"
            onClick={handleAssign} disabled={saving || !selectedUser}
            style={{
              background: 'var(--cream)', color: 'var(--navy)', border: 'none',
              borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700,
              cursor: saving || !selectedUser ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Asignando…' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ComercializacionTab({ devId, user }) {
  const [config, setConfig] = useState(null);
  const [brokers, setBrokers] = useState([]);
  const [preassigns, setPreassigns] = useState([]);
  const [inHouseUsers, setInHouseUsers] = useState([]);
  const [otherProjects, setOtherProjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);

  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';

  const load = useCallback(async () => {
    try {
      const [cfg, bkrs, pas, inHouse] = await Promise.all([
        getCommercialization(devId),
        listBrokers(devId),
        listPreassignments(devId),
        listInternalUsers(),
      ]);
      setConfig(cfg);
      setBrokers(bkrs?.items || []);
      setPreassigns(pas?.items || []);
      setInHouseUsers(inHouse?.items || inHouse || []);
    } catch (e) { console.error('ComercializacionTab:', e); }
  }, [devId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    listProjectsWithStats().then(all => setOtherProjects((all || []).filter(p => p.id !== devId))).catch(() => {});
  }, [devId]);

  const saveConfig = async (patch) => {
    setSaving(true);
    try {
      const updated = await patchCommercialization(devId, patch);
      setConfig(updated);
    } catch (e) { console.error('Save config:', e); }
    finally { setSaving(false); }
  };

  const applyFrom = async (projectId) => {
    try {
      const other = await getCommercialization(projectId);
      const { works_with_brokers, default_commission_pct, iva_included, in_house_only, broker_terms } = other;
      await saveConfig({ works_with_brokers, default_commission_pct, iva_included, in_house_only, broker_terms });
      setShowDefaults(false);
    } catch (e) { console.error('Apply defaults:', e); }
  };

  const handleBrokerAction = async (brokerId, action) => {
    try {
      await patchBroker(devId, brokerId, { status: action === 'pause' ? 'paused' : 'revoked' });
      await load();
    } catch (e) { console.error('Broker action:', e); }
  };

  const handlePreassignToggle = async (userId, currentlyAssigned) => {
    if (currentlyAssigned) {
      await deletePreassignment(devId, userId);
    } else {
      await createPreassignment(devId, { user_id: userId });
    }
    await load();
  };

  if (!config) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>Cargando política comercial…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Section 1: Política comercial */}
      <div style={{ background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.1)', borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
            Política comercial
          </h3>
          {isAdmin && otherProjects.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                data-testid="comercial-defaults-btn"
                onClick={() => setShowDefaults(!showDefaults)}
                style={{ background: 'rgba(240,235,224,0.07)', color: 'var(--cream-2)', border: '1px solid rgba(240,235,224,0.12)', borderRadius: 7, padding: '5px 11px', fontSize: 11, cursor: 'pointer' }}
              >
                Aplicar desde otro proyecto ↓
              </button>
              {showDefaults && (
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, marginTop: 4, background: 'rgba(6,8,15,0.97)', border: '1px solid rgba(240,235,224,0.16)', borderRadius: 10, overflow: 'hidden', minWidth: 200, boxShadow: '0 16px 40px rgba(0,0,0,0.4)' }}>
                  {otherProjects.map(p => (
                    <button key={p.id} onClick={() => applyFrom(p.id)}
                      style={{ width: '100%', background: 'none', border: 'none', padding: '8px 14px', textAlign: 'left', cursor: 'pointer', color: 'var(--cream)', fontSize: 12 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,235,224,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Toggle
            value={config.works_with_brokers}
            onChange={v => isAdmin && saveConfig({ works_with_brokers: v })}
            label="Trabajar con brokers externos"
            disabled={!isAdmin || saving}
          />

          {config.works_with_brokers && (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginLeft: 52 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--cream-3)', display: 'block', marginBottom: 4 }}>Comisión default %</label>
                  <InlineEditField
                    value={String(config.default_commission_pct || 3)}
                    type="number"
                    onSave={v => saveConfig({ default_commission_pct: parseFloat(v) })}
                    canEdit={isAdmin}
                    style={{ fontSize: 16, fontWeight: 700, color: 'var(--cream)' }}
                  />
                </div>
                <Toggle
                  value={config.iva_included}
                  onChange={v => isAdmin && saveConfig({ iva_included: v })}
                  label="Incluye IVA"
                  disabled={!isAdmin || saving}
                />
              </div>
              <div style={{ marginLeft: 52 }}>
                <label style={{ fontSize: 11, color: 'var(--cream-3)', display: 'block', marginBottom: 4 }}>Términos comerciales</label>
                <InlineEditField
                  value={config.broker_terms || ''}
                  type="textarea"
                  placeholder="Describe las condiciones para brokers externos…"
                  onSave={v => saveConfig({ broker_terms: v })}
                  canEdit={isAdmin}
                  style={{ fontSize: 12, color: 'var(--cream-2)' }}
                />
              </div>
            </>
          )}

          <Toggle
            value={config.in_house_only}
            onChange={v => isAdmin && saveConfig({ in_house_only: v })}
            label="Solo asesores in-house (excluye externos)"
            disabled={!isAdmin || saving}
          />
        </div>
      </div>

      {/* Section 2: Brokers asignados */}
      <div style={{ background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.1)', borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
            Brokers asignados
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--cream-3)', fontWeight: 400 }}>
              ({brokers.filter(b => b.status === 'active').length} activos)
            </span>
          </h3>
          {isAdmin && (
            <button
              data-testid="assign-broker-btn"
              onClick={() => setShowAssignModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(240,235,224,0.10)', color: 'var(--cream)',
                border: '1px solid rgba(240,235,224,0.16)', borderRadius: 8,
                padding: '6px 12px', fontSize: 12, cursor: 'pointer',
              }}
            >
              <Users size={13} /> + Asignar broker
            </button>
          )}
        </div>

        {brokers.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--cream-3)', margin: 0 }}>Sin brokers asignados todavía.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {brokers.map(b => {
              const st = BROKER_STATUS_COLORS[b.status] || BROKER_STATUS_COLORS.active;
              const info = b.broker_info || {};
              return (
                <div key={b.id} data-testid={`broker-row-${b.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'rgba(240,235,224,0.03)', borderRadius: 8, border: '1px solid rgba(240,235,224,0.07)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(240,235,224,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Users size={14} color="rgba(240,235,224,0.4)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{info.name || info.email || b.broker_user_id}</div>
                    <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{BROKER_TYPE_LABELS[info.role] || 'Broker'} · {b.commission_pct}% comisión</div>
                  </div>
                  <span style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{b.status}</span>
                  {isAdmin && b.status === 'active' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleBrokerAction(b.id, 'pause')} style={{ background: 'none', border: '1px solid rgba(240,235,224,0.1)', color: 'var(--cream-3)', borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>Pausar</button>
                      <button onClick={() => handleBrokerAction(b.id, 'revoke')} style={{ background: 'none', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>Revocar</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3: Pre-asignaciones in-house (admin only) */}
      {isAdmin && (
        <div style={{ background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.1)', borderRadius: 12, padding: '18px 20px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
            Pre-asignar asesores in-house
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--cream-3)' }}>
            Cuando invites a un nuevo asesor, automáticamente obtendrá acceso a los proyectos marcados aquí.
          </p>
          {inHouseUsers.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--cream-3)', margin: 0 }}>Sin asesores in-house registrados.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {inHouseUsers.map(u => {
                const isAssigned = preassigns.some(p => p.assigned_user_id === (u.user_id || u.id));
                return (
                  <div key={u.user_id || u.id} data-testid={`preassign-row-${u.user_id || u.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: isAssigned ? 'rgba(240,235,224,0.06)' : 'rgba(240,235,224,0.02)', borderRadius: 8, border: `1px solid ${isAssigned ? 'rgba(240,235,224,0.16)' : 'rgba(240,235,224,0.06)'}`, transition: 'all 0.12s' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(240,235,224,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Users size={13} color="rgba(240,235,224,0.4)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--cream)', fontWeight: isAssigned ? 600 : 400 }}>{u.name || u.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{u.role || 'developer_member'}</div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <div
                        onClick={() => handlePreassignToggle(u.user_id || u.id, isAssigned)}
                        style={{
                          width: 36, height: 20, borderRadius: 10, position: 'relative',
                          background: isAssigned ? 'var(--cream)' : 'rgba(240,235,224,0.12)',
                          border: `1.5px solid ${isAssigned ? 'var(--cream)' : 'rgba(240,235,224,0.2)'}`,
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ position: 'absolute', top: 2, left: isAssigned ? 16 : 2, width: 12, height: 12, borderRadius: '50%', background: isAssigned ? 'var(--navy)' : 'rgba(240,235,224,0.4)', transition: 'left 0.15s' }} />
                      </div>
                      <span style={{ fontSize: 11, color: isAssigned ? 'var(--cream)' : 'var(--cream-3)' }}>
                        {isAssigned ? 'Pre-asignado' : 'No asignado'}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showAssignModal && (
        <AssignBrokerModal
          projectId={devId}
          onClose={() => setShowAssignModal(false)}
          onAssigned={load}
        />
      )}
    </div>
  );
}

// Phase 13 · Batch 36 — DesarrolladorSolicitudes
// Lista y gestión de solicitudes de acceso al inventario por parte de asesores
import React, { useEffect, useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import {
  Users, Clock, CheckCircle2, XCircle, RotateCcw, ChevronDown,
  AlertCircle, Eye,
} from 'lucide-react';
import {
  getDevWhitelistAll,
  approveWhitelistRequest,
  rejectWhitelistRequest,
  revokeWhitelistAccess,
  bulkApproveWhitelistRequests,
} from '../../api/advisor_whitelist';
import { Z } from '../../styles/zIndex';

const STATUS_CONFIG = {
  pending: {
    label: 'Pendiente', color: '#FACC15',
    bg: 'rgba(250,204,21,0.10)', bd: 'rgba(250,204,21,0.35)',
  },
  approved: {
    label: 'Aprobado', color: 'var(--green)',
    bg: 'rgba(74,222,128,0.10)', bd: 'rgba(74,222,128,0.35)',
  },
  rejected: {
    label: 'Rechazado', color: 'var(--red)',
    bg: 'rgba(239,68,68,0.08)', bd: 'rgba(239,68,68,0.30)',
  },
  revoked: {
    label: 'Revocado', color: 'var(--red)',
    bg: 'rgba(239,68,68,0.08)', bd: 'rgba(239,68,68,0.30)',
  },
};

const STATUS_FILTERS = ['', 'pending', 'approved', 'rejected', 'revoked'];
const STATUS_FILTER_LABELS = {
  '': 'Todas', pending: 'Pendiente', approved: 'Aprobado',
  rejected: 'Rechazado', revoked: 'Revocado',
};

function TrustScoreBadge({ score }) {
  const color = score >= 70 ? '#4ADE80' : score >= 40 ? '#FACC15' : '#F87171';
  const bg = score >= 70 ? 'rgba(74,222,128,0.08)' : score >= 40 ? 'rgba(250,204,21,0.08)' : 'rgba(239,68,68,0.08)';
  const bd = score >= 70 ? 'rgba(74,222,128,0.30)' : score >= 40 ? 'rgba(250,204,21,0.30)' : 'rgba(239,68,68,0.25)';
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 9999, fontSize: 11.5,
      fontFamily: 'DM Sans', fontWeight: 700,
      background: bg, border: `1px solid ${bd}`, color,
    }}>
      Trust {score}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 9999, fontSize: 11.5,
      fontFamily: 'DM Sans', fontWeight: 700,
      background: cfg.bg, border: `1px solid ${cfg.bd}`, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

function RejectModal({ onClose, onConfirm, busy }) {
  const [motivo, setMotivo] = useState('');
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(var(--bg-rgb),0.80)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: Z.DRAWER, padding: 16,
      }}
    >
      <div style={{
        background: 'rgba(var(--bg-rgb),0.97)',
        border: '1px solid rgba(var(--cream-rgb),0.10)',
        borderRadius: 16, width: '100%', maxWidth: 440, padding: 26,
      }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '0 0 14px' }}>
          Rechazar solicitud
        </h3>
        <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
          Motivo *
        </label>
        <textarea
          data-testid="reject-motivo-input"
          style={{
            width: '100%', padding: '10px 13px', borderRadius: 9,
            background: 'rgba(var(--cream-rgb),0.06)',
            border: '1px solid rgba(var(--cream-rgb),0.10)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
            minHeight: 70, resize: 'vertical', boxSizing: 'border-box', marginBottom: 16,
          }}
          placeholder="Describe el motivo del rechazo para informar al asesor..."
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          maxLength={500}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: 9999, background: 'transparent',
              border: '1px solid rgba(var(--cream-rgb),0.12)', color: 'rgba(var(--cream-rgb),0.55)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
            Cancelar
          </button>
          <button
            data-testid="reject-confirm-btn"
            onClick={() => onConfirm(motivo)} disabled={busy || motivo.trim().length < 3}
            style={{
              padding: '9px 18px', borderRadius: 9999,
              background: 'rgba(239,68,68,0.80)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
              cursor: busy || motivo.trim().length < 3 ? 'not-allowed' : 'pointer',
              opacity: busy || motivo.trim().length < 3 ? 0.6 : 1,
            }}>
            {busy ? 'Rechazando…' : 'Rechazar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RevokeModal({ onClose, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(var(--bg-rgb),0.80)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: Z.DRAWER, padding: 16,
      }}
    >
      <div style={{
        background: 'rgba(var(--bg-rgb),0.97)',
        border: '1px solid rgba(var(--cream-rgb),0.10)',
        borderRadius: 16, width: '100%', maxWidth: 440, padding: 26,
      }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '0 0 14px' }}>
          Revocar acceso
        </h3>
        <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
          Razon de revocacion *
        </label>
        <textarea
          data-testid="revoke-reason-input"
          style={{
            width: '100%', padding: '10px 13px', borderRadius: 9,
            background: 'rgba(var(--cream-rgb),0.06)',
            border: '1px solid rgba(var(--cream-rgb),0.10)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
            minHeight: 70, resize: 'vertical', boxSizing: 'border-box', marginBottom: 16,
          }}
          placeholder="Razon por la que se revoca el acceso..."
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={500}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: 9999, background: 'transparent',
              border: '1px solid rgba(var(--cream-rgb),0.12)', color: 'rgba(var(--cream-rgb),0.55)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
            Cancelar
          </button>
          <button
            data-testid="revoke-confirm-btn"
            onClick={() => onConfirm(reason)} disabled={busy || reason.trim().length < 3}
            style={{
              padding: '9px 18px', borderRadius: 9999,
              background: 'rgba(239,68,68,0.80)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
              cursor: busy || reason.trim().length < 3 ? 'not-allowed' : 'pointer',
              opacity: busy || reason.trim().length < 3 ? 0.6 : 1,
            }}>
            {busy ? 'Revocando…' : 'Revocar acceso'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DesarrolladorSolicitudes({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [busy, setBusy] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [rejectTarget, setRejectTarget] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getDevWhitelistAll(filterStatus || undefined);
      setItems(r.items || []);
    } catch (err) {
      console.error('[DesarrolladorSolicitudes] load error', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } }, [toast]);

  const showToast = (msg) => setToast(msg);

  const handleApprove = async (authId) => {
    setBusy(b => ({ ...b, [authId]: true }));
    try {
      await approveWhitelistRequest(authId);
      showToast('Acceso aprobado');
      load();
    } catch (e) {
      showToast(e.response?.data?.detail || e.message || 'Error al aprobar');
    } finally {
      setBusy(b => ({ ...b, [authId]: false }));
    }
  };

  const handleReject = async (authId, comentario) => {
    setActionBusy(true);
    try {
      await rejectWhitelistRequest(authId, comentario);
      setRejectTarget(null);
      showToast('Solicitud rechazada');
      load();
    } catch (e) {
      showToast(e.response?.data?.detail || e.message || 'Error al rechazar');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRevoke = async (authId, reason) => {
    setActionBusy(true);
    try {
      await revokeWhitelistAccess(authId, reason);
      setRevokeTarget(null);
      showToast('Acceso revocado');
      load();
    } catch (e) {
      showToast(e.response?.data?.detail || e.message || 'Error al revocar');
    } finally {
      setActionBusy(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    setActionBusy(true);
    try {
      const ids = [...selected];
      const r = await bulkApproveWhitelistRequests(ids);
      showToast(`${r.approved?.length || 0} solicitudes aprobadas`);
      setSelected(new Set());
      load();
    } catch (e) {
      showToast(e.response?.data?.detail || e.message || 'Error en aprobacion masiva');
    } finally {
      setActionBusy(false);
    }
  };

  const pendingCount = items.filter(i => i.status === 'pending').length;

  const toggleSelect = (id) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pendingIds = items.filter(i => i.status === 'pending').map(i => i.auth_id);
    if (selected.size === pendingIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingIds));
    }
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div data-testid="desarrollador-solicitudes" style={{ maxWidth: 980 }}>

        {/* Toast */}
        {toast && (
          <div data-testid="solicitudes-toast" style={{
            position: 'fixed', top: 20, right: 20, zIndex: Z.TOAST,
            padding: '11px 18px', borderRadius: 10,
            background: 'rgba(99,102,241,0.18)',
            border: '1px solid rgba(99,102,241,0.35)',
            color: 'var(--blue)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            backdropFilter: 'blur(24px)',
          }}>
            {toast}
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Users size={20} color="#818CF8" />
              <h1 style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
                color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em',
              }}>
                Solicitudes de Acceso
              </h1>
              {pendingCount > 0 && (
                <span style={{
                  padding: '3px 10px', borderRadius: 9999,
                  background: 'rgba(250,204,21,0.12)',
                  border: '1px solid rgba(250,204,21,0.35)',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: '#FACC15',
                }}>
                  {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(var(--cream-rgb),0.50)', margin: 0 }}>
              Asesores que solicitan acceso a tu inventario exclusivo.
            </p>
          </div>

          {/* Bulk approve */}
          {selected.size > 0 && (
            <button
              data-testid="bulk-approve-btn"
              onClick={handleBulkApprove}
              disabled={actionBusy}
              style={{
                padding: '10px 20px', borderRadius: 9999,
                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                border: 'none', color: '#fff',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                cursor: actionBusy ? 'wait' : 'pointer', opacity: actionBusy ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              <CheckCircle2 size={14} />
              Aprobar {selected.size} seleccionadas
            </button>
          )}
        </div>

        {/* Status filter chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(s => (
            <button
              key={s || 'all'}
              data-testid={`filter-solicitudes-${s || 'all'}`}
              onClick={() => { setFilterStatus(s); setSelected(new Set()); }}
              style={{
                padding: '6px 13px', borderRadius: 9999, fontSize: 12,
                fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                border: filterStatus === s ? '1px solid rgba(99,102,241,0.55)' : '1px solid rgba(var(--cream-rgb),0.10)',
                background: filterStatus === s ? 'rgba(99,102,241,0.16)' : 'transparent',
                color: filterStatus === s ? '#818CF8' : 'rgba(var(--cream-rgb),0.50)',
              }}
            >
              {STATUS_FILTER_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Bulk select header */}
        {filterStatus === 'pending' && items.filter(i => i.status === 'pending').length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(var(--cream-rgb),0.03)',
            border: '1px solid rgba(var(--cream-rgb),0.08)',
          }}>
            <input
              data-testid="select-all-checkbox"
              type="checkbox"
              checked={selected.size === items.filter(i => i.status === 'pending').length && items.filter(i => i.status === 'pending').length > 0}
              onChange={toggleSelectAll}
              style={{ accentColor: '#6366F1', width: 14, height: 14, cursor: 'pointer' }}
            />
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.50)' }}>
              Seleccionar todas ({items.filter(i => i.status === 'pending').length} pendientes)
            </span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 70, color: 'rgba(var(--cream-rgb),0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Cargando solicitudes…
          </div>
        ) : items.length === 0 ? (
          <div data-testid="solicitudes-empty" style={{
            textAlign: 'center', padding: 70,
            color: 'rgba(var(--cream-rgb),0.40)', fontFamily: 'DM Sans',
          }}>
            <Users size={40} color="rgba(var(--cream-rgb),0.20)" style={{ marginBottom: 14 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', marginBottom: 6 }}>
              Sin solicitudes
            </div>
            <div>No hay solicitudes con el filtro seleccionado.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(item => {
              const isPending = item.status === 'pending';
              const isApproved = item.status === 'approved';
              const waitingDays = item.requested_at
                ? Math.floor((Date.now() - new Date(item.requested_at).getTime()) / 86400000)
                : 0;
              return (
                <div
                  key={item.auth_id}
                  data-testid={`solicitud-row-${item.auth_id}`}
                  style={{
                    padding: '16px 18px', borderRadius: 12,
                    background: 'rgba(var(--cream-rgb),0.03)',
                    border: `1px solid ${isPending ? 'rgba(250,204,21,0.20)' : 'rgba(var(--cream-rgb),0.08)'}`,
                    display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
                  }}
                >
                  {/* Checkbox (pending only) */}
                  {isPending && (
                    <div style={{ paddingTop: 2 }}>
                      <input
                        data-testid={`select-${item.auth_id}`}
                        type="checkbox"
                        checked={selected.has(item.auth_id)}
                        onChange={() => toggleSelect(item.auth_id)}
                        style={{ accentColor: '#6366F1', width: 14, height: 14, cursor: 'pointer' }}
                      />
                    </div>
                  )}

                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: item.asesor_picture
                      ? `url(${item.asesor_picture}) center/cover no-repeat`
                      : 'linear-gradient(135deg,rgba(99,102,241,0.25),rgba(236,72,153,0.15))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(var(--cream-rgb),0.10)',
                  }}>
                    {!item.asesor_picture && (
                      <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--blue)' }}>
                        {(item.asesor_name || 'A').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14.5, color: 'var(--cream)' }}>
                        {item.asesor_name || item.asesor_id}
                      </span>
                      <TrustScoreBadge score={item.asesor_trust_score || 0} />
                      <StatusBadge status={item.status} />
                      {isPending && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.40)',
                        }}>
                          <Clock size={10} /> {waitingDays}d esperando
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.50)', marginBottom: 6 }}>
                      {item.asesor_email}
                    </div>
                    {item.solicitud?.motivo && (
                      <div style={{
                        padding: '7px 10px', borderRadius: 7,
                        background: 'rgba(var(--cream-rgb),0.03)',
                        border: '1px solid rgba(var(--cream-rgb),0.07)',
                        fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.65)',
                        lineHeight: 1.45, marginBottom: 4,
                      }}>
                        {item.solicitud.motivo}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {item.solicitud?.experiencia_colonia && (
                        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.40)' }}>
                          Zona: {item.solicitud.experiencia_colonia}
                        </span>
                      )}
                      {item.solicitud?.clientes_interesados_count > 0 && (
                        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.40)' }}>
                          Clientes interesados: {item.solicitud.clientes_interesados_count}
                        </span>
                      )}
                    </div>
                    {item.comentario_decision && (
                      <div style={{
                        marginTop: 5, fontFamily: 'DM Sans', fontSize: 11.5,
                        color: 'rgba(var(--cream-rgb),0.40)', fontStyle: 'italic',
                      }}>
                        Decision: {item.comentario_decision}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                    {isPending && (
                      <>
                        <button
                          data-testid={`approve-btn-${item.auth_id}`}
                          onClick={() => handleApprove(item.auth_id)}
                          disabled={busy[item.auth_id]}
                          style={{
                            padding: '7px 14px', borderRadius: 9999,
                            background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                            border: 'none', color: '#fff',
                            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                            cursor: busy[item.auth_id] ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 5,
                            opacity: busy[item.auth_id] ? 0.7 : 1,
                          }}
                        >
                          <CheckCircle2 size={12} />
                          {busy[item.auth_id] ? 'Aprobando…' : 'Aprobar'}
                        </button>
                        <button
                          data-testid={`reject-btn-${item.auth_id}`}
                          onClick={() => setRejectTarget(item.auth_id)}
                          style={{
                            padding: '7px 12px', borderRadius: 9999,
                            background: 'rgba(239,68,68,0.10)',
                            border: '1px solid rgba(239,68,68,0.30)',
                            color: 'var(--red)',
                            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          <XCircle size={12} /> Rechazar
                        </button>
                      </>
                    )}
                    {isApproved && (
                      <button
                        data-testid={`revoke-btn-${item.auth_id}`}
                        onClick={() => setRevokeTarget(item.auth_id)}
                        style={{
                          padding: '7px 12px', borderRadius: 9999,
                          background: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.25)',
                          color: 'var(--red)',
                          fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
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

      {/* Reject Modal */}
      {rejectTarget && (
        <RejectModal
          onClose={() => setRejectTarget(null)}
          onConfirm={(motivo) => handleReject(rejectTarget, motivo)}
          busy={actionBusy}
        />
      )}

      {/* Revoke Modal */}
      {revokeTarget && (
        <RevokeModal
          onClose={() => setRevokeTarget(null)}
          onConfirm={(reason) => handleRevoke(revokeTarget, reason)}
          busy={actionBusy}
        />
      )}
    </DeveloperLayout>
  );
}

// /desarrollador/inventario — D1 Inventory CRUD + Bulk Upload + Unit Holds
import React, { useEffect, useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmtMXN, Toast } from '../../components/advisor/primitives';
import BulkUploadModal from '../../components/developer/BulkUploadModal';
import * as api from '../../api/developer';
import { Link } from 'react-router-dom';
import { FileText, ArrowRight, Upload, Clock, X } from '../../components/icons';
import { usePresentationMode } from '../../hooks/usePresentationMode';
import { blurPriceCSS } from '../../lib/anonymize';

const STATUSES = ['disponible', 'apartado', 'reservado', 'vendido', 'bloqueado'];
const TONE = { disponible: 'ok', apartado: 'warn', reservado: 'pink', vendido: 'neutral', bloqueado: 'bad' };
const HOLD_HOURS = [24, 48, 72];

function useCountdown(expiresAt) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
      setRemaining(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

function CountdownBadge({ expiresAt }) {
  const sec = useCountdown(expiresAt);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const fmt = `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: sec < 3600 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
      color: sec < 3600 ? '#fca5a5' : '#fcd34d',
      border: `1px solid ${sec < 3600 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
      borderRadius: 6, padding: '2px 8px', fontFamily: 'DM Mono, monospace', fontSize: 10.5,
    }}>
      <Clock size={9} /> {fmt}
    </span>
  );
}

export default function DesarrolladorInventario({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [toast, setToast] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [holdModal, setHoldModal] = useState(null); // { unit, dev_id }
  const [holdHours, setHoldHours] = useState(24);

  // B19 Sub-C — Presentation mode
  const { isActive: pmActive, config: pmConfig } = usePresentationMode();
  const [holdReason, setHoldReason] = useState('');
  const [holdLoading, setHoldLoading] = useState(false);
  const [holds, setHolds] = useState({}); // unit_id → hold

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listInventory();
      setItems(r);
      if (r.length && !activeId) setActiveId(r[0].id);
      // Load active holds for all units in visible devs
      try {
        const allHolds = await api.listHolds();
        const holdMap = {};
        (allHolds || []).forEach(h => { holdMap[h.unit_id] = h; });
        setHolds(holdMap);
      } catch {}
    } finally { setLoading(false); }
  // eslint-disable-next-line
  }, []);

  useEffect(() => { load(); }, [load]);

  const dev = items.find(d => d.id === activeId);

  const updateStatus = async (status) => {
    if (!editing) return;
    try {
      await api.patchUnitStatus({ dev_id: editing.dev_id, unit_id: editing.unit.id, status });
      setToast({ kind: 'success', text: `Unidad ${editing.unit.unit_number} → ${status}` });
      setEditing(null);
      load();
    } catch { setToast({ kind: 'error', text: 'Error al actualizar' }); }
  };

  const createHold = async () => {
    if (!holdModal) return;
    setHoldLoading(true);
    try {
      await api.createHold(holdModal.unit.id, {
        dev_id: holdModal.dev_id,
        hours: holdHours,
        reason: holdReason,
      });
      setToast({ kind: 'success', text: `Unidad ${holdModal.unit.unit_number} apartada ${holdHours}h` });
      setHoldModal(null);
      setHoldReason('');
      load();
    } catch (e) {
      setToast({ kind: 'error', text: e.body?.detail || 'Error al apartar' });
    } finally { setHoldLoading(false); }
  };

  const releaseHold = async (unit, devId) => {
    try {
      await api.releaseHold(unit.id, devId);
      setToast({ kind: 'success', text: `Apartado liberado: ${unit.unit_number}` });
      load();
    } catch (e) {
      setToast({ kind: 'error', text: e.body?.detail || 'Error al liberar' });
    }
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="D1 · INVENTARIO TIEMPO REAL"
        title="Inventario"
        sub="Status por unidad, overrides auditados, apartados temporales. Click en una unidad para cambiar status."
        actions={
          <button onClick={() => setShowBulk(true)} data-testid="bulk-upload-btn"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px',
              background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 9999, color: '#a5b4fc', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
            <Upload size={13} /> Bulk Upload
          </button>
        }
      />

      {loading ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 14 }} className="inv-grid">
            <Card style={{ padding: 8, height: 'fit-content' }}>
              {items.map(d => (
                <button key={d.id} onClick={() => setActiveId(d.id)} data-testid={`inv-dev-${d.id}`} style={{
                  width: '100%', textAlign: 'left',
                  padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                  background: d.id === activeId ? 'rgba(236,72,153,0.10)' : 'transparent',
                  border: `1px solid ${d.id === activeId ? 'rgba(236,72,153,0.3)' : 'transparent'}`,
                  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}>
                  <div>{d.name}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
                    {d.units_total} unidades · {d.colonia}
                  </div>
                </button>
              ))}
            </Card>

            {dev && (
              <Card style={{ padding: 0, overflow: 'auto' }}>
                <div style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em' }}>{dev.name}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
                        {dev.colonia} · entrega {dev.delivery_estimate} · obra {dev.construction_progress?.percentage ?? 0}%
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {STATUSES.map(s => (
                        <Badge key={s} tone={TONE[s]}>{dev.units_by_status[s] || 0} {s}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }} data-testid="inv-units-table">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Unidad', 'Prototipo', 'Nivel', 'm² total', 'Rec.', 'Precio', 'Estado', 'Apartado', 'Acciones'].map(c => (
                        <th key={c} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dev.units.map(u => {
                      const hold = holds[u.id];
                      return (
                        <tr key={u.id} data-testid={`inv-unit-${u.id}`}
                          style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', color: 'var(--cream)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, cursor: 'pointer' }}
                            onClick={() => setEditing({ unit: u, dev_id: dev.id })}>{u.unit_number}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--cream-2)', fontSize: 12 }}>{u.prototype}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--cream-3)', fontSize: 12 }}>{u.level}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--cream-2)', fontSize: 12 }}>{u.m2_total}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--cream-3)', fontSize: 12 }}>{u.bedrooms}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--cream)', fontFamily: 'Outfit', fontWeight: 700, fontSize: 13 }}>
                            <span
                              className={pmActive && pmConfig.hide_pricing ? blurPriceCSS : ''}
                              onClick={pmActive ? e => { e.currentTarget.classList.toggle('revealed'); setTimeout(() => e.currentTarget.classList.remove('revealed'), 3000); } : undefined}
                            >{fmtMXN(u.price)}</span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <Badge tone={TONE[u.status]}>{u.status}</Badge>
                            {u.overridden && <span style={{ marginLeft: 6, fontFamily: 'DM Sans', fontSize: 9.5, color: '#fcd34d' }}>· override</span>}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {hold ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CountdownBadge expiresAt={hold.expires_at} />
                                <button onClick={() => releaseHold(u, dev.id)} data-testid={`release-hold-${u.id}`}
                                  title="Liberar apartado"
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cream-4)', padding: 2 }}>
                                  <X size={11} />
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-4)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {!hold && u.status === 'disponible' && (
                              <button onClick={() => { setHoldModal({ unit: u, dev_id: dev.id }); setHoldHours(24); setHoldReason(''); }}
                                data-testid={`hold-btn-${u.id}`}
                                style={{
                                  padding: '4px 10px', borderRadius: 7,
                                  background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.28)',
                                  color: '#fcd34d', fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                }}>
                                <Clock size={10} /> Apartar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}

      {/* Legajo link */}
      {dev && (
        <div data-testid="dev-legajo-link" style={{ marginTop: 22 }}>
          <Link to={`/desarrollador/desarrollos/${dev.id}/legajo`} className="card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
            padding: '18px 22px', textDecoration: 'none',
            background: 'linear-gradient(140deg, rgba(99,102,241,0.10), transparent)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 9999, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.32)' }}>
                <FileText size={18} color="var(--indigo-3)" />
              </span>
              <div>
                <div className="eyebrow" style={{ marginBottom: 2 }}>Legajo del desarrollo</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>Documentos · Fotos · Planos · Avance · 360°</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>Sube escrituras, permisos SEDUVI, listas de precios y más.</div>
              </div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13 }}>
              Abrir legajo <ArrowRight size={13} />
            </span>
          </Link>
        </div>
      )}

      {/* Status edit modal */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} data-testid="status-modal" style={{ width: 380, background: '#0E1220', border: '1px solid var(--border)', borderRadius: 18, padding: 22 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>UNIDAD {editing.unit.unit_number}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', marginBottom: 14 }}>
              {editing.unit.prototype} · {fmtMXN(editing.unit.price)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {STATUSES.map(s => (
                <button key={s} onClick={() => updateStatus(s)} data-testid={`set-status-${s}`}
                  className={`filter-chip${editing.unit.status === s ? ' active' : ''}`}
                  style={{ justifyContent: 'flex-start', padding: '10px 14px' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hold modal */}
      {holdModal && (
        <div onClick={() => setHoldModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} data-testid="hold-modal" style={{ width: 400, background: '#0E1220', border: '1px solid var(--border)', borderRadius: 18, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Clock size={16} color="#f59e0b" />
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)', letterSpacing: '-0.01em' }}>
                Apartar temporalmente
              </div>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', marginBottom: 18 }}>
              <strong>{holdModal.unit.unit_number}</strong> — {holdModal.unit.prototype} · {fmtMXN(holdModal.unit.price)}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Duración</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {HOLD_HOURS.map(h => (
                  <button key={h} onClick={() => setHoldHours(h)} data-testid={`hold-hours-${h}`}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 9, fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      background: holdHours === h ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${holdHours === h ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                      color: holdHours === h ? '#fcd34d' : 'var(--cream-3)',
                    }}>
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Razón (opcional)</div>
              <input
                type="text"
                placeholder="Ej: Cliente interesado — pendiente firma"
                value={holdReason}
                onChange={e => setHoldReason(e.target.value)}
                data-testid="hold-reason-input"
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setHoldModal(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 9, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={createHold} disabled={holdLoading} data-testid="confirm-hold-btn"
                style={{ flex: 2, padding: '10px 0', borderRadius: 9, background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.35)', color: '#fcd34d', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: holdLoading ? 0.6 : 1 }}>
                {holdLoading ? 'Apartando...' : `Apartar ${holdHours}h`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulk && (
        <BulkUploadModal
          devId={activeId}
          onClose={() => setShowBulk(false)}
          onCommitted={(result) => {
            setShowBulk(false);
            setToast({ kind: 'success', text: `${result.rows_committed} unidades actualizadas` });
            load();
          }}
        />
      )}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
      <style>{`@media (max-width: 940px) { .inv-grid { grid-template-columns: 1fr !important; } }`}</style>
    </DeveloperLayout>
  );
}

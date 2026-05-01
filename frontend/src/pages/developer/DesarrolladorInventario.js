// /desarrollador/inventario — D1 Inventory CRUD with status overrides
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmtMXN, Toast } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import DocumentsList from '../../components/documents/DocumentsList';

const STATUSES = ['disponible', 'apartado', 'reservado', 'vendido', 'bloqueado'];
const TONE = { disponible: 'ok', apartado: 'warn', reservado: 'pink', vendido: 'neutral', bloqueado: 'bad' };

export default function DesarrolladorInventario({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [toast, setToast] = useState(null);
  const [editing, setEditing] = useState(null); // { unit, dev_id }

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.listInventory();
      setItems(r);
      if (r.length && !activeId) setActiveId(r[0].id);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

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

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="D1 · INVENTARIO TIEMPO REAL"
        title="Inventario"
        sub="Status por unidad, overrides auditados, esquemas de pago configurables. Click en una unidad para cambiar status."
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
                    <div style={{ display: 'flex', gap: 6 }}>
                      {STATUSES.map(s => (
                        <Badge key={s} tone={TONE[s]}>{dev.units_by_status[s] || 0} {s}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }} data-testid="inv-units-table">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Unidad', 'Prototipo', 'Nivel', 'm² total', 'Recámaras', 'Precio', 'Estado'].map(c => (
                        <th key={c} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dev.units.map(u => (
                      <tr key={u.id} data-testid={`inv-unit-${u.id}`}
                        onClick={() => setEditing({ unit: u, dev_id: dev.id })}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--cream)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{u.unit_number}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--cream-2)', fontSize: 12 }}>{u.prototype}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--cream-3)', fontSize: 12 }}>{u.level}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--cream-2)', fontSize: 12 }}>{u.m2_total}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--cream-3)', fontSize: 12 }}>{u.bedrooms}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--cream)', fontFamily: 'Outfit', fontWeight: 700, fontSize: 13 }}>{fmtMXN(u.price)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge tone={TONE[u.status]}>{u.status}</Badge>
                          {u.overridden && <span style={{ marginLeft: 6, fontFamily: 'DM Sans', fontSize: 9.5, color: '#fcd34d' }}>· override</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}

        {/* Phase 7.1 — Document Intelligence widget */}
        {dev && (
          <div data-testid="dev-documents-widget" style={{ marginTop: 22 }}>
            <DocumentsList devId={dev.id} devName={dev.name} scope="developer" compact={false} />
          </div>
        )}

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

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
      <style>{`@media (max-width: 940px) { .inv-grid { grid-template-columns: 1fr !important; } }`}</style>
    </DeveloperLayout>
  );
}

// Phase 18 · Batch 35 — Inmobiliaria · Alianzas con Desarrolladores
import React, { useEffect, useState, useCallback } from 'react';
import InmobiliariaLayout from '../../components/developer/InmobiliariaLayout';
import { Briefcase, Plus, X, CheckCircle, Pause, Play, Trash2 } from 'lucide-react';
import {
  listDevPartnerships, createDevPartnership, updateDevPartnershipStatus,
} from '../../api/inmobiliaria';

const inputStyle = {
  width: '100%', padding: '10px 13px', borderRadius: 9,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border)', color: 'var(--cream)',
  fontFamily: 'DM Sans', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const STATUS_LABEL = {
  pending: 'Pendiente', active: 'Activa', paused: 'En pausa', terminated: 'Terminada',
};
const STATUS_COLOR = {
  pending:    { bg: 'rgba(250,204,21,0.10)', bd: 'rgba(250,204,21,0.35)', fg: '#FACC15' },
  active:     { bg: 'rgba(74,222,128,0.10)', bd: 'rgba(74,222,128,0.35)', fg: '#4ADE80' },
  paused:     { bg: 'rgba(250,204,21,0.06)', bd: 'rgba(250,204,21,0.25)', fg: '#FBBF24' },
  terminated: { bg: 'rgba(239,68,68,0.08)',  bd: 'rgba(239,68,68,0.30)',  fg: '#F87171' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.pending;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 9999, fontSize: 11.5,
      fontFamily: 'DM Sans', fontWeight: 600,
      background: c.bg, border: `1px solid ${c.bd}`, color: c.fg,
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ dev_org_id: '', dev_org_name: '', commission_pct: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setErr('');
    if (!form.dev_org_id.trim()) { setErr('ID del desarrollador es obligatorio'); return; }
    setSaving(true);
    try {
      await createDevPartnership({
        dev_org_id: form.dev_org_id.trim(),
        dev_org_name: form.dev_org_name.trim() || null,
        commission_pct: form.commission_pct ? parseFloat(form.commission_pct) : null,
        notes: form.notes.trim() || null,
      });
      onCreated();
    } catch (e) {
      setErr(e.message || 'Error al crear alianza');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: '#0D1118', border: '1px solid var(--border)',
        borderRadius: 16, width: '100%', maxWidth: 460, padding: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: 0 }}>
            Nueva alianza con desarrollador
          </h2>
          <button onClick={onClose} aria-label="Cerrar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)' }}>
            <X size={16} />
          </button>
        </div>

        {err && (
          <div style={{
            padding: '8px 12px', borderRadius: 7,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#F87171', fontFamily: 'DM Sans', fontSize: 12, marginBottom: 12,
          }}>{err}</div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
            ID del desarrollador *
          </label>
          <input data-testid="partnership-dev-org-id" style={inputStyle}
            value={form.dev_org_id} onChange={e => set('dev_org_id', e.target.value)}
            placeholder="dev_xyz_001" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
            Nombre comercial
          </label>
          <input data-testid="partnership-dev-org-name" style={inputStyle}
            value={form.dev_org_name} onChange={e => set('dev_org_name', e.target.value)}
            placeholder="Constructora Polanco" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
            Comisión acordada (%)
          </label>
          <input data-testid="partnership-commission-pct" style={inputStyle}
            type="number" min="0" max="50" step="0.1"
            value={form.commission_pct} onChange={e => set('commission_pct', e.target.value)}
            placeholder="3.5" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
            Notas
          </label>
          <textarea data-testid="partnership-notes"
            style={{ ...inputStyle, minHeight: 70, borderRadius: 11, fontFamily: 'DM Sans' }}
            value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Detalles del acuerdo, zona, exclusividad…" maxLength={500} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 9999, background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--cream-3)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
            Cancelar
          </button>
          <button data-testid="partnership-create-btn" onClick={submit} disabled={saving}
            style={{
              padding: '9px 20px', borderRadius: 9999,
              background: 'linear-gradient(90deg,#6366F1,#EC4899)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
            {saving ? 'Creando…' : 'Crear alianza'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InmobiliariaPartnerships({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState({});
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listDevPartnerships(filter || undefined);
      setItems(r.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (pid, newStatus) => {
    setBusy(b => ({ ...b, [pid]: true }));
    try {
      await updateDevPartnershipStatus(pid, newStatus);
      load();
    } catch (e) {
      alert(e.message || 'Error');
    } finally {
      setBusy(b => ({ ...b, [pid]: false }));
    }
  };

  return (
    <InmobiliariaLayout user={user} onLogout={onLogout}>
      <div data-testid="inmobiliaria-alianzas" style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>
              Alianzas con Desarrolladores
            </h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: '4px 0 0' }}>
              Gestiona acuerdos comerciales con organizaciones desarrolladoras.
            </p>
          </div>
          <button data-testid="add-partnership-btn" onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 18px', borderRadius: 9999,
              background: 'linear-gradient(90deg,#6366F1,#EC4899)',
              border: 'none', color: '#fff', fontFamily: 'DM Sans',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
            <Plus size={14} /> Nueva alianza
          </button>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {['', 'pending', 'active', 'paused', 'terminated'].map(s => (
            <button key={s || 'all'} onClick={() => setFilter(s)}
              data-testid={`filter-${s || 'all'}`}
              style={{
                padding: '6px 13px', borderRadius: 9999,
                border: `1px solid ${filter === s ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                background: filter === s ? 'rgba(99,102,241,0.14)' : 'transparent',
                color: filter === s ? '#818CF8' : 'var(--cream-3)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer',
              }}>
              {s ? STATUS_LABEL[s] : 'Todas'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Cargando alianzas…
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            <Briefcase size={36} color="var(--cream-3)" style={{ marginBottom: 12, opacity: 0.5 }} />
            <div>Sin alianzas registradas. Crea la primera para empezar.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(p => (
              <div key={p.partnership_id} data-testid={`partnership-row-${p.partnership_id}`}
                style={{
                  padding: '15px 18px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'rgba(99,102,241,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Briefcase size={16} color="#818CF8" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14.5, color: 'var(--cream)' }}>
                    {p.dev_org_name || p.dev_org_id}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                    ID: {p.dev_org_id}
                    {p.commission_pct != null && ` · Comisión ${p.commission_pct}%`}
                  </div>
                  {p.notes && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 4, lineHeight: 1.45 }}>
                      {p.notes}
                    </div>
                  )}
                </div>
                <StatusBadge status={p.status} />
                <div style={{ display: 'flex', gap: 6 }}>
                  {p.status === 'pending' && (
                    <button data-testid={`activate-${p.partnership_id}`}
                      onClick={() => setStatus(p.partnership_id, 'active')}
                      disabled={busy[p.partnership_id]}
                      style={{
                        padding: '6px 12px', borderRadius: 9999,
                        background: 'rgba(74,222,128,0.10)',
                        border: '1px solid rgba(74,222,128,0.35)',
                        color: '#4ADE80', fontFamily: 'DM Sans',
                        fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}>
                      <CheckCircle size={12} /> Activar
                    </button>
                  )}
                  {p.status === 'active' && (
                    <button data-testid={`pause-${p.partnership_id}`}
                      onClick={() => setStatus(p.partnership_id, 'paused')}
                      disabled={busy[p.partnership_id]}
                      style={{
                        padding: '6px 12px', borderRadius: 9999,
                        background: 'rgba(250,204,21,0.08)',
                        border: '1px solid rgba(250,204,21,0.35)',
                        color: '#FACC15', fontFamily: 'DM Sans',
                        fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}>
                      <Pause size={12} /> Pausar
                    </button>
                  )}
                  {p.status === 'paused' && (
                    <button data-testid={`resume-${p.partnership_id}`}
                      onClick={() => setStatus(p.partnership_id, 'active')}
                      disabled={busy[p.partnership_id]}
                      style={{
                        padding: '6px 12px', borderRadius: 9999,
                        background: 'rgba(74,222,128,0.10)',
                        border: '1px solid rgba(74,222,128,0.35)',
                        color: '#4ADE80', fontFamily: 'DM Sans',
                        fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}>
                      <Play size={12} /> Reanudar
                    </button>
                  )}
                  {p.status !== 'terminated' && (
                    <button data-testid={`terminate-${p.partnership_id}`}
                      onClick={() => {
                        if (window.confirm('¿Terminar esta alianza? Esta acción es definitiva.')) {
                          setStatus(p.partnership_id, 'terminated');
                        }
                      }}
                      disabled={busy[p.partnership_id]}
                      style={{
                        padding: '6px 12px', borderRadius: 9999,
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.30)',
                        color: '#F87171', fontFamily: 'DM Sans',
                        fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}>
                      <Trash2 size={12} /> Terminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showCreate && (
          <CreateModal
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); load(); }}
          />
        )}
      </div>
    </InmobiliariaLayout>
  );
}

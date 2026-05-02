// InmobiliariaAsesores — CRUD de asesores de la inmobiliaria
import React, { useState, useEffect } from 'react';
import InmobiliariaLayout from '../../components/developer/InmobiliariaLayout';
import { listInmAsesores, createInmAsesor, patchInmAsesor, disableInmAsesor } from '../../api/developer';
import { Plus, X, UserCheck, CheckCircle, AlertCircle } from '../../components/icons';

const ROLES = ['asesor', 'admin', 'director', 'marketing'];
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

function Badge({ status }) {
  const ok = status === 'active';
  return (
    <span style={{ padding: '3px 9px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 600, background: ok ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${ok ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.35)'}`, color: ok ? '#4ADE80' : '#F87171' }}>
      {ok ? 'Activo' : status}
    </span>
  );
}

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ email: '', name: '', role: 'asesor' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.email || !form.name) { setErr('Email y nombre son obligatorios'); return; }
    setSaving(true); setErr('');
    try {
      await createInmAsesor({ ...form, inmobiliaria_id: 'dmx_root' });
      onCreated();
      onClose();
    } catch (e) { setErr(e.message || 'Error al crear'); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#0D1118', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 400, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: 0 }}>Nuevo asesor DMX</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)' }}><X size={16} /></button>
        </div>
        {err && <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 12, marginBottom: 12 }}>{err}</div>}
        {[
          { k: 'name', label: 'Nombre', placeholder: 'Juan Pérez', testid: 'inm-name-input' },
          { k: 'email', label: 'Email', placeholder: 'juan@desarrollosmx.com', type: 'email', testid: 'inm-email-input' },
        ].map(f => (
          <div key={f.k} style={{ marginBottom: 12 }}>
            <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>{f.label}</label>
            <input style={inputStyle} type={f.type || 'text'} value={form[f.k]} onChange={e => set(f.k, e.target.value)} placeholder={f.placeholder} data-testid={f.testid} />
          </div>
        ))}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Rol</label>
          <select style={inputStyle} value={form.role} onChange={e => set('role', e.target.value)} data-testid="inm-role-select">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleCreate} disabled={saving} data-testid="inm-create-btn"
            style={{ padding: '9px 18px', borderRadius: 9999, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Creando...' : 'Crear asesor'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InmobiliariaAsesores({ user, onLogout }) {
  const [asesores, setAsesores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState({});
  const [successMsg, setSuccessMsg] = useState('');

  const load = () => {
    setLoading(true);
    listInmAsesores('dmx_root')
      .then(r => setAsesores(r.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDisable = async (id) => {
    if (!window.confirm('¿Desactivar este asesor?')) return;
    setSaving(s => ({ ...s, [id]: true }));
    try {
      await disableInmAsesor(id);
      setSuccessMsg('Asesor desactivado');
      load();
    } catch (e) { alert(e.message); } finally { setSaving(s => ({ ...s, [id]: false })); }
  };

  return (
    <InmobiliariaLayout user={user} onLogout={onLogout}>
      <div data-testid="inmobiliaria-asesores" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>Asesores DMX</h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: '4px 0 0' }}>{asesores.length} asesores registrados</p>
          </div>
          <button onClick={() => setShowCreate(true)} data-testid="add-inm-asesor-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9999, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Plus size={14} /> Agregar asesor
          </button>
        </div>

        {successMsg && (
          <div style={{ padding: '9px 14px', borderRadius: 8, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ADE80', fontFamily: 'DM Sans', fontSize: 12.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={13} /> {successMsg}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando...</div>
        ) : asesores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            <UserCheck size={36} color="var(--cream-3)" style={{ marginBottom: 12, opacity: 0.5 }} />
            <div>Sin asesores registrados.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {asesores.map(a => (
              <div key={a.id} data-testid={`inm-asesor-row-${a.id}`}
                style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: '#818CF8' }}>
                    {(a.name || a.email).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{a.name}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>{a.email} · {a.role}</div>
                </div>
                <Badge status={a.status} />
                {a.status !== 'disabled' && (
                  <button onClick={() => handleDisable(a.id)} disabled={saving[a.id]}
                    data-testid={`disable-asesor-${a.id}`}
                    style={{ padding: '6px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5, cursor: 'pointer' }}>
                    Desactivar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { load(); setSuccessMsg('Asesor creado exitosamente'); }} />}
      </div>
    </InmobiliariaLayout>
  );
}

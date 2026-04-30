// /asesor/captaciones — Kanban 6 stages with min-fields gate
import React, { useEffect, useState } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Badge, Empty, Drawer, Toast, fmtMXN } from '../../components/advisor/primitives';
import * as api from '../../api/advisor';

const STAGES = [
  { k: 'pendiente',     label: 'Pendiente',     tone: 'neutral' },
  { k: 'seguimiento',   label: 'Seguimiento',   tone: 'brand' },
  { k: 'encuentro',     label: 'Encuentro',     tone: 'warn' },
  { k: 'valuacion',     label: 'Valuación',     tone: 'pink' },
  { k: 'documentacion', label: 'Documentación', tone: 'warn' },
  { k: 'captado',       label: 'Captado',       tone: 'ok' },
];

export default function AsesorCaptaciones({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragging, setDragging] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await api.listCaptaciones()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onDrop = async (stage) => {
    if (!dragging) return;
    const id = dragging; setDragging(null);
    const item = items.find(x => x.id === id);
    if (!item || item.stage === stage) return;
    setItems(p => p.map(x => x.id === id ? { ...x, stage } : x));
    try { await api.moveCaptacion(id, stage); setToast({ kind: 'success', text: `Movido a ${stage}` }); }
    catch { setToast({ kind: 'error', text: 'Error al mover' }); load(); }
  };

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CRM · CAPTACIONES"
        title="Captaciones de inmuebles en reventa"
        sub="Flujo de 6 etapas: pendiente → captado. Anti-borradores fantasma: dirección + tipo + precio son obligatorios."
        actions={
          <button onClick={() => setShowCreate(true)} data-testid="new-capt-btn" className="btn btn-primary">
            + Nueva captación
          </button>
        }
      />

      {loading ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : items.length === 0 ? <Empty title="Sin captaciones" sub="Inicia tu primera captación." />
        : (
          <div data-testid="capt-kanban" style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, minmax(230px, 1fr))`, gap: 10, overflowX: 'auto' }}>
            {STAGES.map(st => {
              const col = items.filter(x => x.stage === st.k);
              return (
                <div key={st.k} data-testid={`capt-col-${st.k}`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(st.k)}
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 16, padding: 10, minHeight: 400 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 6px 10px' }}>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream-2)' }}>{col.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {col.map(c => (
                      <div key={c.id} draggable
                        onDragStart={() => setDragging(c.id)}
                        data-testid={`capt-card-${c.id}`}
                        style={{
                          padding: 12,
                          background: 'linear-gradient(180deg, #0D1118, #0A0D16)',
                          border: '1px solid var(--border)',
                          borderRadius: 12, cursor: 'grab',
                        }}>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)', marginBottom: 4 }}>
                          {c.direccion}
                        </div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 8 }}>
                          {c.tipo_inmueble} · {c.recamaras}rec · {c.m2_construidos || '?'}m²
                        </div>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream-2)' }}>
                          {fmtMXN(c.precio_sugerido)}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                          <Badge tone="neutral">{c.tipo_operacion}</Badge>
                          {c.urgencia === 'alta' && <Badge tone="bad">Urgente</Badge>}
                          <Badge tone="brand">{c.comision_pct || 4}% comisión</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="Nueva captación" width={560}>
        <CreateCaptForm onCreated={() => { setShowCreate(false); setToast({ kind: 'success', text: 'Captación creada' }); load(); }}
          onError={t => setToast({ kind: 'error', text: t })} />
      </Drawer>

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </AdvisorLayout>
  );
}

function CreateCaptForm({ onCreated, onError }) {
  const [f, setF] = useState({ direccion: '', tipo_operacion: 'venta', precio_sugerido: '', tipo_inmueble: 'dept', recamaras: 2, banos: 2, estacionamientos: 1, m2_construidos: '', propietario_nombre: '', propietario_telefono: '', urgencia: 'media' });
  const [sub, setSub] = useState(false);

  const ready = f.direccion.trim() && f.tipo_operacion && f.precio_sugerido;

  const submit = async () => {
    if (!ready) return;
    setSub(true);
    try {
      await api.createCaptacion({
        ...f,
        precio_sugerido: +f.precio_sugerido,
        recamaras: +f.recamaras, banos: +f.banos, estacionamientos: +f.estacionamientos,
        m2_construidos: f.m2_construidos ? +f.m2_construidos : null,
      });
      onCreated();
    } catch { onError('No se pudo crear'); }
    finally { setSub(false); }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' };
  const lblStyle = { fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label><div style={lblStyle}>Dirección *</div>
        <input value={f.direccion} onChange={e => setF({ ...f, direccion: e.target.value })} style={inputStyle} data-testid="capt-addr" placeholder="Calle + número + colonia" />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label><div style={lblStyle}>Operación *</div>
          <select value={f.tipo_operacion} onChange={e => setF({ ...f, tipo_operacion: e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="capt-op">
            <option value="venta">Venta</option><option value="renta">Renta</option>
          </select>
        </label>
        <label><div style={lblStyle}>Precio sugerido *</div>
          <input type="number" value={f.precio_sugerido} onChange={e => setF({ ...f, precio_sugerido: e.target.value })} style={inputStyle} data-testid="capt-price" />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        <label><div style={lblStyle}>Tipo</div>
          <select value={f.tipo_inmueble} onChange={e => setF({ ...f, tipo_inmueble: e.target.value })} className="asr-select" style={{ width: '100%' }}>
            <option value="dept">Depto</option><option value="casa">Casa</option><option value="ph">PH</option><option value="loft">Loft</option>
          </select>
        </label>
        <label><div style={lblStyle}>Rec</div>
          <input type="number" value={f.recamaras} onChange={e => setF({ ...f, recamaras: e.target.value })} style={inputStyle} />
        </label>
        <label><div style={lblStyle}>Baños</div>
          <input type="number" value={f.banos} onChange={e => setF({ ...f, banos: e.target.value })} style={inputStyle} />
        </label>
        <label><div style={lblStyle}>m² const.</div>
          <input type="number" value={f.m2_construidos} onChange={e => setF({ ...f, m2_construidos: e.target.value })} style={inputStyle} />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label><div style={lblStyle}>Propietario</div>
          <input value={f.propietario_nombre} onChange={e => setF({ ...f, propietario_nombre: e.target.value })} style={inputStyle} />
        </label>
        <label><div style={lblStyle}>Teléfono</div>
          <input value={f.propietario_telefono} onChange={e => setF({ ...f, propietario_telefono: e.target.value })} style={inputStyle} />
        </label>
      </div>
      <button onClick={submit} disabled={!ready || sub} data-testid="capt-submit" className="btn btn-primary" style={{ justifyContent: 'center', opacity: (!ready || sub) ? 0.6 : 1 }}>
        {sub ? 'Creando…' : 'Crear captación'}
      </button>
      {!ready && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>Completa dirección + tipo de operación + precio sugerido para continuar.</div>}
    </div>
  );
}

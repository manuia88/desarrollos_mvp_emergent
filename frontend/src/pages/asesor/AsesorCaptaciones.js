// /asesor/captaciones — Kanban 6 stages with min-fields gate
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Badge, Empty, Drawer, Toast, fmtMXN } from '../../components/advisor/primitives';
import PremiumCard from '../../components/asesor/design/PremiumCard'; // B7 · diseño premium
import * as api from '../../api/advisor';
import SmartListsSidebar from '../../components/asesor/SmartListsSidebar';
import { SECTION_LABELS, AmenitySection } from '../../components/developer/amenitiesUI';

const STAGES = [
  { k: 'pendiente',     label: 'Pendiente',     tone: 'neutral' },
  { k: 'seguimiento',   label: 'Seguimiento',   tone: 'brand' },
  { k: 'encuentro',     label: 'Encuentro',     tone: 'warn' },
  { k: 'valuacion',     label: 'Valuación',     tone: 'pink' },
  { k: 'documentacion', label: 'Documentación', tone: 'warn' },
  { k: 'captado',       label: 'Captado',       tone: 'ok' },
];

export default function AsesorCaptaciones({ user, onLogout, embedded }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragging, setDragging] = useState(null);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try { setItems(await api.listCaptaciones()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // W5.ASR.3 Parte 1 — Click en preset navega a /asesor/contactos con filtro aplicado
  const handleSelectPreset = (presetKey) => {
    nav(`/asesor/contactos?smart_list=${encodeURIComponent(presetKey)}`);
  };

  const onDrop = async (stage) => {
    if (!dragging) return;
    const id = dragging; setDragging(null);
    const item = items.find(x => x.id === id);
    if (!item || item.stage === stage) return;
    setItems(p => p.map(x => x.id === id ? { ...x, stage } : x));
    try { await api.moveCaptacion(id, stage); setToast({ kind: 'success', text: `Movido a ${stage}` }); }
    catch { setToast({ kind: 'error', text: 'Error al mover' }); load(); }
  };

  const body = (
    <>
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

      <div
        data-testid="captaciones-layout"
        style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}
        className="captaciones-layout">
        <SmartListsSidebar
          activePreset={null}
          onSelectPreset={handleSelectPreset}
          onClear={() => { /* no-op aquí · el filtro vive en contactos */ }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>

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
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 10, minHeight: 400 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 6px 10px' }}>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream-2)' }}>{col.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {col.map(c => (
                      <PremiumCard key={c.id} hover dragging={dragging === c.id} draggable
                        onDragStart={() => setDragging(c.id)}
                        data-testid={`capt-card-${c.id}`}
                        style={{ padding: 12, borderRadius: 14, cursor: 'grab' }}>
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
                      </PremiumCard>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="Nueva captación" width={680}>
        <CreateCaptForm onCreated={() => { setShowCreate(false); setToast({ kind: 'success', text: 'Captación creada' }); load(); }}
          onError={t => setToast({ kind: 'error', text: t })} />
      </Drawer>

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}

        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .captaciones-layout { flex-direction: column; }
        }
      `}</style>
    </>
  );

  // B7 F3 · embedded → sin AdvisorLayout (vive dentro del hub Mis Leads).
  return embedded ? body : <AdvisorLayout user={user} onLogout={onLogout}>{body}</AdvisorLayout>;
}

// Selector de chips (una opción) — interactivo, tema asesor claro
function ChipPick({ value, options, onPick, testid }) {
  return (
    <div data-testid={testid} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => {
        const on = value === o.v;
        return (
          <button key={o.v} type="button" onClick={() => onPick(on ? '' : o.v)}
            style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, padding: '6px 13px', borderRadius: 9999, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--theme)' : 'var(--border)'}`,
              background: on ? 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' : '#fff',
              color: on ? '#fff' : 'var(--cream-2)' }}>
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

function CreateCaptForm({ onCreated, onError }) {
  const [f, setF] = useState({
    direccion: '', colonia_id: '', tipo_operacion: 'venta', precio_sugerido: '', tipo_inmueble: 'dept',
    recamaras: 2, banos: 2, estacionamientos: 1, m2_construidos: '', propietario_nombre: '', propietario_telefono: '',
    urgencia: 'media', condicion: 'usada', antiguedad_anos: '', estado_conservacion: '', vista: '', orientacion: '', nivel: '',
    amenity_keys: [],
  });
  const [sub, setSub] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [showAmen, setShowAmen] = useState(false);
  const [colonias, setColonias] = useState([]);
  const [estimate, setEstimate] = useState(null);
  useEffect(() => { api.getCaptAmenitiesCatalog().then(setCatalog).catch(() => setCatalog(false)); }, []);
  useEffect(() => { api.listColoniaOptions().then(r => setColonias(r.colonias || [])).catch(() => setColonias([])); }, []);

  const ready = f.direccion.trim() && f.tipo_operacion && f.precio_sugerido;
  const set = (patch) => setF(prev => ({ ...prev, ...patch }));
  const toggleAmenity = (key) => set({ amenity_keys: f.amenity_keys.includes(key) ? f.amenity_keys.filter(k => k !== key) : [...f.amenity_keys, key] });

  // Valor estimado en vivo (sube con cada detalle) — cierra el ciclo del asesor.
  useEffect(() => {
    if (!f.colonia_id || !f.m2_construidos) { setEstimate(null); return; }
    const id = setTimeout(() => {
      api.captacionEstimate({
        colonia_id: f.colonia_id, m2: +f.m2_construidos, recamaras: +f.recamaras,
        condicion: f.condicion, antiguedad_anos: f.antiguedad_anos, estado_conservacion: f.estado_conservacion,
        vista: f.vista, n_amenidades: f.amenity_keys.length,
      }).then(setEstimate).catch(() => setEstimate(null));
    }, 350);
    return () => clearTimeout(id);
  }, [f.colonia_id, f.m2_construidos, f.recamaras, f.condicion, f.antiguedad_anos, f.estado_conservacion, f.vista, f.amenity_keys.length]);

  const submit = async () => {
    if (!ready) return;
    setSub(true);
    try {
      await api.createCaptacion({
        ...f,
        precio_sugerido: +f.precio_sugerido,
        recamaras: +f.recamaras, banos: +f.banos, estacionamientos: +f.estacionamientos,
        m2_construidos: f.m2_construidos ? +f.m2_construidos : null,
        antiguedad_anos: f.antiguedad_anos !== '' ? +f.antiguedad_anos : null,
        nivel: f.nivel !== '' ? +f.nivel : null,
        estado_conservacion: f.estado_conservacion || null,
        vista: f.vista || null, orientacion: f.orientacion || null,
      });
      onCreated();
    } catch { onError('No se pudo crear'); }
    finally { setSub(false); }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' };
  const lblStyle = { fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 };
  const secTitle = { fontFamily: 'Outfit,sans-serif', fontSize: 12.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream)', margin: '6px 0 2px', display: 'flex', alignItems: 'center', gap: 8 };
  const bar = <span style={{ width: 4, height: 15, borderRadius: 3, background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' }} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* 1 · Lo básico */}
      <div style={secTitle}>{bar} Lo básico</div>
      <label><div style={lblStyle}>Dirección *</div>
        <input value={f.direccion} onChange={e => set({ direccion: e.target.value })} style={inputStyle} data-testid="capt-addr" placeholder="Calle + número" />
      </label>
      <label><div style={lblStyle}>Colonia <span style={{ textTransform: 'none', color: 'var(--cream-3)' }}>(para valuar la zona)</span></div>
        <select value={f.colonia_id} onChange={e => set({ colonia_id: e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="capt-colonia">
          <option value="">Elige la colonia…</option>
          {colonias.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label><div style={lblStyle}>Operación *</div>
          <select value={f.tipo_operacion} onChange={e => set({ tipo_operacion: e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="capt-op">
            <option value="venta">Venta</option><option value="renta">Renta</option>
          </select>
        </label>
        <label><div style={lblStyle}>Precio sugerido *</div>
          <input type="number" value={f.precio_sugerido} onChange={e => set({ precio_sugerido: e.target.value })} style={inputStyle} data-testid="capt-price" />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        <label><div style={lblStyle}>Tipo</div>
          <select value={f.tipo_inmueble} onChange={e => set({ tipo_inmueble: e.target.value })} className="asr-select" style={{ width: '100%' }}>
            <option value="dept">Depto</option><option value="casa">Casa</option><option value="ph">PH</option><option value="loft">Loft</option>
          </select>
        </label>
        <label><div style={lblStyle}>Rec</div><input type="number" value={f.recamaras} onChange={e => set({ recamaras: e.target.value })} style={inputStyle} /></label>
        <label><div style={lblStyle}>Baños</div><input type="number" value={f.banos} onChange={e => set({ banos: e.target.value })} style={inputStyle} /></label>
        <label><div style={lblStyle}>m² const.</div><input type="number" value={f.m2_construidos} onChange={e => set({ m2_construidos: e.target.value })} style={inputStyle} /></label>
      </div>

      {/* 2 · Detalles que afinan el precio (alimenta el AVM) */}
      <div style={secTitle}>{bar} Detalles que afinan el precio</div>
      <div>
        <div style={lblStyle}>¿Cómo está?</div>
        <ChipPick value={f.condicion} testid="capt-condicion"
          options={[{ v: 'a_estrenar', l: 'A estrenar' }, { v: 'seminueva', l: 'Seminueva (1-5 años)' }, { v: 'usada', l: 'Usada' }]}
          onPick={(v) => set({ condicion: v || 'usada' })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label><div style={lblStyle}>Antigüedad (años)</div><input type="number" value={f.antiguedad_anos} onChange={e => set({ antiguedad_anos: e.target.value })} style={inputStyle} placeholder="0 = nueva" /></label>
        <label><div style={lblStyle}>Piso / nivel</div><input type="number" value={f.nivel} onChange={e => set({ nivel: e.target.value })} style={inputStyle} /></label>
      </div>
      <div>
        <div style={lblStyle}>Estado de conservación</div>
        <ChipPick value={f.estado_conservacion} testid="capt-estado"
          options={[{ v: 'excelente', l: 'Excelente' }, { v: 'bueno', l: 'Bueno' }, { v: 'a_remodelar', l: 'Para remodelar' }]}
          onPick={(v) => set({ estado_conservacion: v })} />
      </div>
      <div>
        <div style={lblStyle}>Vista</div>
        <ChipPick value={f.vista} testid="capt-vista"
          options={[{ v: 'calle', l: 'A la calle' }, { v: 'interior', l: 'Interior' }, { v: 'parque', l: 'Al parque' }, { v: 'ciudad', l: 'A la ciudad' }, { v: 'area_verde', l: 'Área verde' }]}
          onPick={(v) => set({ vista: v })} />
      </div>
      <div>
        <div style={lblStyle}>Orientación</div>
        <ChipPick value={f.orientacion} testid="capt-orientacion"
          options={['N', 'S', 'E', 'O', 'NE', 'NO', 'SE', 'SO'].map(o => ({ v: o, l: o }))}
          onPick={(v) => set({ orientacion: v })} />
      </div>

      {/* Valor estimado en vivo — sube con cada detalle (cierra el ciclo del asesor) */}
      {estimate && estimate.disponible && (
        <div data-testid="capt-estimate" style={{ borderRadius: 14, padding: '13px 15px', background: 'linear-gradient(150deg, rgba(109,74,255,0.08), transparent)', border: '1px solid rgba(109,74,255,0.32)' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>Valor estimado de mercado</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--cream)', marginTop: 3 }}>
            {fmtMXN(estimate.valor)} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream-3)' }}>· {fmtMXN(estimate.rango_low)}–{fmtMXN(estimate.rango_high)}</span>
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', marginTop: 5, lineHeight: 1.45 }}>{estimate.lectura}</div>
          {(estimate.drivers || []).length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {estimate.drivers.map((d, i) => (
                <span key={i} style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 9999,
                  background: d.dir === 'up' ? 'rgba(31,160,106,0.10)' : 'rgba(226,152,46,0.12)',
                  border: `1px solid ${d.dir === 'up' ? 'rgba(31,160,106,0.30)' : 'rgba(226,152,46,0.32)'}`,
                  color: d.dir === 'up' ? 'var(--ok, #1FA06A)' : 'var(--warm, #E2982E)' }}>
                  {d.dir === 'up' ? '↑' : '↓'} {d.plain}
                </span>
              ))}
            </div>
          )}
          {estimate.fuente === 'reventa_real'
            ? <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--ok, #1FA06A)', marginTop: 4, fontWeight: 700 }}>● Con reventa real de la zona</div>
            : <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--warm, #E2982E)', marginTop: 4 }}>● Referencia estimada — se afina cuando hay más captaciones en la zona</div>}
        </div>
      )}

      {/* 3 · Amenidades (mismo selector interactivo del dev) */}
      <div style={secTitle}>{bar} Amenidades {f.amenity_keys.length > 0 && <span style={{ fontSize: 11, color: 'var(--theme)', fontWeight: 700 }}>· {f.amenity_keys.length}</span>}</div>
      {!showAmen ? (
        <button type="button" onClick={() => setShowAmen(true)} data-testid="capt-amen-open"
          style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, padding: '9px 14px', borderRadius: 12, cursor: 'pointer', border: '1px dashed var(--border)', background: '#fff', color: 'var(--cream-2)' }}>
          + Elegir amenidades {f.amenity_keys.length > 0 ? `(${f.amenity_keys.length} elegidas)` : '(opcional)'}
        </button>
      ) : catalog === null ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12.5 }}>Cargando amenidades…</div>
      ) : !catalog ? (
        <div style={{ color: 'var(--hot, #F2635B)', fontSize: 12.5 }}>No se pudo cargar el catálogo.</div>
      ) : (
        <div data-testid="capt-amenities">
          {Object.entries(catalog.all_categories || {}).map(([sectionKey, options]) => (
            <AmenitySection key={sectionKey} sectionKey={sectionKey} sectionLabel={SECTION_LABELS[sectionKey] || sectionKey}
              allOptions={options} selected={f.amenity_keys} isEditing={true} onToggle={toggleAmenity} />
          ))}
        </div>
      )}

      {/* 4 · Propietario */}
      <div style={secTitle}>{bar} Propietario (opcional)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label><div style={lblStyle}>Nombre</div><input value={f.propietario_nombre} onChange={e => set({ propietario_nombre: e.target.value })} style={inputStyle} /></label>
        <label><div style={lblStyle}>Teléfono</div><input value={f.propietario_telefono} onChange={e => set({ propietario_telefono: e.target.value })} style={inputStyle} /></label>
      </div>

      <button onClick={submit} disabled={!ready || sub} data-testid="capt-submit" className="btn btn-primary" style={{ justifyContent: 'center', opacity: (!ready || sub) ? 0.6 : 1, marginTop: 4 }}>
        {sub ? 'Creando…' : 'Crear captación'}
      </button>
      {!ready && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>Completa dirección + tipo de operación + precio sugerido para continuar.</div>}
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', lineHeight: 1.4 }}>Entre más detalles, mejor valúa el sistema tu propiedad y más fuerte tu comparativo.</div>
    </div>
  );
}

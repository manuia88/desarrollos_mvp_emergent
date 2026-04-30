// /asesor/busquedas — Kanban of búsquedas with hard stage validations + matches drawer
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Badge, Empty, Drawer, Toast, fmtMXN } from '../../components/advisor/primitives';
import * as api from '../../api/advisor';
import { Sparkle, ArrowRight } from '../../components/icons';

const STAGES = [
  { k: 'pendiente',  label: 'Pendiente',  tone: 'neutral' },
  { k: 'buscando',   label: 'Buscando',   tone: 'brand' },
  { k: 'visitando',  label: 'Visitando',  tone: 'warn' },
  { k: 'ofertando',  label: 'Ofertando',  tone: 'pink' },
  { k: 'cerrando',   label: 'Cerrando',   tone: 'warn' },
  { k: 'ganada',     label: 'Ganada',     tone: 'ok' },
];

export default function AsesorBusquedas({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [detail, setDetail] = useState(null);
  const [matches, setMatches] = useState(null);
  const [ganadaPrompt, setGanadaPrompt] = useState(null); // { busqueda_id }
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [bs, cs] = await Promise.all([api.listBusquedas(), api.listContactos({})]);
      setItems(bs); setContacts(cs);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onDrop = async (stage) => {
    if (!dragging) return;
    const id = dragging;
    setDragging(null);
    const item = items.find(x => x.id === id);
    if (!item || item.stage === stage) return;
    // Optimistic
    setItems(prev => prev.map(x => x.id === id ? { ...x, stage } : x));
    try {
      await api.moveBusqueda(id, stage);
      setToast({ kind: 'success', text: `Movido a ${stage}` });
      if (stage === 'ganada') {
        setGanadaPrompt({ busqueda_id: id });
      }
    } catch (e) {
      setToast({ kind: 'error', text: e.body?.detail || 'Validación fallida' });
      load();
    }
  };

  const regVisit = async (id) => {
    try { await api.registerVisit(id); setToast({ kind: 'success', text: 'Visita registrada' }); load(); } catch (e) { setToast({ kind: 'error', text: 'Error al registrar visita' }); }
  };
  const regOffer = async (id) => {
    try { await api.registerOffer(id); setToast({ kind: 'success', text: 'Oferta registrada' }); load(); } catch (e) { setToast({ kind: 'error', text: 'Error al registrar oferta' }); }
  };

  const openDetail = async (b) => {
    setDetail(b);
    setMatches(null);
    try {
      const m = await api.getMatches(b.id);
      setMatches(m);
    } catch { setMatches([]); }
  };

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CRM · BÚSQUEDAS"
        title="Pipeline de búsquedas"
        sub="Arrastra y suelta entre etapas. Las transiciones tienen validaciones duras (visita registrada, oferta aceptada)."
        actions={
          <button onClick={() => setShowCreate(true)} data-testid="new-busq-btn" className="btn btn-primary">
            + Nueva búsqueda
          </button>
        }
      />

      {loading ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : items.length === 0 ? <Empty title="Sin búsquedas" sub="Crea una búsqueda para empezar a matchear desarrollos." />
        : (
          <div data-testid="busq-kanban" style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, minmax(230px, 1fr))`, gap: 10, overflowX: 'auto' }}>
            {STAGES.map(st => {
              const col = items.filter(x => x.stage === st.k);
              return (
                <div key={st.k} data-testid={`col-${st.k}`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(st.k)}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 16, padding: 10, minHeight: 400,
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 6px 10px' }}>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream-2)' }}>{col.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {col.map(b => {
                      const contact = contacts.find(c => c.id === b.contacto_id);
                      return (
                        <div key={b.id} draggable
                          onDragStart={() => setDragging(b.id)}
                          onClick={() => openDetail(b)}
                          data-testid={`busq-card-${b.id}`}
                          style={{
                            padding: 12,
                            background: 'linear-gradient(180deg, #0D1118, #0A0D16)',
                            border: '1px solid var(--border)',
                            borderRadius: 12, cursor: 'grab',
                            transition: 'transform 0.15s, border-color 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.32)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 4 }}>
                            {contact ? `${contact.first_name} ${contact.last_name || ''}` : '—'}
                          </div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 8 }}>
                            {b.recamaras_min}+ rec · {fmtMXN(b.precio_min || 0)}–{fmtMXN(b.precio_max || 0)}
                          </div>
                          {b.colonias?.length > 0 && (
                            <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-2)', marginBottom: 8 }}>
                              {b.colonias.slice(0, 3).join(' · ')}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <Badge tone="neutral">{b.visits || 0} visitas</Badge>
                            <Badge tone="neutral">{b.offers || 0} ofertas</Badge>
                            {b.urgencia === 'alta' && <Badge tone="bad">Urgente</Badge>}
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                            <button onClick={e => { e.stopPropagation(); regVisit(b.id); }} data-testid={`visit-${b.id}`} className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}>+ visita</button>
                            <button onClick={e => { e.stopPropagation(); regOffer(b.id); }} data-testid={`offer-${b.id}`} className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}>+ oferta</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="Nueva búsqueda" width={560}>
        <CreateBusqForm contacts={contacts}
          onCreated={() => { setShowCreate(false); setToast({ kind: 'success', text: 'Búsqueda creada' }); load(); }}
          onError={t => setToast({ kind: 'error', text: t })} />
      </Drawer>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title="Matches del motor" width={620}>
        {detail && (
          <div>
            <div style={{ marginBottom: 14, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
              Motor determinístico 5 dimensiones: precio 30% + zona 25% + amenidades 20% + recámaras 15% + urgencia 10%.
            </div>
            {!matches ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Calculando…</div>
              : matches.length === 0 ? <Empty title="Sin matches" sub="Ajusta criterios de la búsqueda." />
              : matches.map(m => (
                <Card key={m.dev_id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{m.name}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 8 }}>
                        {m.colonia} · desde {fmtMXN(m.price_from)}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {m.rationale.map((r, i) => <Badge key={i} tone="brand">{r}</Badge>)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {m.score}
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>match</div>
                    </div>
                  </div>
                  <a href={`/desarrollo/${m.dev_id}`} target="_blank" rel="noreferrer" className="btn btn-glass btn-sm" style={{ marginTop: 10, fontSize: 11 }}>
                    Ver ficha <ArrowRight size={10} />
                  </a>
                </Card>
              ))
            }
          </div>
        )}
      </Drawer>

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}

      {ganadaPrompt && (
        <div data-testid="ganada-modal" onClick={() => setGanadaPrompt(null)} style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 480, maxWidth: '100%',
            background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
            border: '1px solid rgba(99,102,241,0.28)', borderRadius: 22,
            padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.38)', borderRadius: 9999, marginBottom: 14 }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth={3}><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5, color: '#86efac', letterSpacing: '0.12em', textTransform: 'uppercase' }}>BÚSQUEDA GANADA</span>
            </div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', letterSpacing: '-0.02em', margin: '0 0 10px', lineHeight: 1.15 }}>
              Esta búsqueda cerró. ¿Crear operación ahora?
            </h2>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 22px' }}>
              Pre-llenamos el wizard con contacto, desarrollo top-match y valor estimado. Solo necesitas confirmar y completar comisión + notas.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button data-testid="ganada-later" onClick={() => setGanadaPrompt(null)}
                className="btn btn-glass" style={{ flex: 1, justifyContent: 'center' }}>
                Más tarde
              </button>
              <button data-testid="ganada-create-op"
                onClick={() => { nav(`/asesor/operaciones?prefillBusq=${ganadaPrompt.busqueda_id}`); setGanadaPrompt(null); }}
                className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }}>
                Crear operación
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </AdvisorLayout>
  );
}

function CreateBusqForm({ contacts, onCreated, onError }) {
  const [f, setF] = useState({ contacto_id: contacts[0]?.id || '', recamaras_min: 2, precio_min: '', precio_max: '', colonias: '', amenidades: '', urgencia: 'media' });
  const [sub, setSub] = useState(false);
  const submit = async () => {
    if (!f.contacto_id) return onError('Selecciona un contacto');
    setSub(true);
    try {
      await api.createBusqueda({
        contacto_id: f.contacto_id,
        recamaras_min: +f.recamaras_min || 1,
        precio_min: f.precio_min ? +f.precio_min : null,
        precio_max: f.precio_max ? +f.precio_max : null,
        colonias: f.colonias.split(',').map(s => s.trim()).filter(Boolean),
        amenidades: f.amenidades.split(',').map(s => s.trim()).filter(Boolean),
        urgencia: f.urgencia,
      });
      onCreated();
    } catch (e) { onError('No se pudo crear'); }
    finally { setSub(false); }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' };
  const lblStyle = { fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label><div style={lblStyle}>Contacto *</div>
        <select value={f.contacto_id} onChange={e => setF({ ...f, contacto_id: e.target.value })} data-testid="busq-contacto" className="asr-select" style={{ width: '100%' }}>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <label><div style={lblStyle}>Recámaras mín</div>
          <input type="number" min={0} value={f.recamaras_min} onChange={e => setF({ ...f, recamaras_min: e.target.value })} style={inputStyle} data-testid="busq-beds" />
        </label>
        <label><div style={lblStyle}>Precio mín</div>
          <input type="number" value={f.precio_min} onChange={e => setF({ ...f, precio_min: e.target.value })} style={inputStyle} data-testid="busq-pmin" />
        </label>
        <label><div style={lblStyle}>Precio máx</div>
          <input type="number" value={f.precio_max} onChange={e => setF({ ...f, precio_max: e.target.value })} style={inputStyle} data-testid="busq-pmax" />
        </label>
      </div>
      <label><div style={lblStyle}>Colonias (IDs separados por coma)</div>
        <input value={f.colonias} onChange={e => setF({ ...f, colonias: e.target.value })} placeholder="polanco, condesa" style={inputStyle} data-testid="busq-colonias" />
      </label>
      <label><div style={lblStyle}>Amenidades deseadas</div>
        <input value={f.amenidades} onChange={e => setF({ ...f, amenidades: e.target.value })} placeholder="gym, alberca, roof" style={inputStyle} data-testid="busq-amen" />
      </label>
      <label><div style={lblStyle}>Urgencia</div>
        <select value={f.urgencia} onChange={e => setF({ ...f, urgencia: e.target.value })} className="asr-select" style={{ width: '100%' }}>
          <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
        </select>
      </label>
      <button onClick={submit} disabled={sub} data-testid="busq-submit" className="btn btn-primary" style={{ justifyContent: 'center', opacity: sub ? 0.6 : 1 }}>
        {sub ? 'Creando…' : 'Crear búsqueda'}
      </button>
    </div>
  );
}

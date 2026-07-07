/**
 * SuperadminDesarrolladorFicha — ficha granular de UN desarrollador (dev org).
 * El founder crea cuentas (incluso vacías) y las gestiona él mismo desde aquí: ve/edita/agrega
 * los proyectos del dev, edita los datos del dev, le da acceso directo o copia el link de reclamo.
 * Reusa: alta/proyecto (crear), alta/proyecto/{id} (editar básicos), devmaster marketplace (publicar),
 * y la ficha existente /superadmin/desarrollos/:id (ver/editar fino por impersonación).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { ArrowLeft, Building2, KeyRound, Link2, Pencil, Plus, Check, ExternalLink } from 'lucide-react';
import {
  detalleDesarrollador, editarDesarrollador, darAccesoDesarrollador,
  altaProyecto, editarProyecto,
} from '../../api/superadminAlta';
import { approveProject } from '../../api/superadminDevmaster';

const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '18px 20px' };
const inp = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', marginTop: 4 };
const lbl = { fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'rgba(240,235,224,0.6)' };
const btn = (on = true) => ({ padding: '9px 15px', borderRadius: 10, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: on ? 'pointer' : 'not-allowed', opacity: on ? 1 : 0.5, background: 'rgba(var(--theme-rgb),0.16)', border: '1px solid rgba(var(--theme-rgb),0.45)', color: 'var(--theme)' });
const ghost = { padding: '8px 13px', borderRadius: 9, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,235,224,0.82)' };
const chip = (bg, bd, c) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color: c, border: `1px solid ${bd}` });
const mxn = (n) => (Number(n) ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : '—');

function Field({ label, children }) {
  return <label style={{ display: 'block', marginBottom: 10 }}><span style={lbl}>{label}</span>{children}</label>;
}

function PubChip({ mp }) {
  if (mp === true) return <span style={chip('rgba(31,160,106,0.14)', 'rgba(31,160,106,0.3)', '#6EE7B7')}>Publicado</span>;
  if (mp === 'pending') return <span style={chip('rgba(234,179,8,0.14)', 'rgba(234,179,8,0.3)', '#FCD34D')}>Pendiente</span>;
  return <span style={chip('rgba(255,255,255,0.06)', 'rgba(255,255,255,0.14)', 'rgba(240,235,224,0.6)')}>Oculto</span>;
}

const STAGES = [['preventa', 'Preventa'], ['construccion', 'Construcción'], ['entrega', 'Entrega']];

export default function SuperadminDesarrolladorFicha() {
  const { devOrgId } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);           // {tipo, txt}
  const [busy, setBusy] = useState(false);

  const [editDev, setEditDev] = useState(null);   // {name, plan_tier, contact_email} | null
  const [access, setAccess] = useState(null);      // {email, password} | null
  const [newProj, setNewProj] = useState(null);    // form | null
  const [editProj, setEditProj] = useState(null);  // {id, ...fields} | null
  const [openData, setOpenData] = useState(null);  // id del proyecto cuyos datos extraídos se ven

  const load = useCallback(() => {
    detalleDesarrollador(devOrgId).then(setD).catch((e) => setErr(e.message));
  }, [devOrgId]);
  useEffect(() => { load(); }, [load]);

  const pending = d && d.status !== 'active';

  const saveDev = async () => {
    setBusy(true); setMsg(null);
    try { await editarDesarrollador(devOrgId, editDev); setEditDev(null); setMsg({ tipo: 'ok', txt: 'Datos del desarrollador actualizados.' }); load(); }
    catch (e) { setMsg({ tipo: 'err', txt: e.message }); }
    finally { setBusy(false); }
  };

  const giveAccess = async () => {
    if (!access.email || access.password.length < 8) { setMsg({ tipo: 'err', txt: 'Email válido y contraseña de 8+ requeridos.' }); return; }
    setBusy(true); setMsg(null);
    try { await darAccesoDesarrollador(devOrgId, access); setAccess(null); setMsg({ tipo: 'ok', txt: 'Acceso creado. El dev ya puede entrar con ese email y contraseña.' }); load(); }
    catch (e) { setMsg({ tipo: 'err', txt: e.message }); }
    finally { setBusy(false); }
  };

  const createProj = async () => {
    if (!newProj.name) { setMsg({ tipo: 'err', txt: 'Escribe el nombre del proyecto.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await altaProyecto({ ...newProj, dev_org_id: devOrgId, total_units: Number(newProj.total_units) || 0, price_from: newProj.price_from ? Number(newProj.price_from) : null });
      setNewProj(null); setMsg({ tipo: 'ok', txt: 'Proyecto creado (queda pendiente de publicar).' }); load();
    } catch (e) { setMsg({ tipo: 'err', txt: e.message }); }
    finally { setBusy(false); }
  };

  const saveProj = async () => {
    setBusy(true); setMsg(null);
    try {
      const { id, ...body } = editProj;
      await editarProyecto(id, { ...body, total_units: body.total_units === '' ? null : Number(body.total_units), price_from: body.price_from === '' ? null : Number(body.price_from) });
      setEditProj(null); setMsg({ tipo: 'ok', txt: 'Proyecto actualizado.' }); load();
    } catch (e) { setMsg({ tipo: 'err', txt: e.message }); }
    finally { setBusy(false); }
  };

  const togglePublish = async (p) => {
    setBusy(true); setMsg(null);
    try { await approveProject(p.id, p.marketplace_published !== true); setMsg({ tipo: 'ok', txt: p.marketplace_published === true ? 'Proyecto ocultado del marketplace.' : 'Proyecto publicado en el marketplace.' }); load(); }
    catch (e) { setMsg({ tipo: 'err', txt: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <SuperadminLayout>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <button onClick={() => nav('/superadmin/alta')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'rgba(240,235,224,0.6)', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13, marginBottom: 14, padding: 0 }}>
          <ArrowLeft size={15} /> Desarrolladores
        </button>

        {err && <div style={{ ...card, color: '#fecaca' }}>No se pudo cargar: {err}</div>}
        {!d && !err && <div style={{ fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.55)' }}>Cargando ficha…</div>}

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 11, marginBottom: 14, fontFamily: 'DM Sans', fontSize: 13,
            background: msg.tipo === 'ok' ? 'rgba(31,160,106,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${msg.tipo === 'ok' ? 'rgba(31,160,106,0.3)' : 'rgba(239,68,68,0.3)'}`, color: msg.tipo === 'ok' ? '#6EE7B7' : '#fecaca' }}>
            {msg.tipo === 'ok' && <Check size={13} style={{ verticalAlign: -1, marginRight: 5 }} />}{msg.txt}
          </div>
        )}

        {d && (
          <>
            {/* Header + acciones del dev */}
            <div style={{ ...card, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <Building2 size={20} color="var(--theme)" />
                    <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: 0 }}>{d.name}</h1>
                    <span style={pending ? chip('rgba(99,102,241,0.14)', 'rgba(99,102,241,0.3)', '#A5B4FC') : chip('rgba(31,160,106,0.14)', 'rgba(31,160,106,0.3)', '#6EE7B7')}>{pending ? 'Sin reclamar' : 'Activo'}</span>
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.6)' }}>
                    {d.email || 'sin acceso todavía'} · plan {d.plan_tier} · {d.total_proyectos} proyecto(s)
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => setEditDev({ name: d.name || '', plan_tier: d.plan_tier || 'pro', contact_email: d.contact_email || '' })} style={ghost}><Pencil size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Editar</button>
                  {pending && d.claim_path && (
                    <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}${d.claim_path}`); setMsg({ tipo: 'ok', txt: 'Link de reclamo copiado.' }); }} style={ghost}><Link2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Copiar link</button>
                  )}
                  {pending && !d.has_user && (
                    <button onClick={() => setAccess({ email: d.contact_email || '', password: '' })} style={btn(true)}><KeyRound size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Darle acceso</button>
                  )}
                </div>
              </div>

              {/* Editar dev inline */}
              {editDev && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Field label="Nombre / empresa"><input style={inp} value={editDev.name} onChange={(e) => setEditDev({ ...editDev, name: e.target.value })} /></Field>
                  <Field label="Plan"><select style={inp} value={editDev.plan_tier} onChange={(e) => setEditDev({ ...editDev, plan_tier: e.target.value })}><option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></Field>
                  <Field label="Correo de contacto"><input style={inp} value={editDev.contact_email} onChange={(e) => setEditDev({ ...editDev, contact_email: e.target.value })} placeholder="dev@empresa.mx" /></Field>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                    <button onClick={saveDev} disabled={busy} style={btn(!busy)}>Guardar</button>
                    <button onClick={() => setEditDev(null)} style={ghost}>Cancelar</button>
                  </div>
                </div>
              )}

              {/* Dar acceso inline */}
              {access && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.65)', marginBottom: 8 }}>Crea el acceso ahora (sin mandar link). El dev entrará con este email y contraseña.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                    <Field label="Email"><input style={inp} value={access.email} onChange={(e) => setAccess({ ...access, email: e.target.value })} placeholder="admin@empresa.mx" /></Field>
                    <Field label="Contraseña (8+)"><input style={inp} type="text" value={access.password} onChange={(e) => setAccess({ ...access, password: e.target.value })} placeholder="temporal" /></Field>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <button onClick={giveAccess} disabled={busy} style={btn(!busy)}>Crear acceso</button>
                      <button onClick={() => setAccess(null)} style={ghost}>Cancelar</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Proyectos */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontFamily: 'Outfit', fontSize: 15, color: 'var(--cream)' }}>Proyectos ({d.total_proyectos})</b>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => nav(`/desarrollador/proyectos/nuevo?dev=${encodeURIComponent(devOrgId)}&devName=${encodeURIComponent(d.name || '')}`)} style={btn(true)} data-testid="ficha-wizard">
                    <Plus size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Agregar proyecto (completo)
                  </button>
                  <button onClick={() => setNewProj({ name: '', colonia: '', alcaldia: '', total_units: '', price_from: '', tipo_proyecto: 'vertical', stage: 'preventa' })} style={ghost} data-testid="ficha-quick">Alta rápida</button>
                </div>
              </div>

              {/* Nuevo proyecto inline */}
              {newProj && (
                <div style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: 'rgba(var(--theme-rgb),0.05)', border: '1px solid rgba(var(--theme-rgb),0.25)' }}>
                  <Field label="Nombre del proyecto"><input style={inp} value={newProj.name} onChange={(e) => setNewProj({ ...newProj, name: e.target.value })} placeholder="Torre Aurora Roma" /></Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Field label="Colonia"><input style={inp} value={newProj.colonia} onChange={(e) => setNewProj({ ...newProj, colonia: e.target.value })} placeholder="Roma Norte" /></Field>
                    <Field label="Alcaldía"><input style={inp} value={newProj.alcaldia} onChange={(e) => setNewProj({ ...newProj, alcaldia: e.target.value })} placeholder="Cuauhtémoc" /></Field>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <Field label="Unidades"><input style={inp} type="number" value={newProj.total_units} onChange={(e) => setNewProj({ ...newProj, total_units: e.target.value })} placeholder="48" /></Field>
                    <Field label="Precio desde"><input style={inp} type="number" value={newProj.price_from} onChange={(e) => setNewProj({ ...newProj, price_from: e.target.value })} placeholder="3500000" /></Field>
                    <Field label="Etapa"><select style={inp} value={newProj.stage} onChange={(e) => setNewProj({ ...newProj, stage: e.target.value })}>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={createProj} disabled={busy} style={btn(!busy)}>Crear proyecto</button>
                    <button onClick={() => setNewProj(null)} style={ghost}>Cancelar</button>
                  </div>
                </div>
              )}

              {d.proyectos.length === 0 && !newProj && (
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)', padding: '10px 0' }}>Este desarrollador aún no tiene proyectos. Agrégale el primero.</div>
              )}

              <div style={{ display: 'grid', gap: 10 }}>
                {d.proyectos.map((p) => (
                  <div key={p.id} data-testid={`proj-${p.id}`} style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {editProj && editProj.id === p.id ? (
                      <div>
                        <Field label="Nombre"><input style={inp} value={editProj.name} onChange={(e) => setEditProj({ ...editProj, name: e.target.value })} /></Field>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <Field label="Colonia"><input style={inp} value={editProj.colonia} onChange={(e) => setEditProj({ ...editProj, colonia: e.target.value })} /></Field>
                          <Field label="Alcaldía"><input style={inp} value={editProj.alcaldia} onChange={(e) => setEditProj({ ...editProj, alcaldia: e.target.value })} /></Field>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <Field label="Unidades"><input style={inp} type="number" value={editProj.total_units} onChange={(e) => setEditProj({ ...editProj, total_units: e.target.value })} /></Field>
                          <Field label="Precio desde"><input style={inp} type="number" value={editProj.price_from} onChange={(e) => setEditProj({ ...editProj, price_from: e.target.value })} /></Field>
                          <Field label="Etapa"><select style={inp} value={editProj.stage || 'preventa'} onChange={(e) => setEditProj({ ...editProj, stage: e.target.value })}>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={saveProj} disabled={busy} style={btn(!busy)}>Guardar</button>
                          <button onClick={() => setEditProj(null)} style={ghost}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>{p.name}</span>
                            <PubChip mp={p.marketplace_published} />
                          </div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', marginTop: 2 }}>
                            {[p.colonia, p.stage, p.total_units ? `${p.total_units} u.` : null, p.price_from ? `desde ${mxn(p.price_from)}` : null].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button onClick={() => setOpenData(openData === p.id ? null : p.id)} style={openData === p.id ? btn(true) : ghost} data-testid={`proj-verdatos-${p.id}`}>{openData === p.id ? 'Ocultar datos' : 'Ver datos'}</button>
                          <button onClick={() => setEditProj({ id: p.id, name: p.name || '', colonia: p.colonia || '', alcaldia: p.alcaldia || '', total_units: p.total_units ?? '', price_from: p.price_from ?? '', stage: p.stage || 'preventa' })} style={ghost}><Pencil size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Editar</button>
                          <button onClick={() => togglePublish(p)} disabled={busy} style={ghost}>{p.marketplace_published === true ? 'Ocultar' : 'Publicar'}</button>
                          <button onClick={() => nav(`/superadmin/desarrollos/${p.id}`)} style={ghost}><ExternalLink size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Abrir ficha</button>
                        </div>
                      </div>
                      {openData === p.id && (
                        <div data-testid={`proj-data-${p.id}`} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'rgba(240,235,224,0.45)', marginBottom: 8 }}>Lo que la IA sacó de los documentos</div>
                          {[
                            ['Dirección', p.address || p.colonia, true],
                            ['Precio desde', p.price_from ? mxn(p.price_from) : null, true],
                            ['Unidades', p.total_units || null, true],
                            ['Amenidades', (p.amenities || []).length ? `${p.amenities.length}: ${p.amenities.slice(0, 12).join(', ')}` : null, true],
                            ['Ubicación en mapa', p.has_geo ? 'sí ✓' : null, false],
                            ['Archivos leídos', p.source_files || null, false],
                          ].map(([lbl, val, warn]) => (
                            <div key={lbl} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', minWidth: 130 }}>{lbl}</span>
                              <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, color: val ? 'var(--cream)' : '#F87171', flex: 1 }}>
                                {val || (warn ? '🔴 la IA no lo encontró — edítalo o complétalo' : '—')}
                              </span>
                            </div>
                          ))}
                          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)', marginTop: 8 }}>
                            ¿Falta algo? Usa <b style={{ color: 'var(--cream)' }}>Editar</b> para completarlo, o <b style={{ color: 'var(--cream)' }}>Abrir ficha</b> para el detalle completo (fotos, unidades, pagos).
                          </div>
                        </div>
                      )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </SuperadminLayout>
  );
}

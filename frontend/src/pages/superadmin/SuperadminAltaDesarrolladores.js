/**
 * SuperadminAltaDesarrolladores — dar de alta desarrolladores y sus proyectos.
 * Dos caras: MANUAL (formularios aquí) y AUTOMATIZADO (ingesta masiva desde Google Drive, ya existe).
 * Reusa /api/superadmin/alta/* (backend superadmin_alta.py).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { UserPlus, Building2, Sparkles, ArrowRight, Check } from 'lucide-react';
import { altaDesarrollador, listarDesarrolladores, altaProyecto } from '../../api/superadminAlta';

const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '18px 20px' };
const inp = { width: '100%', padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', marginTop: 4 };
const lbl = { fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'rgba(240,235,224,0.6)' };
const btn = (on = true) => ({ padding: '10px 18px', borderRadius: 10, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: on ? 'pointer' : 'not-allowed', opacity: on ? 1 : 0.5, background: 'rgba(var(--theme-rgb),0.16)', border: '1px solid rgba(var(--theme-rgb),0.45)', color: 'var(--theme)' });

function Field({ label, children }) {
  return <label style={{ display: 'block', marginBottom: 10 }}><span style={lbl}>{label}</span>{children}</label>;
}

export default function SuperadminAltaDesarrolladores() {
  const nav = useNavigate();
  const [tab, setTab] = useState('manual');
  const [devs, setDevs] = useState([]);
  const [msg, setMsg] = useState(null);      // {tipo:'ok'|'err', txt}
  const [busy, setBusy] = useState(false);

  // form desarrollador
  const [dev, setDev] = useState({ name: '', email: '', password: '', plan_tier: 'pro' });
  // form proyecto
  const [proj, setProj] = useState({ dev_org_id: '', name: '', colonia: '', alcaldia: '', total_units: '', price_from: '', tipo_proyecto: 'vertical', stage: 'preventa' });

  const cargar = useCallback(() => {
    listarDesarrolladores().then((d) => setDevs(d.desarrolladores || [])).catch(() => setDevs([]));
  }, []);
  useEffect(cargar, [cargar]);

  const crearDev = async () => {
    if (!dev.name || !dev.email || dev.password.length < 8) { setMsg({ tipo: 'err', txt: 'Nombre, email y contraseña (8+) requeridos.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await altaDesarrollador(dev);
      setMsg({ tipo: 'ok', txt: `Desarrollador "${r.name}" creado. Ya puede entrar con ${r.email}.` });
      setDev({ name: '', email: '', password: '', plan_tier: 'pro' });
      setProj((p) => ({ ...p, dev_org_id: r.dev_org_id }));   // preselecciona para crear su proyecto
      cargar();
    } catch (e) { setMsg({ tipo: 'err', txt: e.message || 'No se pudo crear.' }); }
    finally { setBusy(false); }
  };

  const crearProyecto = async () => {
    if (!proj.dev_org_id || !proj.name) { setMsg({ tipo: 'err', txt: 'Elige desarrollador y escribe el nombre del proyecto.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await altaProyecto({ ...proj, total_units: Number(proj.total_units) || 0, price_from: proj.price_from ? Number(proj.price_from) : null });
      setMsg({ tipo: 'ok', txt: `Proyecto creado (${r.project_id}). ${r.nota}` });
      setProj((p) => ({ ...p, name: '', colonia: '', alcaldia: '', total_units: '', price_from: '' }));
      cargar();
    } catch (e) { setMsg({ tipo: 'err', txt: e.message || 'No se pudo crear.' }); }
    finally { setBusy(false); }
  };

  return (
    <SuperadminLayout>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Building2 size={20} color="var(--theme)" />
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: 0 }}>Alta de desarrolladores y proyectos</h1>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.6)', marginBottom: 16 }}>
          Da de alta un desarrollador y sus proyectos a mano, o cárgalos en lote automáticamente desde una carpeta de Google Drive.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['manual', 'Manual'], ['automatizado', 'Automatizado (lote)'], ['lista', `Desarrolladores (${devs.length})`]].map(([k, l]) => (
            <button key={k} data-testid={`alta-tab-${k}`} onClick={() => setTab(k)}
              style={{ padding: '7px 15px', borderRadius: 10, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                background: tab === k ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${tab === k ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: tab === k ? 'var(--theme)' : 'rgba(240,235,224,0.6)' }}>{l}</button>
          ))}
        </div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 11, marginBottom: 14, fontFamily: 'DM Sans', fontSize: 13,
            background: msg.tipo === 'ok' ? 'rgba(31,160,106,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${msg.tipo === 'ok' ? 'rgba(31,160,106,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: msg.tipo === 'ok' ? '#6EE7B7' : '#fecaca' }}>
            {msg.tipo === 'ok' && <Check size={13} style={{ verticalAlign: -1, marginRight: 5 }} />}{msg.txt}
          </div>
        )}

        {tab === 'manual' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Desarrollador */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <UserPlus size={16} color="var(--theme)" /><b style={{ fontFamily: 'Outfit', fontSize: 15, color: 'var(--cream)' }}>1. Nuevo desarrollador</b>
              </div>
              <Field label="Nombre / empresa"><input style={inp} value={dev.name} onChange={(e) => setDev({ ...dev, name: e.target.value })} data-testid="dev-name" placeholder="Constructora Aurora" /></Field>
              <Field label="Email del admin"><input style={inp} value={dev.email} onChange={(e) => setDev({ ...dev, email: e.target.value })} data-testid="dev-email" placeholder="admin@aurora.mx" /></Field>
              <Field label="Contraseña (8+)"><input style={inp} type="text" value={dev.password} onChange={(e) => setDev({ ...dev, password: e.target.value })} data-testid="dev-pass" placeholder="temporal, el dev la cambia" /></Field>
              <Field label="Plan"><select style={inp} value={dev.plan_tier} onChange={(e) => setDev({ ...dev, plan_tier: e.target.value })}><option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></Field>
              <button onClick={crearDev} disabled={busy} style={btn(!busy)} data-testid="dev-crear">Crear desarrollador</button>
            </div>

            {/* Proyecto */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Building2 size={16} color="var(--theme)" /><b style={{ fontFamily: 'Outfit', fontSize: 15, color: 'var(--cream)' }}>2. Nuevo proyecto</b>
              </div>
              <Field label="Desarrollador">
                <select style={inp} value={proj.dev_org_id} onChange={(e) => setProj({ ...proj, dev_org_id: e.target.value })} data-testid="proj-dev">
                  <option value="">— elige —</option>
                  {devs.map((d) => <option key={d.dev_org_id} value={d.dev_org_id}>{d.name} ({d.proyectos})</option>)}
                </select>
              </Field>
              <Field label="Nombre del proyecto"><input style={inp} value={proj.name} onChange={(e) => setProj({ ...proj, name: e.target.value })} data-testid="proj-name" placeholder="Torre Aurora Roma" /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Colonia"><input style={inp} value={proj.colonia} onChange={(e) => setProj({ ...proj, colonia: e.target.value })} placeholder="Roma Norte" /></Field>
                <Field label="Alcaldía"><input style={inp} value={proj.alcaldia} onChange={(e) => setProj({ ...proj, alcaldia: e.target.value })} placeholder="Cuauhtémoc" /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <Field label="Unidades"><input style={inp} type="number" value={proj.total_units} onChange={(e) => setProj({ ...proj, total_units: e.target.value })} placeholder="48" /></Field>
                <Field label="Precio desde"><input style={inp} type="number" value={proj.price_from} onChange={(e) => setProj({ ...proj, price_from: e.target.value })} placeholder="3500000" /></Field>
                <Field label="Etapa"><select style={inp} value={proj.stage} onChange={(e) => setProj({ ...proj, stage: e.target.value })}><option value="preventa">Preventa</option><option value="construccion">Construcción</option><option value="entrega">Entrega</option></select></Field>
              </div>
              <button onClick={crearProyecto} disabled={busy} style={btn(!busy)} data-testid="proj-crear">Crear proyecto</button>
              <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)', marginTop: 8 }}>Nace en el catálogo. Las unidades/fotos/precio se completan desde su ficha o por Ingesta masiva.</p>
            </div>
          </div>
        )}

        {tab === 'automatizado' && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Sparkles size={16} color="var(--theme)" /><b style={{ fontFamily: 'Outfit', fontSize: 16, color: 'var(--cream)' }}>Ingesta masiva desde Google Drive</b>
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)', lineHeight: 1.6, marginBottom: 14 }}>
              Pega la URL de una carpeta de Drive (una subcarpeta por proyecto). El sistema descarga las fichas/PDFs,
              extrae con IA el nombre, ubicación, unidades y precios, y te deja una cola de revisión para aprobar o corregir
              antes de publicar. Es la vía para dar de alta muchos proyectos de golpe.
            </p>
            <button onClick={() => nav('/superadmin/bulk-ingest')} style={btn()} data-testid="ir-ingesta">
              Ir a Ingesta masiva <ArrowRight size={14} style={{ verticalAlign: -2 }} />
            </button>
          </div>
        )}

        {tab === 'lista' && (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Desarrollador', 'Email', 'Plan', 'Alta', 'Proyectos'].map((c) => (
                <th key={c} style={{ textAlign: 'left', fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.5)', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{c}</th>))}</tr></thead>
              <tbody>
                {devs.map((d) => (
                  <tr key={d.dev_org_id} data-testid={`dev-row-${d.dev_org_id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{d.name}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>{d.email}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>{d.plan_tier}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Sans', fontSize: 11.5, color: d.alta === 'superadmin' ? 'var(--theme)' : 'rgba(240,235,224,0.55)' }}>{d.alta}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>{d.proyectos}</td>
                  </tr>
                ))}
                {devs.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)' }}>Aún no hay desarrolladores. Crea el primero en "Manual".</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}

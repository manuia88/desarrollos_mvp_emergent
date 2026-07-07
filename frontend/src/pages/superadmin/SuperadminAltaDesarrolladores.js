/**
 * SuperadminAltaDesarrolladores — dar de alta desarrolladores y sus proyectos.
 * Dos caras: MANUAL (formularios aquí) y AUTOMATIZADO (ingesta masiva desde Google Drive, ya existe).
 * Reusa /api/superadmin/alta/* (backend superadmin_alta.py).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { UserPlus, Building2, Sparkles, ArrowRight, Check, UploadCloud } from 'lucide-react';
import { altaDesarrollador, listarDesarrolladores, altaProyecto, uploadIngesta, ingestaJob } from '../../api/superadminAlta';

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
  const [shell, setShell] = useState(false);      // crear cuenta VACÍA (sin credenciales) para reclamar después
  const [claimLink, setClaimLink] = useState(null);
  // form proyecto
  const [proj, setProj] = useState({ dev_org_id: '', name: '', colonia: '', alcaldia: '', total_units: '', price_from: '', tipo_proyecto: 'vertical', stage: 'preventa' });
  // upload IA (PDF/XLS/imágenes → la IA llena los campos)
  const [upFiles, setUpFiles] = useState([]);
  const [upName, setUpName] = useState('');
  const [upDev, setUpDev] = useState('');
  const [upJob, setUpJob] = useState(null);   // {status, extracted, ...}

  const correrUpload = async () => {
    if (upFiles.length === 0) { setMsg({ tipo: 'err', txt: 'Arrastra o elige al menos un PDF/XLS/imagen.' }); return; }
    setBusy(true); setMsg(null); setUpJob({ status: 'extracting' });
    try {
      const r = await uploadIngesta(upFiles, upName, upDev);
      // poll el job hasta que termine (la IA extrae en background)
      let done = null;
      for (let i = 0; i < 30 && !done; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        const j = await ingestaJob(r.job_id);
        if (j && ['completed', 'failed'].includes(j.status)) done = j;
      }
      setUpJob(done || { status: 'timeout' });
      if (done && done.status === 'completed') {
        setMsg({ tipo: 'ok', txt: 'La IA extrajo y llenó los campos. Revisa/aprueba en Ingesta masiva.' });
        setUpFiles([]); setUpName(''); cargar();
      } else {
        setMsg({ tipo: 'err', txt: 'No se pudo extraer (revisa que el archivo tenga la info del proyecto).' });
      }
    } catch (e) { setMsg({ tipo: 'err', txt: e.message || 'Falló la subida.' }); setUpJob(null); }
    finally { setBusy(false); }
  };

  const cargar = useCallback(() => {
    listarDesarrolladores().then((d) => setDevs(d.desarrolladores || [])).catch(() => setDevs([]));
  }, []);
  useEffect(cargar, [cargar]);

  const crearDev = async () => {
    if (!dev.name) { setMsg({ tipo: 'err', txt: 'Escribe el nombre del desarrollador.' }); return; }
    if (!shell && (!dev.email || dev.password.length < 8)) { setMsg({ tipo: 'err', txt: 'Email y contraseña (8+) requeridos — o marca "cuenta vacía" para invitar después.' }); return; }
    setBusy(true); setMsg(null); setClaimLink(null);
    try {
      const payload = shell ? { name: dev.name, plan_tier: dev.plan_tier } : dev;
      const r = await altaDesarrollador(payload);
      if (r.status === 'pending_claim' && r.claim_path) {
        setClaimLink(`${window.location.origin}${r.claim_path}`);
        setMsg({ tipo: 'ok', txt: `Cuenta vacía de "${r.name}" creada. Cárgale sus proyectos y envíale este link para que la reclame con su email:` });
      } else {
        setMsg({ tipo: 'ok', txt: `Desarrollador "${r.name}" creado. Ya puede entrar con ${r.email}.` });
      }
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '2px 0 10px', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                <input type="checkbox" checked={shell} onChange={(e) => { setShell(e.target.checked); setClaimLink(null); }} data-testid="dev-shell" />
                Crear cuenta <b style={{ color: 'var(--cream)' }}>vacía</b> — sin email/contraseña; el dev la reclama con un link
              </label>
              {!shell && <Field label="Email del admin"><input style={inp} value={dev.email} onChange={(e) => setDev({ ...dev, email: e.target.value })} data-testid="dev-email" placeholder="admin@aurora.mx" /></Field>}
              {!shell && <Field label="Contraseña (8+)"><input style={inp} type="text" value={dev.password} onChange={(e) => setDev({ ...dev, password: e.target.value })} data-testid="dev-pass" placeholder="temporal, el dev la cambia" /></Field>}
              <Field label="Plan"><select style={inp} value={dev.plan_tier} onChange={(e) => setDev({ ...dev, plan_tier: e.target.value })}><option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></Field>
              <button onClick={crearDev} disabled={busy} style={btn(!busy)} data-testid="dev-crear">{shell ? 'Crear cuenta vacía' : 'Crear desarrollador'}</button>
              {claimLink && (
                <div data-testid="dev-claim-link" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.35)' }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', color: '#A5B4FC', marginBottom: 5 }}>Link para reclamar (envíaselo al dev)</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input readOnly value={claimLink} style={{ ...inp, flex: 1, fontSize: 11.5 }} onFocus={(e) => e.target.select()} data-testid="dev-claim-url" />
                    <button onClick={() => { navigator.clipboard?.writeText(claimLink); }} style={btn(true)} data-testid="dev-claim-copy">Copiar</button>
                  </div>
                </div>
              )}
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
          <div style={{ display: 'grid', gap: 14 }}>
            {/* UPLOAD DIRECTO — sube PDF/XLS/imágenes, la IA llena los campos sola */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <UploadCloud size={16} color="var(--theme)" /><b style={{ fontFamily: 'Outfit', fontSize: 16, color: 'var(--cream)' }}>Subir archivos (la IA llena todo)</b>
              </div>
              <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.65)', lineHeight: 1.55, marginBottom: 12 }}>
                Sube la ficha del proyecto (PDF, Excel/CSV o imágenes). Claude extrae nombre, ubicación, unidades, precios
                y amenidades, y los deja en la cola de revisión para aprobar.
              </p>
              <label htmlFor="up-files" data-testid="up-drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); setUpFiles(Array.from(e.dataTransfer.files || [])); }}
                style={{ display: 'block', padding: '26px 18px', borderRadius: 12, border: '1.5px dashed rgba(var(--theme-rgb),0.4)', background: 'rgba(var(--theme-rgb),0.04)', textAlign: 'center', cursor: 'pointer', marginBottom: 10 }}>
                <UploadCloud size={22} color="var(--theme)" style={{ marginBottom: 6 }} />
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>
                  {upFiles.length ? `${upFiles.length} archivo(s): ${upFiles.map((f) => f.name).join(', ').slice(0, 80)}` : 'Arrastra aquí o haz clic — PDF, XLS/CSV, JPG/PNG'}
                </div>
                <input id="up-files" type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }}
                  onChange={(e) => setUpFiles(Array.from(e.target.files || []))} data-testid="up-input" />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Nombre del proyecto (opcional)"><input style={inp} value={upName} onChange={(e) => setUpName(e.target.value)} placeholder="lo detecta la IA si lo dejas vacío" /></Field>
                <Field label="Asignar a desarrollador (opcional)">
                  <select style={inp} value={upDev} onChange={(e) => setUpDev(e.target.value)}>
                    <option value="">— sin asignar —</option>
                    {devs.map((d) => <option key={d.dev_org_id} value={d.dev_org_id}>{d.name}</option>)}
                  </select>
                </Field>
              </div>
              <button onClick={correrUpload} disabled={busy || upFiles.length === 0} style={btn(!busy && upFiles.length > 0)} data-testid="up-correr">
                {busy ? 'La IA está leyendo…' : 'Subir y extraer con IA'}
              </button>
              {upJob && upJob.status === 'completed' && upJob.items_auto_approved > 0 && (
                <div style={{ marginTop: 10, fontFamily: 'DM Sans', fontSize: 12.5, color: '#6EE7B7' }}>
                  ✓ Proyecto creado y publicado en el catálogo.
                </div>
              )}
              {upJob && upJob.status === 'completed' && upJob.items_pending_review > 0 && (
                <div style={{ marginTop: 10, fontFamily: 'DM Sans', fontSize: 12.5, color: '#FCD34D' }}>
                  Extraído — quedó en revisión (posible duplicado). <span onClick={() => nav('/superadmin/bulk-ingest')} style={{ color: 'var(--theme)', cursor: 'pointer', textDecoration: 'underline' }}>Revisar</span>
                </div>
              )}
            </div>

            {/* Drive — para lotes grandes */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Sparkles size={16} color="var(--theme)" /><b style={{ fontFamily: 'Outfit', fontSize: 15, color: 'var(--cream)' }}>…o carga masiva desde Google Drive</b>
              </div>
              <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.65)', lineHeight: 1.55, marginBottom: 12 }}>
                Una carpeta con una subcarpeta por proyecto = muchos proyectos de golpe (misma extracción IA + revisión).
              </p>
              <button onClick={() => nav('/superadmin/bulk-ingest')} style={{ ...btn(), background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,235,224,0.8)' }} data-testid="ir-ingesta">
                Ir a Ingesta masiva (Drive) <ArrowRight size={14} style={{ verticalAlign: -2 }} />
              </button>
            </div>
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

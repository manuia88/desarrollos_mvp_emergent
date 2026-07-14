/**
 * SuperadminAltaDesarrolladores — dar de alta desarrolladores y sus proyectos.
 * Dos caras: MANUAL (formularios aquí) y AUTOMATIZADO (ingesta masiva desde Google Drive, ya existe).
 * Reusa /api/superadmin/alta/* (backend superadmin_alta.py).
 */
import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { UserPlus, Building2, Check, UploadCloud, LayoutGrid, FolderUp, Layers, ListChecks, ChevronRight, Radar, Boxes } from 'lucide-react';
import { altaDesarrollador, listarDesarrolladores, altaProyecto, uploadIngesta, ingestaJob } from '../../api/superadminAlta';
import { fetchDriveOAuthUrl, listAllDriveConnections } from '../../api/drive';

// Componentes que se EMBEBEN aquí para unificar todo en un solo lugar (aceptan prop `embedded`).
const SuperadminBulkIngest = lazy(() => import('./SuperadminBulkIngest'));
const SuperadminGranularidad = lazy(() => import('./SuperadminGranularidad'));
const VigiaProto = lazy(() => import('./SuperadminVigia').then(m => ({ default: m.VigiaTab })));
const ProtoTab   = lazy(() => import('./SuperadminVigia').then(m => ({ default: m.PrototiposTab })));

const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '18px 20px' };
const inp = { width: '100%', padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', marginTop: 4 };
const lbl = { fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'rgba(240,235,224,0.6)' };
const btn = (on = true) => ({ padding: '10px 18px', borderRadius: 10, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: on ? 'pointer' : 'not-allowed', opacity: on ? 1 : 0.5, background: 'rgba(var(--theme-rgb),0.16)', border: '1px solid rgba(var(--theme-rgb),0.45)', color: 'var(--theme)' });

function Field({ label, children }) {
  return <label style={{ display: 'block', marginBottom: 10 }}><span style={lbl}>{label}</span>{children}</label>;
}

export default function SuperadminAltaDesarrolladores() {
  const nav = useNavigate();
  const [tab, setTab] = useState(new URLSearchParams(window.location.search).get('tab') || 'directorio');
  const [devs, setDevs] = useState([]);
  const [msg, setMsg] = useState(null);      // {tipo:'ok'|'err', txt}
  const [busy, setBusy] = useState(false);

  // form desarrollador
  const [dev, setDev] = useState({ name: '', email: '', password: '', plan_tier: 'pro', contact_email: '' });
  const [shell, setShell] = useState(false);      // crear cuenta VACÍA (sin credenciales) para reclamar después
  const [claimLink, setClaimLink] = useState(null);
  // form proyecto
  const [proj, setProj] = useState({ dev_org_id: '', name: '', colonia: '', alcaldia: '', total_units: '', price_from: '', tipo_proyecto: 'vertical', stage: 'preventa' });
  // upload IA (PDF/XLS/imágenes → la IA llena los campos)
  const [upFiles, setUpFiles] = useState([]);
  const [upName, setUpName] = useState('');
  const [upDev, setUpDev] = useState('');
  const [upNewDevName, setUpNewDevName] = useState('');   // crear dev al vuelo desde la carga masiva
  const [upJob, setUpJob] = useState(null);   // {status, extracted, ...}
  // Conexión de Drive (OAuth) — para carpetas grandes sin el límite del API key público.
  const [drive, setDrive] = useState(null);   // {configured, connected, email} | null
  const [driveMsg, setDriveMsg] = useState('');

  const cargarDrive = useCallback(() => {
    listAllDriveConnections()
      .then((d) => {
        const conns = d.connections || [];
        const on = conns.find((c) => c.status === 'connected');
        setDrive({ configured: d.configured !== false, connected: !!on, email: on?.email || on?.account_email || '' });
      })
      .catch(() => setDrive({ configured: true, connected: false, email: '' }));
  }, []);

  const conectarDrive = async () => {
    setDriveMsg('');
    const id = (upDev && upDev !== '__new__') ? upDev : (devs[0]?.dev_org_id || 'superadmin');
    try {
      const r = await fetchDriveOAuthUrl(id, 'superadmin');
      if (r && r.configured === false) { setDriveMsg(r.message || 'Falta configurar GOOGLE_OAUTH_* en el backend.'); return; }
      const url = r.authorization_url || r.auth_url;
      if (!url) { setDriveMsg('No se pudo obtener el link de autorización.'); return; }
      window.open(url, '_blank', 'noopener');
      setDriveMsg('Se abrió Google en otra pestaña. Autoriza tu cuenta, vuelve aquí y pulsa "Verificar".');
    } catch (e) { setDriveMsg(e.message || 'No se pudo iniciar la conexión.'); }
  };

  // Crea un desarrollador (cuenta vacía) SIN salir de la carga masiva y lo deja seleccionado.
  const crearDevDesdeCarga = async () => {
    if (!upNewDevName.trim()) { setMsg({ tipo: 'err', txt: 'Escribe el nombre del desarrollador nuevo.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await altaDesarrollador({ name: upNewDevName.trim(), plan_tier: 'pro' });
      await new Promise((res) => { listarDesarrolladores().then((d) => { setDevs(d.desarrolladores || []); res(); }).catch(res); });
      setUpDev(r.dev_org_id); setUpNewDevName('');
      setMsg({ tipo: 'ok', txt: `Desarrollador "${r.name}" creado (cuenta vacía) y seleccionado. Ya puedes subirle proyectos.` });
    } catch (e) { setMsg({ tipo: 'err', txt: e.message || 'No se pudo crear.' }); }
    finally { setBusy(false); }
  };

  const correrUpload = async () => {
    if (upFiles.length === 0) { setMsg({ tipo: 'err', txt: 'Arrastra o elige al menos un PDF/XLS/imagen.' }); return; }
    setBusy(true); setMsg(null); setUpJob({ status: 'extracting' });
    try {
      const r = await uploadIngesta(upFiles, upName, upDev === '__new__' ? '' : upDev);
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
  useEffect(() => { if (tab === 'masiva' && drive === null) cargarDrive(); }, [tab, drive, cargarDrive]);

  const crearDev = async () => {
    if (!dev.name) { setMsg({ tipo: 'err', txt: 'Escribe el nombre del desarrollador.' }); return; }
    if (!shell && (!dev.email || dev.password.length < 8)) { setMsg({ tipo: 'err', txt: 'Email y contraseña (8+) requeridos — o marca "cuenta vacía" para invitar después.' }); return; }
    setBusy(true); setMsg(null); setClaimLink(null);
    try {
      const contact = (dev.contact_email || '').trim();
      const payload = shell
        ? { name: dev.name, plan_tier: dev.plan_tier, contact_email: contact || undefined, claim_base: window.location.origin }
        : { name: dev.name, email: dev.email, password: dev.password, plan_tier: dev.plan_tier };
      const r = await altaDesarrollador(payload);
      if (r.status === 'pending_claim' && r.claim_path) {
        setClaimLink(`${window.location.origin}${r.claim_path}`);
        setMsg({ tipo: 'ok', txt: r.invite_sent
          ? `Cuenta vacía de "${r.name}" creada — le enviamos la invitación a ${r.contact_email}. También puedes copiar el link abajo.`
          : `Cuenta vacía de "${r.name}" creada. Cárgale sus proyectos y envíale este link para que la reclame con su email:` });
      } else {
        setMsg({ tipo: 'ok', txt: `Desarrollador "${r.name}" creado. Ya puede entrar con ${r.email}.` });
      }
      setDev({ name: '', email: '', password: '', plan_tier: 'pro', contact_email: '' });
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
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: 0 }}>Desarrolladores y desarrollos</h1>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.6)', marginBottom: 16 }}>
          Un solo lugar: da de alta desarrolladores, carga proyectos a mano o en lote con IA, revisa la granularidad de los datos y entra al directorio de cada dev.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[['directorio', 'Directorio', LayoutGrid], ['manual', 'Alta manual', UserPlus], ['masiva', 'Carga masiva (IA)', FolderUp], ['granularidad', 'Granularidad', ListChecks], ['vigia', 'Vigía', Radar], ['prototipos', 'Prototipos', Boxes]].map(([k, l, Ic]) => (
            <button key={k} data-testid={`alta-tab-${k}`} onClick={() => setTab(k)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 15px', borderRadius: 10, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                background: tab === k ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${tab === k ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: tab === k ? 'var(--theme)' : 'rgba(240,235,224,0.6)' }}><Ic size={13} />{l}</button>
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

        {tab === 'directorio' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
            {[
              { k: 'manual', t: 'Alta manual', s: 'Nuevo desarrollador + proyecto (rápido o wizard de 9 pasos).', Ic: UserPlus, go: () => setTab('manual') },
              { k: 'masiva', t: 'Carga masiva con IA', s: 'Sube PDF/Excel/fotos o una carpeta de Drive → la IA llena todo.', Ic: FolderUp, go: () => setTab('masiva') },
              { k: 'granularidad', t: 'Granularidad de datos', s: 'Qué tan completo está cada dato por colonia y proyecto.', Ic: ListChecks, go: () => setTab('granularidad') },
              { k: 'catalogo', t: 'Catálogo y aprobación', s: 'Todos los proyectos + cola para publicar al marketplace.', Ic: Layers, go: () => nav('/superadmin/desarrollos') },
              { k: 'vigia', t: 'Vigía de Drive', s: 'El robot ronda tu carpeta maestra cada hora y te avisa qué aprobar.', Ic: Radar, go: () => setTab('vigia') },
              { k: 'prototipos', t: 'Prototipos', s: 'Los moldes de cada desarrollo, medidos por código (no adivinados).', Ic: Boxes, go: () => setTab('prototipos') },
            ].map((c) => (
              <button key={c.k} onClick={c.go} data-testid={`dir-card-${c.k}`}
                style={{ ...card, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 7 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(var(--theme-rgb),0.45)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>
                <c.Ic size={18} color="var(--theme)" />
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: 'var(--cream)' }}>{c.t}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', lineHeight: 1.4 }}>{c.s}</div>
                <span style={{ marginTop: 2, fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, color: 'var(--theme)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>Abrir <ChevronRight size={12} /></span>
              </button>
            ))}
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

              {/* Modo de acceso — selector claro en vez del checkbox confuso */}
              <div style={{ marginBottom: 12 }}>
                <span style={{ ...lbl, display: 'block', marginBottom: 6 }}>¿Cómo va a entrar?</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[[false, 'Le pongo el acceso', 'Email y contraseña ahora'], [true, 'Invitar por link', 'Cuenta vacía, él la reclama']].map(([v, t, sub]) => (
                    <button key={String(v)} type="button" onClick={() => { setShell(v); setClaimLink(null); setMsg(null); }} data-testid={`dev-mode-${v ? 'shell' : 'creds'}`}
                      style={{ flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        background: shell === v ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${shell === v ? 'rgba(var(--theme-rgb),0.5)' : 'rgba(255,255,255,0.1)'}`, transition: 'all .12s' }}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, color: shell === v ? 'var(--theme)' : 'var(--cream)' }}>{t}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.5)', marginTop: 2, lineHeight: 1.3 }}>{sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {!shell && <Field label="Email del admin"><input style={inp} value={dev.email} onChange={(e) => setDev({ ...dev, email: e.target.value })} data-testid="dev-email" placeholder="admin@aurora.mx" /></Field>}
              {!shell && <Field label="Contraseña (8+)"><input style={inp} type="text" value={dev.password} onChange={(e) => setDev({ ...dev, password: e.target.value })} data-testid="dev-pass" placeholder="temporal, el dev la cambia" /></Field>}
              {shell && (
                <div style={{ marginBottom: 10, padding: '11px 13px', borderRadius: 11, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)' }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.72)', lineHeight: 1.5, marginBottom: 9 }}>
                    Creamos la cuenta con sus proyectos ya cargados. El dev la <b style={{ color: 'var(--cream)' }}>reclama</b> con su propio correo y contraseña.
                  </div>
                  <label style={{ display: 'block' }}>
                    <span style={lbl}>Correo del dev <span style={{ color: 'rgba(240,235,224,0.4)' }}>(opcional — le mandamos la invitación)</span></span>
                    <input style={inp} type="email" value={dev.contact_email} onChange={(e) => setDev({ ...dev, contact_email: e.target.value })} data-testid="dev-contact" placeholder="dev@empresa.mx" />
                  </label>
                </div>
              )}
              <Field label="Plan"><select style={inp} value={dev.plan_tier} onChange={(e) => setDev({ ...dev, plan_tier: e.target.value })}><option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></Field>
              <button onClick={crearDev} disabled={busy} style={btn(!busy)} data-testid="dev-crear">{shell ? (dev.contact_email.trim() ? 'Crear e invitar' : 'Crear cuenta') : 'Crear desarrollador'}</button>
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
                <Building2 size={16} color="var(--theme)" /><b style={{ fontFamily: 'Outfit', fontSize: 15, color: 'var(--cream)' }}>2. Cargar proyecto (wizard o alta rápida)</b>
              </div>
              <Field label="Desarrollador">
                <select style={inp} value={proj.dev_org_id} onChange={(e) => setProj({ ...proj, dev_org_id: e.target.value })} data-testid="proj-dev">
                  <option value="">— elige —</option>
                  {devs.map((d) => <option key={d.dev_org_id} value={d.dev_org_id}>{d.name}{d.status === 'pending_claim' ? ' · sin reclamar' : ''} ({d.proyectos})</option>)}
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => { const dv = devs.find((x) => x.dev_org_id === proj.dev_org_id); if (!proj.dev_org_id) { setMsg({ tipo: 'err', txt: 'Elige primero un desarrollador.' }); return; } nav(`/desarrollador/proyectos/nuevo?dev=${encodeURIComponent(proj.dev_org_id)}&devName=${encodeURIComponent(dv?.name || '')}`); }}
                  style={btn(true)} data-testid="proj-wizard">Cargar completo (wizard 9 pasos)</button>
                <button onClick={crearProyecto} disabled={busy} style={{ ...btn(!busy), background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,235,224,0.8)' }} data-testid="proj-crear">Alta rápida</button>
              </div>
              <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)', marginTop: 8 }}>El wizard captura todo (categoría, ubicación, amenidades, pagos, obra, legal…). La alta rápida crea solo lo básico; el resto se completa en su ficha.</p>
            </div>
          </div>
        )}

        {tab === 'masiva' && (
          <div style={{ display: 'grid', gap: 14 }}>
            {/* Conexión de Drive (OAuth) — sin el límite del API key público, para carpetas grandes */}
            <div style={{ ...card, padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              background: drive?.connected ? 'rgba(31,160,106,0.07)' : 'rgba(99,102,241,0.07)',
              border: `1px solid ${drive?.connected ? 'rgba(31,160,106,0.28)' : 'rgba(99,102,241,0.28)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: drive?.connected ? '#34D399' : '#A5B4FC', display: 'inline-block' }} />
                <div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>
                    {drive?.connected ? `Drive conectado${drive.email ? ` · ${drive.email}` : ''}` : 'Drive no conectado'}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)' }}>
                    {drive?.connected
                      ? 'Las carpetas de Drive se leen con tu cuota (sin bloqueos). Ideal para catálogos grandes.'
                      : 'Conecta tu Google una vez para leer carpetas grandes sin el límite del modo público.'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!drive?.connected && <button onClick={conectarDrive} style={btn(true)} data-testid="drive-connect">Conectar Drive</button>}
                <button onClick={cargarDrive} style={{ ...btn(true), background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,235,224,0.8)' }} data-testid="drive-verify">Verificar</button>
              </div>
            </div>
            {driveMsg && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#A5B4FC', marginTop: -6 }}>{driveMsg}</div>}

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
                <Field label="Desarrollador (asigna o crea uno nuevo)">
                  <select style={inp} value={upDev} onChange={(e) => setUpDev(e.target.value)} data-testid="up-dev">
                    <option value="">— sin asignar —</option>
                    <option value="__new__">➕ Crear desarrollador nuevo…</option>
                    {devs.map((d) => <option key={d.dev_org_id} value={d.dev_org_id}>{d.name}{d.status === 'pending_claim' ? ' · sin reclamar' : ''}</option>)}
                  </select>
                </Field>
              </div>
              {upDev === '__new__' && (
                <div style={{ display: 'flex', gap: 6, margin: '-2px 0 12px' }}>
                  <input style={{ ...inp, marginTop: 0 }} value={upNewDevName} onChange={(e) => setUpNewDevName(e.target.value)} placeholder="Nombre / empresa del nuevo desarrollador" data-testid="up-newdev" />
                  <button onClick={crearDevDesdeCarga} disabled={busy} style={{ ...btn(!busy), whiteSpace: 'nowrap' }} data-testid="up-newdev-crear">Crear y seleccionar</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={correrUpload} disabled={busy || upFiles.length === 0} style={btn(!busy && upFiles.length > 0)} data-testid="up-correr">
                  {busy ? 'La IA está leyendo…' : 'Subir y extraer con IA'}
                </button>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.4)' }}>o captúralo a mano →</span>
                <button
                  onClick={() => { const id = upDev && upDev !== '__new__' ? upDev : ''; if (!id) { setMsg({ tipo: 'err', txt: 'Elige (o crea) un desarrollador arriba para abrir el wizard.' }); return; } const dv = devs.find((x) => x.dev_org_id === id); nav(`/desarrollador/proyectos/nuevo?dev=${encodeURIComponent(id)}&devName=${encodeURIComponent(dv?.name || '')}`); }}
                  style={{ ...btn(true), background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,235,224,0.82)' }} data-testid="up-wizard">
                  Wizard 9 pasos
                </button>
              </div>
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

            {/* Consola COMPLETA de ingesta masiva (Drive + cola de revisión + aprobar), embebida aquí */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(240,235,224,0.45)', marginBottom: 6 }}>…o carga en lote desde Google Drive + cola de revisión</div>
              <Suspense fallback={<div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)', padding: 12 }}>Cargando consola de ingesta…</div>}>
                <SuperadminBulkIngest embedded />
              </Suspense>
            </div>
          </div>
        )}

        {tab === 'vigia' && (
          <Suspense fallback={<div style={{ fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.6)', padding: 20 }}>Cargando el vigía…</div>}>
            <VigiaProto />
          </Suspense>
        )}
        {tab === 'prototipos' && (
          <Suspense fallback={<div style={{ fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.6)', padding: 20 }}>Cargando prototipos…</div>}>
            <ProtoTab />
          </Suspense>
        )}
        {tab === 'granularidad' && (
          <Suspense fallback={<div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)', padding: 12 }}>Cargando granularidad…</div>}>
            <SuperadminGranularidad embedded />
          </Suspense>
        )}

        {tab === 'directorio' && (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', padding: '14px 16px 4px' }}>Directorio de desarrolladores ({devs.length})</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)', padding: '0 16px 10px' }}>Haz clic en un desarrollador para ver/editar/agregar sus proyectos.</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Desarrollador', 'Estado', 'Email', 'Plan', 'Proyectos'].map((c) => (
                <th key={c} style={{ textAlign: 'left', fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.5)', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{c}</th>))}</tr></thead>
              <tbody>
                {devs.map((d) => {
                  const pending = d.status === 'pending_claim';
                  const claimUrl = d.claim_path ? `${window.location.origin}${d.claim_path}` : null;
                  return (
                  <tr key={d.dev_org_id} data-testid={`dev-row-${d.dev_org_id}`}
                    onClick={() => nav(`/superadmin/alta/dev/${d.dev_org_id}`)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{d.name}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                        background: pending ? 'rgba(99,102,241,0.14)' : 'rgba(31,160,106,0.14)',
                        color: pending ? '#A5B4FC' : '#6EE7B7', border: `1px solid ${pending ? 'rgba(99,102,241,0.3)' : 'rgba(31,160,106,0.3)'}` }}>
                        {pending ? 'Sin reclamar' : 'Activo'}
                      </span>
                      {pending && claimUrl && (
                        <button onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(claimUrl); setMsg({ tipo: 'ok', txt: `Link de reclamo de "${d.name}" copiado.` }); }}
                          data-testid={`dev-copy-${d.dev_org_id}`}
                          style={{ marginLeft: 8, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,235,224,0.8)' }}>
                          Copiar link
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>{d.email || '—'}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>{d.plan_tier}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>{d.proyectos}</td>
                  </tr>
                  );
                })}
                {devs.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)' }}>Aún no hay desarrolladores. Crea el primero en "Manual".</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}
